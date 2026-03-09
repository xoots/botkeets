import { Client, Events, GatewayIntentBits, } from 'discord.js';
import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
import { logger } from '../logger.js';
export class DiscordChannel {
    name = 'discord';
    client = null;
    opts;
    botToken;
    constructor(botToken, opts) {
        this.botToken = botToken;
        this.opts = opts;
    }
    async connect() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
            ],
        });
        this.client.on(Events.MessageCreate, async (message) => {
            // Ignore bot messages (including own)
            if (message.author.bot)
                return;
            const channelId = message.channelId;
            const chatJid = `dc:${channelId}`;
            let content = message.content;
            const timestamp = message.createdAt.toISOString();
            const senderName = message.member?.displayName ||
                message.author.displayName ||
                message.author.username;
            const sender = message.author.id;
            const msgId = message.id;
            // Determine chat name
            let chatName;
            if (message.guild) {
                const textChannel = message.channel;
                chatName = `${message.guild.name} #${textChannel.name}`;
            }
            else {
                chatName = senderName;
            }
            // Translate Discord @bot mentions into TRIGGER_PATTERN format.
            // Discord mentions look like <@botUserId> — these won't match
            // TRIGGER_PATTERN (e.g., ^@Andy\b), so we prepend the trigger
            // when the bot is @mentioned.
            if (this.client?.user) {
                const botId = this.client.user.id;
                const isBotMentioned = message.mentions.users.has(botId) ||
                    content.includes(`<@${botId}>`) ||
                    content.includes(`<@!${botId}>`);
                if (isBotMentioned) {
                    // Strip the Discord mention to avoid clutter in the prompt
                    content = content
                        .replace(new RegExp(`<@!?${botId}>`, 'g'), '')
                        .trim();
                    // Prepend trigger if not already present
                    if (!TRIGGER_PATTERN.test(content)) {
                        content = `@${ASSISTANT_NAME} ${content}`;
                    }
                }
            }
            // Handle attachments — give the agent awareness of what was sent
            if (message.attachments.size > 0) {
                const attachmentDescriptions = [...message.attachments.values()].map((att) => {
                    const contentType = att.contentType || '';
                    if (contentType.startsWith('image/'))
                        return `[Image: ${att.name || 'image'}]`;
                    if (contentType.startsWith('video/'))
                        return `[Video: ${att.name || 'video'}]`;
                    if (contentType.startsWith('audio/'))
                        return `[Audio: ${att.name || 'audio'}]`;
                    return `[File: ${att.name || 'file'}]`;
                });
                content = content
                    ? `${content}\n${attachmentDescriptions.join('\n')}`
                    : attachmentDescriptions.join('\n');
            }
            // Handle reply context — include who the user is replying to
            if (message.reference?.messageId) {
                try {
                    const repliedTo = await message.channel.messages.fetch(message.reference.messageId);
                    const replyAuthor = repliedTo.member?.displayName ||
                        repliedTo.author.displayName ||
                        repliedTo.author.username;
                    content = `[Reply to ${replyAuthor}] ${content}`;
                }
                catch {
                    // Referenced message may have been deleted
                }
            }
            // Only deliver full message for registered groups
            const group = this.opts.registeredGroups()[chatJid];
            if (!group) {
                logger.debug({ chatJid, chatName }, 'Message from unregistered Discord channel');
                return;
            }
            // Store chat metadata only for registered chats
            this.opts.onChatMetadata(chatJid, timestamp, chatName, 'discord', !!message.guild);
            // Deliver message — startMessageLoop() will pick it up
            this.opts.onMessage(chatJid, {
                id: msgId,
                chat_jid: chatJid,
                sender,
                sender_name: senderName,
                content,
                timestamp,
                is_from_me: false,
            });
            logger.info({ chatJid, chatName, sender: senderName }, 'Discord message stored');
        });
        // Handle errors gracefully
        this.client.on(Events.Error, (err) => {
            logger.error({ err: err.message }, 'Discord client error');
        });
        return new Promise((resolve) => {
            this.client.once(Events.ClientReady, (readyClient) => {
                logger.info({ username: readyClient.user.tag, id: readyClient.user.id }, 'Discord bot connected');
                console.log(`\n  Discord bot: ${readyClient.user.tag}`);
                console.log(`  Use /chatid in Discord or enable Developer Mode to copy channel IDs\n`);
                resolve();
            });
            this.client.login(this.botToken);
        });
    }
    async sendMessage(jid, text) {
        if (!this.client) {
            logger.warn('Discord client not initialized');
            return;
        }
        try {
            const channelId = jid.replace(/^dc:/, '');
            const channel = await this.client.channels.fetch(channelId);
            if (!channel || !('send' in channel)) {
                logger.warn({ jid }, 'Discord channel not found or not text-based');
                return;
            }
            const textChannel = channel;
            // Discord has a 2000 character limit — split if needed
            const MAX_LENGTH = 2000;
            if (text.length <= MAX_LENGTH) {
                await textChannel.send(text);
            }
            else {
                for (let i = 0; i < text.length; i += MAX_LENGTH) {
                    await textChannel.send(text.slice(i, i + MAX_LENGTH));
                }
            }
            logger.info({ jid, length: text.length }, 'Discord message sent');
        }
        catch (err) {
            logger.error({ jid, err }, 'Failed to send Discord message');
        }
    }
    /**
     * Send a message as a thread reply to a given message ID.
     * Used for progress streaming on long-running tasks.
     */
    async sendThreadReply(jid, threadId, text) {
        if (!this.client)
            return;
        try {
            const channel = await this.client.channels.fetch(jid.replace(/^dc:/, ''));
            if (!channel || !('threads' in channel))
                return;
            const thread = await channel.threads.fetch(threadId);
            if (!thread)
                return;
            const MAX_LENGTH = 2000;
            if (text.length <= MAX_LENGTH) {
                await thread.send(text);
            }
            else {
                for (let i = 0; i < text.length; i += MAX_LENGTH) {
                    await thread.send(text.slice(i, i + MAX_LENGTH));
                }
            }
        }
        catch (err) {
            logger.debug({ jid, threadId, err }, 'Failed to send Discord thread reply');
        }
    }
    /**
     * Create a thread on a message for progress tracking.
     * Returns the thread ID for subsequent sendThreadReply calls.
     */
    async createThread(jid, messageId, threadName) {
        if (!this.client)
            return null;
        try {
            const channel = await this.client.channels.fetch(jid.replace(/^dc:/, ''));
            if (!channel || !('messages' in channel))
                return null;
            const msg = await channel.messages.fetch(messageId);
            const thread = await msg.startThread({ name: threadName });
            return thread.id;
        }
        catch (err) {
            logger.debug({ jid, messageId, err }, 'Failed to create Discord thread');
            return null;
        }
    }
    isConnected() {
        return this.client !== null && this.client.isReady();
    }
    ownsJid(jid) {
        return jid.startsWith('dc:');
    }
    async disconnect() {
        if (this.client) {
            this.client.destroy();
            this.client = null;
            logger.info('Discord bot stopped');
        }
    }
    async setTyping(jid, isTyping) {
        if (!this.client || !isTyping)
            return;
        try {
            const channelId = jid.replace(/^dc:/, '');
            const channel = await this.client.channels.fetch(channelId);
            if (channel && 'sendTyping' in channel) {
                await channel.sendTyping();
            }
        }
        catch (err) {
            logger.debug({ jid, err }, 'Failed to send Discord typing indicator');
        }
    }
}
//# sourceMappingURL=discord.js.map