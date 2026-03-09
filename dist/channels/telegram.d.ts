import { Channel, OnChatMetadata, OnInboundMessage, PlanSelections, PlanSummary, RegisteredGroup } from '../types.js';
export interface TelegramChannelOpts {
    onMessage: OnInboundMessage;
    onChatMetadata: OnChatMetadata;
    onModelSelected: (chatJid: string, model: string) => void;
    onPlanConfirmed?: (chatJid: string, selections: PlanSelections) => void;
    registeredGroups: () => Record<string, RegisteredGroup>;
}
export declare class TelegramChannel implements Channel {
    name: string;
    private bot;
    private opts;
    private botToken;
    private planSelections;
    constructor(botToken: string, opts: TelegramChannelOpts);
    connect(): Promise<void>;
    sendMessage(jid: string, text: string): Promise<void>;
    isConnected(): boolean;
    ownsJid(jid: string): boolean;
    disconnect(): Promise<void>;
    setTyping(jid: string, isTyping: boolean): Promise<void>;
    sendModelPicker(jid: string): Promise<void>;
    sendPlanUI(jid: string, plan: PlanSummary): Promise<void>;
}
//# sourceMappingURL=telegram.d.ts.map