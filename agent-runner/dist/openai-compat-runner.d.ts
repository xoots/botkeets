/**
 * NanoClaw OpenAI-Compatible Agent Runner (shared base)
 * Contains all shared logic for runners that use an OpenAI-compatible API.
 * Parameterized via RunnerConfig to support Qwen, OpenRouter, and others.
 */
export interface RunnerConfig {
    /** Display name used in log prefixes and error messages (e.g. 'qwen', 'openrouter') */
    name: string;
    /** Key to look up in secrets for the API key (e.g. 'Dashscope_API_KEY') */
    apiKeySecret: string;
    /**
     * API base URL. Either a fixed string or a function that receives the secrets
     * map and returns the URL (useful when the base URL itself comes from secrets).
     */
    baseURL: string | ((secrets: Record<string, string>) => string);
    /** Fallback model identifier if the env var is not set */
    defaultModel: string;
    /** Name of the environment variable that overrides the model (e.g. 'QWEN_MODEL') */
    modelEnvVar: string;
    /** Folder name under /workspace/group/ used for session history (e.g. '.qwen-session') */
    historyDir: string;
}
export declare function runOpenAICompatAgent(config: RunnerConfig): Promise<void>;
