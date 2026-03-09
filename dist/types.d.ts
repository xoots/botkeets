export interface AdditionalMount {
    hostPath: string;
    containerPath?: string;
    readonly?: boolean;
}
export type SandboxToolPolicyMode = 'workspace-write' | 'safe-only' | 'chat-only';
/**
 * Mount Allowlist - Security configuration for additional mounts
 * This file should be stored at ~/.config/nanoclaw/mount-allowlist.json
 * and is NOT mounted into any container, making it tamper-proof from agents.
 */
export interface MountAllowlist {
    allowedRoots: AllowedRoot[];
    blockedPatterns: string[];
    nonMainReadOnly: boolean;
}
export interface AllowedRoot {
    path: string;
    allowReadWrite: boolean;
    description?: string;
}
export interface ContainerConfig {
    additionalMounts?: AdditionalMount[];
    timeout?: number;
}
export interface RegisteredGroup {
    name: string;
    folder: string;
    trigger: string;
    added_at: string;
    containerConfig?: ContainerConfig;
    requiresTrigger?: boolean;
    preferredModel?: string;
    modelProfile?: 'budget' | 'balanced' | 'premium' | 'smart';
}
export interface NewMessage {
    id: string;
    chat_jid: string;
    sender: string;
    sender_name: string;
    content: string;
    timestamp: string;
    is_from_me?: boolean;
    is_bot_message?: boolean;
}
export interface ScheduledTask {
    id: string;
    group_folder: string;
    chat_jid: string;
    prompt: string;
    schedule_type: 'cron' | 'interval' | 'once';
    schedule_value: string;
    context_mode: 'group' | 'isolated';
    provider_override?: string;
    next_run: string | null;
    last_run: string | null;
    last_result: string | null;
    status: 'active' | 'paused' | 'completed';
    created_at: string;
}
export interface TaskRunLog {
    task_id: string;
    run_at: string;
    duration_ms: number;
    status: 'success' | 'error';
    result: string | null;
    error: string | null;
}
/** Lightweight plan summary sent to the Telegram inline keyboard UI. */
export interface PlanSummary {
    subtasks: Array<{
        step: number;
        description: string;
        tool: string;
    }>;
    planMarkdown: string;
    credentialKeys: string[];
    needsContainer: boolean;
}
/** Accumulated user selections from the !plan inline keyboard. */
export interface PlanSelections {
    orchestrator: string;
    worker: string;
    budgetCap?: number;
    customBudgetPending?: boolean;
}
export interface Channel {
    name: string;
    connect(): Promise<void>;
    sendMessage(jid: string, text: string): Promise<void>;
    isConnected(): boolean;
    ownsJid(jid: string): boolean;
    disconnect(): Promise<void>;
    setTyping?(jid: string, isTyping: boolean): Promise<void>;
    sendModelPicker?(jid: string): Promise<void>;
    sendPlanUI?(jid: string, plan: PlanSummary): Promise<void>;
}
export type OnInboundMessage = (chatJid: string, message: NewMessage) => void;
export type OnChatMetadata = (chatJid: string, timestamp: string, name?: string, channel?: string, isGroup?: boolean) => void;
//# sourceMappingURL=types.d.ts.map