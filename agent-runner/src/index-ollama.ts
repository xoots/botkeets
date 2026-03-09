import { runOpenAICompatAgent } from './openai-compat-runner.js';

function toOllamaBaseUrl(host: string | undefined): string {
  const normalized = (host ?? 'http://localhost:11434').replace(/\/+$/, '').replace(/\/v1$/, '');
  return `${normalized}/v1`;
}

runOpenAICompatAgent({
  name: 'ollama',
  apiKeySecret: 'OLLAMA_API_KEY',
  baseURL: (secrets) => toOllamaBaseUrl(secrets.OLLAMA_HOST),
  defaultModel: 'qwen3:8b',
  modelEnvVar: 'OLLAMA_MODEL',
  historyDir: '.ollama-session',
});
