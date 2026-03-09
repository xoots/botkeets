import { logger } from './logger.js';
import { DASHSCOPE_BASE_URL, DASHSCOPE_API_KEY } from './config.js';
// DashScope/Qwen API — OpenAI-compatible endpoint
function getQwenApiBase() {
    return DASHSCOPE_BASE_URL;
}
function getQwenApiKey() {
    return DASHSCOPE_API_KEY;
}
const MEM0_MODEL = 'qwen-plus'; // Qwen3.5-Plus on DashScope — $0.80/M input
const SYSTEM_PROMPT = `You are a memory extraction agent. Extract factual claims from the text.
Each claim must be concrete, about the project or working context, formatted as a bullet: "- [subject]: [fact]"
Maximum 15 bullets. Return ONLY the bullets, no preamble, no explanation.`;
export async function extractMem0Facts(content, projectId) {
    const truncated = content.slice(0, 6000);
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        const resp = await fetch(`${getQwenApiBase()}/chat/completions`, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getQwenApiKey()}`,
            },
            body: JSON.stringify({
                model: MEM0_MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: `Project: ${projectId}\n\nContent:\n${truncated}` },
                ],
                max_tokens: 600,
                temperature: 0,
            }),
        });
        clearTimeout(timeout);
        if (!resp.ok)
            throw new Error(`DashScope ${resp.status}`);
        const data = await resp.json();
        const facts = (data?.choices?.[0]?.message?.content ?? '').trim();
        return { facts, token_estimate: Math.ceil(facts.length / 4) };
    }
    catch (err) {
        logger.warn({ err, projectId }, 'mem0-extractor: DashScope call failed');
        return { facts: '', token_estimate: 0 };
    }
}
//# sourceMappingURL=memory-mem0-extractor.js.map