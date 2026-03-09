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
import { Channel } from './types.js';
export declare class ProgressReporter {
    private channel;
    private chatJid;
    private originalMsgId;
    private threadId;
    private workingMsgId;
    private pendingUpdate;
    private editTimer;
    constructor(channel: Channel, chatJid: string, originalMsgId?: string | null);
    /**
     * Start progress reporting. Sends the first status message.
     * For Discord, attempts to open a thread on the triggering message.
     */
    start(message: string): Promise<void>;
    /**
     * Send an intermediate progress update.
     * Debounced to avoid flooding the channel.
     */
    update(message: string): Promise<void>;
    /**
     * Send the final completion message.
     * For Discord, posts in the main channel (not the thread) for visibility.
     */
    finish(message: string): Promise<void>;
    /**
     * Report a fatal error to the user.
     */
    error(message: string): Promise<void>;
    private isDiscord;
}
//# sourceMappingURL=progress-reporter.d.ts.map