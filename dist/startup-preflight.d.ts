export interface ChannelBootConfig {
    discordOnly: boolean;
    telegramToken: string;
    discordToken: string;
    legacyDiscordTokenUsed?: boolean;
}
export interface ChannelPreflightResult {
    ok: boolean;
    errors: string[];
    warnings: string[];
}
export declare function validateChannelBootConfig(cfg: ChannelBootConfig): ChannelPreflightResult;
//# sourceMappingURL=startup-preflight.d.ts.map