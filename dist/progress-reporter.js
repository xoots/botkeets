/**
 * Progress Reporter
 *
 * Streams progress updates back to the user during long-running tasks.
 *
 * Discord:  creates a thread on the original message, sends updates there,
 *           then posts the final reply in the main channel.
 * Telegram: sends a "working…" reply, then edits it with each update.
 *           On completion, sends the final reply as a new message.
 *
 * Usage:
 *   const reporter = new ProgressReporter(channel, chatJid, originalMsgId);
 *   await reporter.start('Starting Spotify app build...');
 *   await reporter.update('Step 1/5: scaffolding project...');
 *   await reporter.update('Step 2/5: installing dependencies...');
 *   await reporter.finish('Done! Here are your files...');
 */
import { logger } from './logger.js';
// How long to wait between update edits (avoids Telegram rate limits)
const EDIT_DEBOUNCE_MS = 1500;
export class ProgressReporter {
    channel;
    chatJid;
    originalMsgId;
    // Discord-specific
    threadId = null;
    // Telegram-specific
    workingMsgId = null;
    pendingUpdate = null;
    editTimer = null;
    constructor(channel, chatJid, originalMsgId = null) {
        this.channel = channel;
        this.chatJid = chatJid;
        this.originalMsgId = originalMsgId;
    }
    /**
     * Start progress reporting. Sends the first status message.
     * For Discord, attempts to open a thread on the triggering message.
     */
    async start(message) {
        try {
            if (this.isDiscord()) {
                const discord = this.channel;
                if (this.originalMsgId) {
                    this.threadId = await discord.createThread(this.chatJid, this.originalMsgId, '⚙️ Task in progress');
                }
                if (this.threadId) {
                    await discord.sendThreadReply(this.chatJid, this.threadId, `⏳ ${message}`);
                }
                else {
                    await this.channel.sendMessage(this.chatJid, `⏳ ${message}`);
                }
            }
            else {
                // Telegram: send initial status (we'll edit it in place)
                await this.channel.sendMessage(this.chatJid, `⏳ ${message}`);
            }
        }
        catch (err) {
            logger.debug({ err }, 'ProgressReporter.start failed — non-fatal');
        }
    }
    /**
     * Send an intermediate progress update.
     * Debounced to avoid flooding the channel.
     */
    async update(message) {
        try {
            if (this.isDiscord() && this.threadId) {
                const discord = this.channel;
                await discord.sendThreadReply(this.chatJid, this.threadId, `⏳ ${message}`);
            }
            else {
                // For Telegram: just send direct messages (edit API needs message IDs)
                this.pendingUpdate = message;
                if (!this.editTimer) {
                    this.editTimer = setTimeout(async () => {
                        this.editTimer = null;
                        if (this.pendingUpdate) {
                            await this.channel.sendMessage(this.chatJid, `⏳ ${this.pendingUpdate}`).catch(() => { });
                            this.pendingUpdate = null;
                        }
                    }, EDIT_DEBOUNCE_MS);
                }
            }
        }
        catch (err) {
            logger.debug({ err }, 'ProgressReporter.update failed — non-fatal');
        }
    }
    /**
     * Send the final completion message.
     * For Discord, posts in the main channel (not the thread) for visibility.
     */
    async finish(message) {
        // Flush any pending edit
        if (this.editTimer) {
            clearTimeout(this.editTimer);
            this.editTimer = null;
        }
        try {
            if (this.isDiscord() && this.threadId) {
                // Close off the thread with a done note, then post in main channel
                const discord = this.channel;
                await discord.sendThreadReply(this.chatJid, this.threadId, '✅ Task complete').catch(() => { });
                await this.channel.sendMessage(this.chatJid, message);
            }
            else {
                await this.channel.sendMessage(this.chatJid, message);
            }
        }
        catch (err) {
            logger.debug({ err }, 'ProgressReporter.finish failed — non-fatal');
        }
    }
    /**
     * Report a fatal error to the user.
     */
    async error(message) {
        if (this.editTimer) {
            clearTimeout(this.editTimer);
            this.editTimer = null;
        }
        try {
            const text = `❌ ${message}`;
            if (this.isDiscord() && this.threadId) {
                const discord = this.channel;
                await discord.sendThreadReply(this.chatJid, this.threadId, text).catch(() => { });
            }
            await this.channel.sendMessage(this.chatJid, text);
        }
        catch (err) {
            logger.debug({ err }, 'ProgressReporter.error failed — non-fatal');
        }
    }
    isDiscord() {
        return this.chatJid.startsWith('dc:');
    }
}
//# sourceMappingURL=progress-reporter.js.map