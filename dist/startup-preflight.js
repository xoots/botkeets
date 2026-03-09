export function validateChannelBootConfig(cfg) {
    const errors = [];
    const warnings = [];
    if (cfg.discordOnly && !cfg.discordToken) {
        errors.push('DISCORD_ONLY=true requires DISCORD_BOT_TOKEN');
    }
    if (!cfg.discordOnly && !cfg.telegramToken) {
        errors.push('Telegram is required unless DISCORD_ONLY=true');
    }
    if (cfg.discordOnly && cfg.telegramToken) {
        warnings.push('TELEGRAM_BOT_TOKEN is set but ignored because DISCORD_ONLY=true');
    }
    if (cfg.legacyDiscordTokenUsed) {
        warnings.push('DISCORD_TOKEN is deprecated; migrate to DISCORD_BOT_TOKEN');
    }
    return {
        ok: errors.length === 0,
        errors,
        warnings,
    };
}
//# sourceMappingURL=startup-preflight.js.map