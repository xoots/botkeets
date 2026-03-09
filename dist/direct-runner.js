/**
 * NanoClaw Direct Runner
 *
 * Fast path that bypasses container spin-up for social, chat, and business messages.
 * Container is only used for complex tasks that need tool access (files, bash, etc).
 *
 * Tier routing:
 *   social / chat  → nanbeige4.1 direct (~500ms, free)
 *                  → smollm2 fallback if nanbeige4.1 fails
 *   business       → Claude Agent SDK via OAuth (~1-2s)
 *                  → openrouter:anthropic/claude-3-5-sonnet on rate limit (same prompts)
 *                  → phi4-mini local last resort
 *   complex        → return false → container runner handles it
 */
import { logger } from './logger.js';
import { formatMessages, formatOutbound } from './router.js';
import { deactivateProvider } from './provider-strategy.js';
import { ASSISTANT_NAME, COPAW_ENABLED } from './config.js';
import { routeMessage } from './mode-router.js';
import { webSearch, formatSearchResults } from './web-search.js';
import { resolveExecutionLaneDecision } from './execution-routing.js';
import { getKeetProviderCapability } from './keet-provider-config.js';
import { executeCoPawLane, getCoPawLaneHealth } from './copaw-lane-bridge.js';
import { appendExecutionRunHistory } from './execution-run-history.js';
import { markCoPawBridgeFailure, markLaneFallback, markLaneRun } from './runtime-split.js';
import { sanitizeInput } from './hardening-schemas.js';
import { runLlm } from './llm-router.js';
// Pure ack/greeting — safe for local model, no factual grounding needed
const GREETING_REGEX = /^(hi|hello|hey|sup|yo|thanks|thank you|thx|ty|ok|okay|k|sure|cool|great|got it|sounds good|lol|haha|np|yep|yup|nope|no|yes|wow|nice|perfect|awesome|good|fine|alright|noted|understood|copy|roger|will do|done|makes sense|indeed|right|true|fair|agreed|exactly)[\s!?.🎉😊👍🙏✅👌🙌]*$/i;
// Business/marketing data keywords → needs reliable model
const BUSINESS_KEYWORDS = /\b(roas|cpc|ctr|cpa|campaign|campaigns|spend|budget|ad\b|ads\b|keyword|keywords|impression|impressions|click|clicks|conversion|conversions|competitor|competitors|seo|revenue|roi|metric|metrics|report|analysis|performance|google ads|bing|meta\b|facebook|ad copy|creative|creatives|landing page|quality score|bid|bidding|ad spend|cost per)\b/i;
// Needs tool use / container filesystem access
const COMPLEX_INDICATORS = /```[\s\S]|write\s+(a\s+)?(file|script|code)|create\s+(a\s+)?(file|script)|edit\s+(a\s+)?file|debug|fix\s+(a\s+)?bug|analyze\s+(the\s+)?codebase|schedule\s+(a\s+)?task|spawn\s+(a\s+)?(sub)?agent|set\s+up|configure|deploy|bash\s+command|terminal|run\s+(a\s+)?command/i;
export function classifyIntent(messages) {
    const raw = messages.map((m) => m.content).join(' ').trim();
    const combined = sanitizeInput(raw);
    if (!combined)
        return 'chat';
    // Complex always wins — needs container tools
    if (COMPLEX_INDICATORS.test(combined))
        return 'complex';
    // Business data question — needs reliable cloud model
    if (BUSINESS_KEYWORDS.test(combined))
        return 'business';
    // Pure greeting/ack — fast local response is fine
    if (GREETING_REGEX.test(combined))
        return 'social';
    // General conversation — local model handles it
    return 'chat';
}
// ── System prompts ─────────────────────────────────────────────────────────────
const CHAT_SYSTEM_PROMPT = `You are ${ASSISTANT_NAME}, a helpful personal AI assistant. \
Respond naturally and conversationally. Keep it brief. \
Do not make assumptions about the user's personal life, profession, or location. \
If asked a factual question you're unsure about, say you'd need to look it up.`;
const RESEARCH_SYSTEM_PROMPT = `You are ${ASSISTANT_NAME}, a helpful personal AI assistant with web search capability. \
Answer factual questions using the provided search results. Cite sources when available. \
Keep responses concise and accurate. Do not speculate beyond what the data shows.`;
const BUSINESS_SYSTEM_PROMPT = `You are ${ASSISTANT_NAME}, a helpful assistant with business and analytics expertise. \
Answer questions about campaigns, SEO, competitor analysis, and metrics clearly and concisely. \
If you need specific data to answer accurately, say so — do not invent numbers.`;
function isDirectLlmProvider(provider) {
    return provider !== 'perplexity';
}
// ── Orchestrator ───────────────────────────────────────────────────────────────
/**
 * Attempt to handle the message directly (no container).
 * Returns true if handled, false to let container-runner take over.
 *
 * Now mode-router aware: picks provider/model from ProviderPlan,
 * injects web search context when plan.needsWebSearch is true,
 * and walks the fallback chain on failure.
 */
export async function runDirectForGroup(groupJid, telegram, messages, intent, routingContext, forcedClassification, options) {
    const runStartedAt = Date.now();
    const directTaskId = `direct-${groupJid}-${runStartedAt}`;
    // Complex intent always needs a container
    if (intent === 'complex') {
        return { handled: false, lane_used: 'keet', fallback_reason: 'complex_intent' };
    }
    const combinedContent = messages.map((m) => m.content).join('\n');
    let userMessage = formatMessages(messages);
    let responseText = '';
    try {
        await telegram.setTyping?.(groupJid, true);
        // ── 1. Get the routing plan (mode-aware, classifier-backed) ───────────────
        let plan;
        try {
            plan = await routeMessage(groupJid, combinedContent, routingContext, forcedClassification);
        }
        catch (err) {
            logger.warn({ groupJid, err }, 'routeMessage failed — using intent-based fallback');
            // Fallback: use original intent-based heuristic
            plan = {
                provider: (intent === 'social' || intent === 'chat') ? 'dashscope' : 'deepseek',
                model: (intent === 'social' || intent === 'chat') ? 'qwen3.5-plus' : 'deepseek-reasoner',
                fallbacks: [{ provider: 'dashscope', model: 'qwen3.5-plus' }],
                needsWebSearch: false,
                needsContainer: false,
                resolvedMode: (intent === 'social' || intent === 'chat') ? 'eco' : 'standard',
            };
        }
        // Container-required tasks (code/complex from mode-router) → defer
        if (plan.needsContainer) {
            logger.info({ groupJid, intent }, 'Plan requires container — deferring');
            return { handled: false, lane_used: 'keet', fallback_reason: 'requires_container' };
        }
        const laneDecision = resolveExecutionLaneDecision({
            effective_mode: routingContext?.effective_mode ?? (plan.resolvedMode === 'auto' ? 'standard' : plan.resolvedMode),
            classification: plan.classification,
            needs_container: plan.needsContainer,
            intent,
            copaw_enabled: COPAW_ENABLED,
            copaw_healthy: !getCoPawLaneHealth().circuit_open,
        });
        const selectedLane = routingContext?.lane ?? plan.lane ?? laneDecision.lane;
        const selectedLaneReason = routingContext?.lane_reason ?? plan.laneReason ?? laneDecision.reason;
        let fallbackReason;
        if (selectedLane === 'copaw_orchestrator') {
            const copawResult = await executeCoPawLane({
                task_id: directTaskId,
                chat_jid: groupJid,
                prompt: userMessage,
                routing_context: {
                    ...routingContext,
                    intent,
                    lane: selectedLane,
                    lane_reason: selectedLaneReason,
                    mode: plan.resolvedMode,
                    provider: plan.provider,
                    model: plan.model,
                },
            });
            if (copawResult.ok) {
                const output = formatOutbound(copawResult.outputs?.[0] ?? copawResult.summary ?? '');
                if (output)
                    await telegram.sendMessage(groupJid, output);
                markLaneRun('copaw_orchestrator');
                appendExecutionRunHistory({
                    ts: new Date().toISOString(),
                    task_id: directTaskId,
                    chat_jid: groupJid,
                    path_used: 'copaw',
                    lane_used: 'copaw_orchestrator',
                    success: true,
                    latency_ms: Date.now() - runStartedAt,
                    fallback_reason: undefined,
                });
                return { handled: true, lane_used: 'copaw' };
            }
            fallbackReason = copawResult.fallback_reason || 'copaw_fallback';
            markLaneFallback(fallbackReason);
            markCoPawBridgeFailure();
            logger.warn({ groupJid, fallbackReason }, 'CoPaw lane failed — deterministic fallback to KEET lane');
        }
        // ── 2. Optionally inject web search context ───────────────────────────────
        if (plan.needsWebSearch) {
            const usePro = plan.resolvedMode === 'pro';
            try {
                const searchResult = await webSearch(combinedContent.slice(0, 200), usePro);
                const searchContext = formatSearchResults(searchResult);
                if (searchContext) {
                    userMessage = `[Web search results]\n${searchContext}\n\n[User message]\n${userMessage}`;
                    logger.info({ groupJid, provider: searchResult.provider }, 'Web search injected');
                }
                else {
                    const warningNote = searchResult.warning || 'Web search was requested but no results were available. Answer from your knowledge and note you could not verify with current data.';
                    userMessage = `[Note: ${warningNote}]\n\n[User message]\n${userMessage}`;
                    logger.warn({ groupJid, warning: searchResult.warning }, 'Web search empty');
                }
            }
            catch (err) {
                logger.warn({ groupJid, err }, 'Web search failed — proceeding without it');
            }
        }
        // ── 3. Pick the right system prompt ──────────────────────────────────────
        const classType = plan.classification?.task_type;
        const systemPrompt = classType === 'research' ? RESEARCH_SYSTEM_PROMPT :
            classType === 'business' ? BUSINESS_SYSTEM_PROMPT :
                CHAT_SYSTEM_PROMPT;
        // ── 4. Try primary provider, then walk fallback chain ─────────────────────
        const providers = [plan, ...plan.fallbacks.map((f) => ({ ...f, needsWebSearch: false, needsContainer: false, fallbacks: [], resolvedMode: plan.resolvedMode }))];
        const routes = providers
            .filter((providerPlan) => {
            if (!isDirectLlmProvider(providerPlan.provider)) {
                logger.warn({ groupJid, provider: providerPlan.provider }, 'Skipping non-LLM direct provider');
                return false;
            }
            const capability = getKeetProviderCapability(providerPlan.provider === 'claude' ? 'anthropic' : providerPlan.provider);
            if (!capability.compatible_with_keet) {
                logger.warn({ groupJid, provider: providerPlan.provider }, 'Skipping incompatible direct provider');
                return false;
            }
            return true;
        })
            .map((providerPlan) => ({
            provider: providerPlan.provider,
            model: providerPlan.model,
            preflightAvailability: providerPlan.provider === 'ollama',
        }));
        if (routes.length > 0) {
            const llmResult = await runLlm({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ],
                routes,
                workspaceDir: process.cwd(),
                settingSources: [],
                dedupeProviderFailures: true,
                onRouteFailure: ({ route, error, isRateLimit, skipped }) => {
                    if (skipped) {
                        logger.debug({ groupJid, provider: route.provider }, 'Skipping already-failed provider');
                        return;
                    }
                    if (isRateLimit) {
                        logger.warn({ groupJid, provider: route.provider, model: route.model }, '⚠️  Rate-limited — trying next provider');
                        deactivateProvider(groupJid, route.provider);
                        return;
                    }
                    logger.warn({ groupJid, provider: route.provider, model: route.model, err: error }, 'Provider error — trying next');
                },
            });
            responseText = llmResult.text;
            logger.info({ groupJid, provider: llmResult.provider, model: llmResult.model, intent, responseLen: responseText.length }, 'Direct LLM response');
        }
        if (!responseText) {
            const laneUsed = fallbackReason ? 'fallback' : 'keet';
            appendExecutionRunHistory({
                ts: new Date().toISOString(),
                task_id: directTaskId,
                chat_jid: groupJid,
                path_used: laneUsed,
                lane_used: 'keet_execution',
                success: false,
                latency_ms: Date.now() - runStartedAt,
                fallback_reason: fallbackReason,
            });
            // Chat/social messages should NEVER silently drop — they don't benefit from
            // container fallback. Notify the user and mark as handled so the pipeline
            // doesn't try to spin up a container for a simple greeting.
            if (intent === 'chat' || intent === 'social') {
                logger.error({ groupJid, intent }, 'All providers exhausted for chat/social — notifying user');
                try {
                    await telegram.sendMessage(groupJid, '⚠️ Sorry, I\'m having trouble reaching my AI providers right now. Please try again in a moment.');
                }
                catch (sendErr) {
                    logger.error({ groupJid, err: sendErr }, 'Failed to send provider-exhaustion notice');
                }
                return { handled: true, lane_used: laneUsed, fallback_reason: 'all_providers_exhausted' };
            }
            if (options?.allowContainerFallback === false) {
                logger.warn({ groupJid }, 'All direct providers exhausted — container fallback disabled');
                return { handled: false, lane_used: laneUsed, fallback_reason: fallbackReason };
            }
            logger.warn({ groupJid }, 'All direct providers exhausted — falling back to container');
            return { handled: false, lane_used: laneUsed, fallback_reason: fallbackReason };
        }
        // ── 5. Send the response ──────────────────────────────────────────────────
        const text = formatOutbound(responseText);
        if (text) {
            await telegram.sendMessage(groupJid, text);
        }
        markLaneRun('keet_execution');
        appendExecutionRunHistory({
            ts: new Date().toISOString(),
            task_id: directTaskId,
            chat_jid: groupJid,
            path_used: fallbackReason ? 'fallback' : 'keet',
            lane_used: 'keet_execution',
            success: true,
            latency_ms: Date.now() - runStartedAt,
            fallback_reason: fallbackReason,
        });
        return { handled: true, lane_used: fallbackReason ? 'fallback' : 'keet', fallback_reason: fallbackReason };
    }
    catch (err) {
        logger.error({ groupJid, err }, 'Direct runner unexpected error — falling back to container');
        const fallbackReason = err instanceof Error ? `direct_runner_error:${err.name}` : 'direct_runner_error';
        appendExecutionRunHistory({
            ts: new Date().toISOString(),
            task_id: directTaskId,
            chat_jid: groupJid,
            path_used: 'fallback',
            lane_used: 'keet_execution',
            success: false,
            latency_ms: Date.now() - runStartedAt,
            fallback_reason: fallbackReason,
        });
        return { handled: false, lane_used: 'fallback', fallback_reason: fallbackReason };
    }
    finally {
        await telegram.setTyping?.(groupJid, false);
    }
}
//# sourceMappingURL=direct-runner.js.map