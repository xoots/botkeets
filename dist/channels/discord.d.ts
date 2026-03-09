import { Channel, OnChatMetadata, OnInboundMessage, RegisteredGroup } from '../types.js';
export interface DiscordChannelOpts {
    onMessage: OnInboundMessage;
    onChatMetadata: OnChatMetadata;
    onModelSelected?: (chatJid: string, model: string) => void;
    registeredGroups: () => Record<string, RegisteredGroup>;
}
export declare class DiscordChannel implements Channel {
    name: string;
    private client;
    private opts;
    private botToken;
    constructor(botToken: string, opts: DiscordChannelOpts);
    connect(): Promise<void>;
    sendMessage(jid: string, text: string): Promise<void>;
    /**
     * Send a message as a thread reply to a given message ID.
     * Used for progress streaming on long-running tasks.
     */
    sendThreadReply(jid: string, threadId: string, text: string): Promise<void>;
    /**
     * Create a thread on a message for progress tracking.
     * Returns the thread ID for subsequent sendThreadReply calls.
     */
    createThread(jid: string, messageId: string, threadName: string): Promise<string | null>;
    isConnected(): boolean;
    ownsJid(jid: string): boolean;
    disconnect(): Promise<void>;
    setTyping(jid: string, isTyping: boolean): Promise<void>;
}
//# sourceMappingURL=discord.d.ts.map