import { runOpenAICompatAgent } from './openai-compat-runner.js';
runOpenAICompatAgent({
    name: 'dashscope',
    apiKeySecret: 'DASHSCOPE_API_KEY',
    baseURL: (secrets) => secrets.DASHSCOPE_BASE_URL ?? 'https://coding-intl.dashscope.aliyuncs.com/v1',
    defaultModel: 'qwen3.5-plus',
    modelEnvVar: 'DASHSCOPE_MODEL',
    historyDir: '.dashscope-session',
});
