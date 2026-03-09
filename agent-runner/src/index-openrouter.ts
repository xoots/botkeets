/**
 * NanoClaw OpenRouter Agent Runner
 * Runs any model available on OpenRouter via its OpenAI-compatible API.
 * Activated when AGENT_RUNNER=openrouter env var is set in the container.
 * Model is controlled by the OPENROUTER_MODEL env var (e.g. "openai/gpt-4o").
 *
 * Same stdin/stdout protocol as index.ts (OUTPUT_START/END markers).
 */

import { runOpenAICompatAgent } from './openai-compat-runner.js';

runOpenAICompatAgent({
  name: 'openrouter',
  apiKeySecret: 'OPENROUTER_API_KEY',
  baseURL: 'https://openrouter.ai/api/v1',
  defaultModel: 'qwen/qwen3-coder-flash',
  modelEnvVar: 'OPENROUTER_MODEL',
  historyDir: '.openrouter-session',
});
