import { CLAUDE_CODE_OAUTH_TOKEN, DASHSCOPE_API_KEY, DASHSCOPE_BASE_URL, DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, OLLAMA_HOST, OPENROUTER_API_KEY, } from './config.js';
import { executeClaudeTextPrompt } from './claude-text-executor.js';
import { resolveEffectiveOllamaBaseUrl, resolveEffectiveProviderCredential, } from './keet-provider-config.js';
import { isOllamaAvailable, isRateLimitError } from './provider-strategy.js';
import { estimateTokens } from './context-manager.js';
import { extractOllamaUsage, extractOpenRouterUsage, } from './routing-logger.js';
import { formatInteractionPrompt, inferInteractionCaller, recordInteraction, } from './interaction-store.js';
export class AllLlmRoutesFailedError extends Error {
    attempts;
    constructor(attempts) {
        super(attempts.length > 0
            ? `All LLM routes failed: ${attempts.map((a) => `${a.provider}/${a.model}: ${a.error}`).join('; ')}`
            : 'All LLM routes failed');
        this.name = 'AllLlmRoutesFailedError';
        this.attempts = attempts;
    }
}
const DEFAULT_TIMEOUT_MS = {
    ollama: 15_000,
    claude: 30_000,
    anthropic: 30_000,
    openrouter: 30_000,
    dashscope: 60_000,
    deepseek: 30_000,
};
function normalizeProvider(provider) {
    return provider === 'anthropic' ? 'claude' : provider;
}
function estimateMessageTokens(messages) {
    return messages.reduce((total, message) => total + estimateTokens(message.content) + 4, 0);
}
function getModelPricing(provider, model) {
    const normalizedProvider = normalizeProvider(provider);
    const lowerModel = model.toLowerCase();
    if (normalizedProvider === 'ollama') {
        return { inputPerToken: 0, outputPerToken: 0 };
    }
    if (lowerModel.includes('claude-sonnet')) {
        return { inputPerToken: 3 / 1_000_000, outputPerToken: 15 / 1_000_000 };
    }
    if (lowerModel.includes('claude-haiku')) {
        return { inputPerToken: 0.8 / 1_000_000, outputPerToken: 4 / 1_000_000 };
    }
    if (lowerModel.includes('gpt-4o-mini')) {
        return { inputPerToken: 0.15 / 1_000_000, outputPerToken: 0.6 / 1_000_000 };
    }
    if (lowerModel.includes('gpt-4o')) {
        return { inputPerToken: 2.5 / 1_000_000, outputPerToken: 10 / 1_000_000 };
    }
    return { inputPerToken: 0, outputPerToken: 0 };
}
function estimateUsage(provider, model, messages, text) {
    const inputTokens = estimateMessageTokens(messages);
    const outputTokens = estimateTokens(text);
    const pricing = getModelPricing(provider, model);
    return {
        inputTokens,
        outputTokens,
        usdCost: inputTokens * pricing.inputPerToken + outputTokens * pricing.outputPerToken,
    };
}
function getTimeoutMs(route) {
    return route.timeoutMs ?? DEFAULT_TIMEOUT_MS[normalizeProvider(route.provider)];
}
function normalizeTextContent(content) {
    if (typeof content === 'string')
        return content.trim();
    if (!Array.isArray(content))
        return '';
    return content
        .flatMap((item) => {
        if (typeof item === 'string')
            return item;
        if (!item || typeof item !== 'object')
            return [];
        const text = 'text' in item && typeof item.text === 'string' ? item.text : '';
        return text ? [text] : [];
    })
        .join('\n')
        .trim();
}
function formatClaudePrompt(messages) {
    const systemPrompt = messages
        .filter((message) => message.role === 'system')
        .map((message) => message.content.trim())
        .filter(Boolean)
        .join('\n\n') || undefined;
    const conversationalMessages = messages.filter((message) => message.role !== 'system');
    if (conversationalMessages.length === 1 && conversationalMessages[0]?.role === 'user') {
        return {
            prompt: conversationalMessages[0].content,
            systemPrompt,
        };
    }
    const prompt = conversationalMessages
        .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
        .join('\n\n')
        .trim();
    return { prompt, systemPrompt };
}
function getOpenAiCompatCredential(provider) {
    switch (normalizeProvider(provider)) {
        case 'openrouter':
            return resolveEffectiveProviderCredential('openrouter', OPENROUTER_API_KEY, 'https://openrouter.ai/api/v1');
        case 'dashscope':
            return resolveEffectiveProviderCredential('dashscope', DASHSCOPE_API_KEY, DASHSCOPE_BASE_URL);
        case 'deepseek':
            return resolveEffectiveProviderCredential('deepseek', DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL);
        default:
            return { api_key: '', base_url: '' };
    }
}
async function runOllama(route, messages) {
    const ollama = resolveEffectiveOllamaBaseUrl(OLLAMA_HOST);
    const body = {
        model: route.model,
        messages,
        stream: false,
    };
    if (typeof route.think === 'boolean')
        body.think = route.think;
    const options = {};
    if (typeof route.temperature === 'number')
        options.temperature = route.temperature;
    if (typeof route.numPredict === 'number')
        options.num_predict = route.numPredict;
    if (Object.keys(options).length > 0)
        body.options = options;
    const response = await fetch(`${ollama.base_url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(getTimeoutMs(route)),
    });
    if (!response.ok) {
        throw new Error(`Ollama ${response.status}: ${await response.text()}`);
    }
    const raw = await response.json();
    return {
        text: raw.message?.content?.trim() ?? '',
        provider: 'ollama',
        model: route.model,
        usedFallback: false,
        usage: extractOllamaUsage(raw),
        raw,
    };
}
async function runClaude(route, messages, options) {
    if (!CLAUDE_CODE_OAUTH_TOKEN) {
        throw new Error('CLAUDE_CODE_OAUTH_TOKEN is required for Claude text calls');
    }
    const { prompt, systemPrompt } = formatClaudePrompt(messages);
    const text = await executeClaudeTextPrompt({
        prompt,
        systemPrompt,
        model: route.model,
        workspaceDir: options.workspaceDir ?? process.cwd(),
        timeoutMs: getTimeoutMs(route),
        settingSources: options.settingSources ?? [],
    });
    return {
        text: text.trim(),
        provider: 'claude',
        model: route.model,
        usedFallback: false,
        usage: estimateUsage('claude', route.model, messages, text),
        raw: text,
    };
}
async function runOpenAiCompatible(route, messages) {
    const provider = normalizeProvider(route.provider);
    const credential = getOpenAiCompatCredential(provider);
    if (!credential.api_key) {
        throw new Error(`Missing API key for ${provider}`);
    }
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${credential.api_key}`,
    };
    if (provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://nanoclaw.ai';
        headers['X-Title'] = 'nanoclaw-agent';
    }
    const body = {
        model: route.model,
        messages,
        stream: false,
    };
    if (typeof route.temperature === 'number')
        body.temperature = route.temperature;
    if (typeof route.maxTokens === 'number')
        body.max_tokens = route.maxTokens;
    const response = await fetch(`${credential.base_url.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(getTimeoutMs(route)),
    });
    if (!response.ok) {
        throw new Error(`${provider} ${response.status}: ${await response.text()}`);
    }
    const raw = await response.json();
    const text = normalizeTextContent(raw.choices?.[0]?.message?.content);
    const pricing = getModelPricing(provider, route.model);
    return {
        text,
        provider,
        model: route.model,
        usedFallback: false,
        usage: raw.usage
            ? extractOpenRouterUsage(raw, pricing.inputPerToken, pricing.outputPerToken)
            : estimateUsage(provider, route.model, messages, text),
        raw,
    };
}
async function runSingleRoute(route, options) {
    const provider = normalizeProvider(route.provider);
    if (provider === 'ollama') {
        if (route.preflightAvailability && !isOllamaAvailable()) {
            throw new Error('Ollama unavailable');
        }
        return await runOllama(route, options.messages);
    }
    if (provider === 'claude') {
        return await runClaude(route, options.messages, options);
    }
    return await runOpenAiCompatible(route, options.messages);
}
export function stripMarkdownCodeFences(text) {
    return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}
export async function runLlm(options) {
    if (options.routes.length === 0) {
        throw new AllLlmRoutesFailedError([]);
    }
    const attempts = [];
    const failedProviders = new Set();
    const dedupeProviderFailures = options.dedupeProviderFailures ?? false;
    const caller = options.caller ?? inferInteractionCaller();
    const promptPreview = formatInteractionPrompt(options.messages);
    for (let index = 0; index < options.routes.length; index += 1) {
        const route = options.routes[index];
        const provider = normalizeProvider(route.provider);
        if (dedupeProviderFailures && failedProviders.has(provider)) {
            const error = 'Skipped after earlier provider failure';
            attempts.push({ provider, model: route.model, error, skipped: true });
            options.onRouteFailure?.({
                route,
                error,
                isRateLimit: false,
                skipped: true,
            });
            continue;
        }
        const startedAt = Date.now();
        try {
            const result = await runSingleRoute(route, options);
            recordInteraction({
                provider: result.provider,
                model: result.model,
                caller,
                promptPreview,
                responsePreview: result.text,
                inputTokens: result.usage.inputTokens,
                outputTokens: result.usage.outputTokens,
                estimatedCostUsd: result.usage.usdCost,
                durationMs: Date.now() - startedAt,
                success: true,
            });
            return {
                ...result,
                usedFallback: index > 0,
            };
        }
        catch (err) {
            const durationMs = Date.now() - startedAt;
            const error = err instanceof Error ? err.message : String(err);
            const isRateLimit = isRateLimitError(error);
            attempts.push({ provider, model: route.model, error, skipped: false });
            failedProviders.add(provider);
            const usage = estimateUsage(provider, route.model, options.messages, '');
            recordInteraction({
                provider,
                model: route.model,
                caller,
                promptPreview,
                responsePreview: '',
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                estimatedCostUsd: usage.usdCost,
                durationMs,
                success: false,
                error,
            });
            options.onRouteFailure?.({
                route,
                error,
                isRateLimit,
                skipped: false,
            });
        }
    }
    throw new AllLlmRoutesFailedError(attempts);
}
//# sourceMappingURL=llm-router.js.map