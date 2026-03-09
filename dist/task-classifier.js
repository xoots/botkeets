/**
 * Task Classifier
 *
 * Uses qwen3:8b locally to classify each message before spending any cloud tokens.
 * Falls back to a fast rule-based heuristic if Ollama is unavailable.
 *
 * Output schema:
 * {
 *   task_type:        'social' | 'chat' | 'business' | 'research' | 'code' | 'complex'
 *   complexity:       'low' | 'medium' | 'high'
 *   quality_stakes:   'low' | 'medium' | 'high'   // how bad is a wrong answer?
 *   recommended_mode: 'eco' | 'standard' | 'pro'
 *   reasoning:        string  (brief, ≤ 20 words)
 *   agent_type?:      'general' | 'code' | 'research' | 'creative'  // routing hint
 *   model_tier?:      'eco' | 'standard' | 'pro'                    // model capability tier
 *   project_id?:      string | null                                  // inferred project
 * }
 *
 * The classifier result drives the mode-router to pick the right provider tier.
 * With /think disabled (qwen3 default off), classification takes ~200-400ms.
 */
import { DASHSCOPE_BASE_URL, DASHSCOPE_API_KEY } from './config.js';
import { logger } from './logger.js';
import { emitSignal } from './memory-signal-emitter.js';
import { resolveProjectIdFromContent } from './memory-project-resolver.js';
import { appendTaskEmbedding } from './db.js';
import { sanitizeInput } from './hardening-schemas.js';
import { runLlm, stripMarkdownCodeFences } from './llm-router.js';
const CLASSIFIER_MODEL = process.env.CLASSIFIER_MODEL || 'qwen3:8b';
const SIDECAR_URL = process.env.CLASSIFIER_SIDECAR_URL || 'http://localhost:8765';
const SYSTEM_PROMPT = `You are a routing classifier. Analyse the user message and return ONLY valid JSON with these exact keys:
- task_type: one of "social", "chat", "business", "research", "code", "complex"
- complexity: one of "low", "medium", "high"
- quality_stakes: one of "low", "medium", "high"
- recommended_mode: one of "eco", "standard", "pro"
- reasoning: brief explanation in ≤ 15 words
- agent_type: one of "general", "code", "research", "creative" (optional, default "general")
- model_tier: one of "eco", "standard", "pro" (optional, default "standard")
- project_id: string or null (optional, inferred project name if obvious, else null)

Routing guide:
  social/chat + low complexity  → eco      (local model, fast, free)
  business/research + medium    → standard (Haiku or Perplexity, balanced)
  code/complex + high stakes    → standard (temporary clamp; pro disabled)

Agent type guide:
  code tasks         → "code"
  research/business  → "research"
  creative writing   → "creative"
  everything else    → "general"

Return ONLY the JSON object, no markdown, no extra text.`;
/**
 * Call qwen3:8b via Ollama to classify the message.
 * Returns null if the call fails (caller should use rule-based fallback).
 */
async function classifyViaOllama(content) {
    try {
        const raw = (await runLlm({
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: content.slice(0, 800) },
            ],
            routes: [{
                    provider: 'ollama',
                    model: CLASSIFIER_MODEL,
                    timeoutMs: 8_000,
                    think: false,
                    temperature: 0,
                    numPredict: 200,
                }],
        })).text.trim();
        const jsonStr = stripMarkdownCodeFences(raw);
        const parsed = JSON.parse(jsonStr);
        // Basic validation
        const validTypes = ['social', 'chat', 'business', 'research', 'code', 'complex'];
        const validModes = ['eco', 'standard', 'pro', 'auto'];
        if (!validTypes.includes(parsed.task_type))
            return null;
        if (!validModes.includes(parsed.recommended_mode))
            return null;
        return parsed;
    }
    catch (err) {
        logger.debug({ err }, 'qwen3 classifier failed — using rule-based fallback');
        return null;
    }
}
async function classifyViaSidecar(content) {
    try {
        const response = await fetch(`${SIDECAR_URL}/classify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: content.slice(0, 300) }),
            signal: AbortSignal.timeout(2000), // 2s max — sidecar should be <200ms
        });
        if (!response.ok)
            return null;
        const data = (await response.json());
        if (data.fallback)
            return null; // no route cleared threshold — fall through to Ollama
        // Map sidecar route name → full ClassifierResult
        const routeMap = {
            social: { task_type: 'social', complexity: 'low', quality_stakes: 'low', recommended_mode: 'eco', reasoning: `sidecar:${data.score.toFixed(2)}` },
            chat: { task_type: 'chat', complexity: 'low', quality_stakes: 'medium', recommended_mode: 'eco', reasoning: `sidecar:${data.score.toFixed(2)}` },
            business: { task_type: 'business', complexity: 'medium', quality_stakes: 'high', recommended_mode: 'standard', reasoning: `sidecar:${data.score.toFixed(2)}` },
            research: { task_type: 'research', complexity: 'medium', quality_stakes: 'medium', recommended_mode: 'standard', reasoning: `sidecar:${data.score.toFixed(2)}` },
            code: { task_type: 'code', complexity: 'high', quality_stakes: 'high', recommended_mode: 'standard', reasoning: `sidecar:${data.score.toFixed(2)}` },
            complex: { task_type: 'complex', complexity: 'high', quality_stakes: 'high', recommended_mode: 'standard', reasoning: `sidecar:${data.score.toFixed(2)}` },
        };
        return routeMap[data.route] ?? null;
    }
    catch {
        // Sidecar down or timed out — fall through silently to Ollama
        return null;
    }
}
// ── Rule-based fallback ────────────────────────────────────────────────────────
const SOCIAL_RE = /^(hi|hello|hey|sup|yo|thanks|thank you|thx|ty|ok|okay|k|sure|cool|great|got it|sounds good|lol|haha|np|yep|yup|nope|no|yes|wow|nice|perfect|awesome|good|fine|alright|noted|understood|copy|roger|will do|done|makes sense|indeed|right|true|fair|agreed|exactly)[\s!?.🎉😊👍🙏✅👌🙌]*$/i;
const CODE_RE = /\b(code|script|function|class|api|endpoint|build|debug|error|bug|test|deploy|dockerfile|github|git|sql|database|schema|typescript|python|javascript|rust|bash|shell|refactor|auth|handler|middleware|component)\b/i;
const RESEARCH_RE = /\b(research|find|search|look\s?up|what is|what's|what are|who is|who's|how does|how do|how is|how's|when is|when does|when's|where is|where's|weather|forecast|temperature|climate|price|cost|current|latest|today|tonight|tomorrow|news|explain|summarise|summarize|compare|analyse|analyze|report|article)\b/i;
const BUSINESS_RE = /\b(roas|cpc|ctr|cpa|campaign|spend|budget|ad\b|ads\b|keyword|impression|conversion|competitor|seo|revenue|roi|metric|report|performance|google ads|meta\b|facebook|ad copy|landing page|bid|bidding)\b/i;
function ruleBasedClassify(content) {
    const lower = content.toLowerCase().trim();
    if (SOCIAL_RE.test(lower)) {
        return { task_type: 'social', complexity: 'low', quality_stakes: 'low', recommended_mode: 'eco', reasoning: 'Simple social greeting', agent_type: 'general', model_tier: 'eco', project_id: null };
    }
    if (CODE_RE.test(lower)) {
        const complex = lower.length > 200;
        return { task_type: 'code', complexity: complex ? 'high' : 'medium', quality_stakes: 'high', recommended_mode: 'standard', reasoning: 'Code task detected', agent_type: 'code', model_tier: 'standard', project_id: null };
    }
    if (BUSINESS_RE.test(lower)) {
        return { task_type: 'business', complexity: 'medium', quality_stakes: 'high', recommended_mode: 'standard', reasoning: 'Business/marketing context', agent_type: 'research', model_tier: 'standard', project_id: null };
    }
    if (RESEARCH_RE.test(lower)) {
        return { task_type: 'research', complexity: 'medium', quality_stakes: 'medium', recommended_mode: 'standard', reasoning: 'Research or lookup request', agent_type: 'research', model_tier: 'standard', project_id: null };
    }
    // Default: treat as general chat
    const complex = lower.length > 300;
    return {
        task_type: 'chat',
        complexity: complex ? 'medium' : 'low',
        quality_stakes: 'medium',
        recommended_mode: complex ? 'standard' : 'eco',
        reasoning: 'General chat message',
        agent_type: 'general',
        model_tier: 'standard',
        project_id: null,
    };
}
export function classifyTaskReadOnly(content) {
    return { ...ruleBasedClassify(content), usedFallback: true };
}
// ── DashScope embedding generation ───────────────────────────────────────────
const EMBEDDING_MODEL = 'text-embedding-v3';
async function generateTaskEmbedding(content) {
    const apiKey = DASHSCOPE_API_KEY;
    if (!apiKey)
        return null;
    const baseUrl = DASHSCOPE_BASE_URL;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const resp = await fetch(`${baseUrl}/embeddings`, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: EMBEDDING_MODEL,
                input: content.slice(0, 2000),
            }),
        });
        clearTimeout(timeoutId);
        if (!resp.ok)
            return null;
        const data = await resp.json();
        return data?.data?.[0]?.embedding ?? null;
    }
    catch (err) {
        logger.debug({ err }, 'DashScope embedding call failed');
        return null;
    }
}
// ── Public API ─────────────────────────────────────────────────────────────────
/**
 * Classify a message, trying qwen3:8b first, falling back to rule-based.
 *
 * @param content  The raw message text (already stripped of trigger/override prefix)
 * @param useLocal Whether to attempt the Ollama classifier (default: true)
 */
export async function classifyTask(content, useLocal = true) {
    // Hardening: sanitize input before classification
    content = sanitizeInput(content);
    if (!content) {
        return { ...ruleBasedClassify(''), usedFallback: true };
    }
    let result;
    // 1. Semantic router sidecar — ~50ms, no LLM inference, zero RAM overhead
    const sidecarResult = await classifyViaSidecar(content);
    if (sidecarResult) {
        logger.debug({ route: sidecarResult.task_type }, 'classifier: sidecar hit');
        result = { ...sidecarResult, usedFallback: false };
    }
    else if (useLocal) {
        // 2. qwen3:8b via Ollama — ~400ms, used when sidecar is down or returned fallback
        const ollamaResult = await classifyViaOllama(content);
        if (ollamaResult) {
            result = { ...ollamaResult, usedFallback: false };
        }
        else {
            // 3. Rule-based last resort
            result = { ...ruleBasedClassify(content), usedFallback: true };
        }
    }
    else {
        // 3. Rule-based last resort
        result = { ...ruleBasedClassify(content), usedFallback: true };
    }
    // Memory signal emission — fire-and-forget, never blocks or throws into caller
    setImmediate(() => {
        try {
            const projectId = resolveProjectIdFromContent(content);
            if (projectId) {
                const isDirectQuery = result.task_type === 'complex' || result.task_type === 'code' || result.task_type === 'business';
                emitSignal(projectId, isDirectQuery ? 'direct_query' : 'semantic_proximity', isDirectQuery ? 1.0 : 0.8);
            }
        }
        catch { /* silently ignore — memory must never crash classification */ }
    });
    // Task embedding generation — fire-and-forget, enables alpha scoring
    setImmediate(() => {
        try {
            const projectId = resolveProjectIdFromContent(content);
            if (projectId) {
                generateTaskEmbedding(content)
                    .then(embedding => {
                    if (embedding)
                        appendTaskEmbedding(projectId, embedding);
                })
                    .catch(err => logger.debug({ err }, 'task embedding generation failed'));
            }
        }
        catch { /* silently ignore — memory must never crash classification */ }
    });
    return result;
}
//# sourceMappingURL=task-classifier.js.map