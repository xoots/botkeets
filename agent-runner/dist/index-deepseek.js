import { runOpenAICompatAgent } from './openai-compat-runner.js';
runOpenAICompatAgent({
    name: 'deepseek',
    apiKeySecret: 'DEEPSEEK_API_KEY',
    baseURL: (secrets) => secrets.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-reasoner',
    modelEnvVar: 'DEEPSEEK_MODEL',
    historyDir: '.deepseek-session',
});
