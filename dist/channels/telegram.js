import { Bot } from 'grammy';
import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
import { logger } from '../logger.js';
import { setRegisteredGroup, getRegisteredGroup, deleteRegisteredGroup } from '../db.js';
const MODEL_PICKER_OPTIONS = [
    { text: '🧠 Smart (Auto-Route)', data: 'smart' },
    { text: '💰 Budget (Minimax M2 / GLM)', data: 'budget' },
    { text: '⚖️ Balanced (Minimax M2.5)', data: 'balanced' },
    { text: '💎 Premium (GPT-4o / Claude)', data: 'premium' },
    { text: '--- Specific Models ---', data: 'noop' },
    { text: 'Anthropic Claude 3.5 Sonnet', data: 'claude' },
    { text: 'Alibaba Qwen Plus', data: 'qwen' },
    { text: 'OpenRouter GPT-4o', data: 'openrouter:openai/gpt-4o' },
];
const PLAN_MODEL_OPTIONS = [
    { label: 'Qwen Local', provider: 'ollama', emoji: '🏠' },
    { label: 'Qwen Cloud', provider: 'dashscope', emoji: '☁️' },
    { label: 'DeepSeek', provider: 'deepseek', emoji: '🔮' },
    { label: 'OpenRouter', provider: 'openrouter', emoji: '🔀' },
    { label: 'Claude', provider: 'claude', emoji: '🧠' },
];
export class TelegramChannel {
    name = 'telegram';
    bot = null;
    opts;
    botToken;
    planSelections = new Map();
    constructor(botToken, opts) {
        this.botToken = botToken;
        this.opts = opts;
    }
    async connect() {
        this.bot = new Bot(this.botToken);
        // Command to get chat ID (useful for registration)
        this.bot.command('chatid', (ctx) => {
            const chatId = ctx.chat.id;
            const chatType = ctx.chat.type;
            const chatName = chatType === 'private'
                ? ctx.from?.first_name || 'Private'
                : ctx.chat.title || 'Unknown';
            ctx.reply(`Chat ID: \`tg:${chatId}\`\nName: ${chatName}\nType: ${chatType}`, { parse_mode: 'Markdown' });
        });
        // Command to check bot status
        this.bot.command('ping', (ctx) => {
            ctx.reply(`${ASSISTANT_NAME} is online.`);
        });
        // Command to register this chat so the bot processes its messages
        this.bot.command('register', async (ctx) => {
            const chatId = ctx.chat.id;
            const chatType = ctx.chat.type;
            // Admin gate: only creator/admin can register group chats
            if (chatType !== 'private' && ctx.from) {
                try {
                    const member = await ctx.api.getChatMember(chatId, ctx.from.id);
                    if (member.status !== 'creator' && member.status !== 'administrator') {
                        await ctx.reply('Only group admins can register this chat.');
                        return;
                    }
                }
                catch (err) {
                    logger.warn({ chatId, err }, 'Failed to check admin status');
                    await ctx.reply('Could not verify admin status. Please try again.');
                    return;
                }
            }
            const chatJid = `tg:${chatId}`;
            const chatName = chatType === 'private'
                ? ctx.from?.first_name || 'Private'
                : ctx.chat.title || `chat_${chatId}`;
            const existing = getRegisteredGroup(chatJid);
            if (existing) {
                ctx.reply(`✅ Already registered.\nJID: \`${chatJid}\`\nFolder: \`${existing.folder}\``, { parse_mode: 'Markdown' });
                return;
            }
            const folder = `tg_${chatId}`;
            setRegisteredGroup(chatJid, {
                name: chatName,
                folder,
                trigger: `@${ASSISTANT_NAME}`,
                added_at: new Date().toISOString(),
                requiresTrigger: chatType !== 'private',
                modelProfile: 'smart',
            });
            logger.info({ chatJid, chatName, folder }, 'Chat registered via /register command');
            const processingNote = chatType === 'private'
                ? 'Messages will be processed without needing a trigger prefix.'
                : `Messages mentioning @${ASSISTANT_NAME} will now be processed.`;
            ctx.reply(`✅ Registered!\nJID: \`${chatJid}\`\nFolder: \`${folder}\`\nTrigger: \`@${ASSISTANT_NAME}\`\n\n${processingNote}`, { parse_mode: 'Markdown' });
        });
        // Command to unregister this chat
        this.bot.command('unregister', async (ctx) => {
            const chatId = ctx.chat.id;
            const chatType = ctx.chat.type;
            const chatJid = `tg:${chatId}`;
            // Admin gate: only creator/admin can unregister group chats
            if (chatType !== 'private' && ctx.from) {
                try {
                    const member = await ctx.api.getChatMember(chatId, ctx.from.id);
                    if (member.status !== 'creator' && member.status !== 'administrator') {
                        await ctx.reply('Only group admins can unregister this chat.');
                        return;
                    }
                }
                catch (err) {
                    logger.warn({ chatId, err }, 'Failed to check admin status');
                    await ctx.reply('Could not verify admin status. Please try again.');
                    return;
                }
            }
            const existing = getRegisteredGroup(chatJid);
            if (!existing) {
                ctx.reply('This chat is not registered.');
                return;
            }
            const deleted = deleteRegisteredGroup(chatJid);
            if (deleted) {
                logger.info({ chatJid }, 'Chat unregistered via /unregister command');
                ctx.reply(`✅ Unregistered.\nJID \`${chatJid}\` has been removed.\nSend /register to re-register at any time.`, { parse_mode: 'Markdown' });
            }
            else {
                ctx.reply('Failed to unregister — please try again.');
            }
        });
        // Handle callback button clicks (plan UI + model picker)
        this.bot.on('callback_query:data', async (ctx) => {
            if (!ctx.chat)
                return;
            const chatJid = `tg:${ctx.chat.id}`;
            const data = ctx.callbackQuery.data;
            // ── Plan UI callbacks ──────────────────────────────────────────────
            if (data.startsWith('plan:')) {
                const parts = data.split(':');
                const action = parts[1];
                if (action === 'noop') {
                    await ctx.answerCallbackQuery();
                    return;
                }
                if (action === 'orch') {
                    if (!this.planSelections.has(chatJid))
                        this.planSelections.set(chatJid, {});
                    this.planSelections.get(chatJid).orchestrator = parts[2];
                    const opt = PLAN_MODEL_OPTIONS.find(o => o.provider === parts[2]);
                    await ctx.answerCallbackQuery({ text: `Brain: ${opt?.label ?? parts[2]}` });
                }
                else if (action === 'work') {
                    if (!this.planSelections.has(chatJid))
                        this.planSelections.set(chatJid, {});
                    this.planSelections.get(chatJid).worker = parts[2];
                    const opt = PLAN_MODEL_OPTIONS.find(o => o.provider === parts[2]);
                    await ctx.answerCallbackQuery({ text: `Worker: ${opt?.label ?? parts[2]}` });
                }
                else if (action === 'budget') {
                    if (!this.planSelections.has(chatJid))
                        this.planSelections.set(chatJid, {});
                    const raw = parts[2];
                    if (raw === 'custom') {
                        this.planSelections.get(chatJid).awaitingCustomBudget = true;
                        await ctx.answerCallbackQuery({ text: 'Enter budget amount (e.g. $3)' });
                    }
                    else {
                        this.planSelections.get(chatJid).budgetCap = parseFloat(raw);
                        this.planSelections.get(chatJid).awaitingCustomBudget = false;
                        await ctx.answerCallbackQuery({ text: `Budget: $${raw}` });
                    }
                }
                else if (action === 'confirm') {
                    const sel = this.planSelections.get(chatJid);
                    if (sel?.orchestrator && sel?.worker && sel?.budgetCap != null) {
                        await ctx.answerCallbackQuery({ text: 'Plan confirmed!' });
                        await ctx.editMessageText(`✅ Plan confirmed\nBrain: ${sel.orchestrator} | Worker: ${sel.worker} | Budget: $${sel.budgetCap}`);
                        this.opts.onPlanConfirmed?.(chatJid, {
                            orchestrator: sel.orchestrator,
                            worker: sel.worker,
                            budgetCap: sel.budgetCap,
                        });
                        this.planSelections.delete(chatJid);
                    }
                    else {
                        const missing = [];
                        if (!sel?.orchestrator)
                            missing.push('Brain');
                        if (!sel?.worker)
                            missing.push('Worker');
                        if (sel?.budgetCap == null)
                            missing.push('Budget');
                        await ctx.answerCallbackQuery({ text: `Select: ${missing.join(', ')}` });
                    }
                }
                else if (action === 'cancel') {
                    this.planSelections.delete(chatJid);
                    await ctx.answerCallbackQuery({ text: 'Plan cancelled.' });
                    await ctx.editMessageText('❌ Plan cancelled.');
                }
                return;
            }
            // ── Model picker callbacks ─────────────────────────────────────────
            if (data === 'noop') {
                await ctx.answerCallbackQuery({ text: 'Please select a specific option below.' });
                return;
            }
            const option = MODEL_PICKER_OPTIONS.find(o => o.data === data);
            const modelLabel = option ? option.text : data;
            await ctx.answerCallbackQuery({ text: `Confirmed: ${modelLabel}` });
            await ctx.editMessageText(`✅ **Andy Preference**: ${modelLabel}`, { parse_mode: 'Markdown' });
            this.opts.onModelSelected(chatJid, data);
        });
        this.bot.on('message:text', async (ctx) => {
            // Skip commands
            if (ctx.message.text.startsWith('/'))
                return;
            const chatJid = `tg:${ctx.chat.id}`;
            // ── Custom budget reply intercept ──────────────────────────────────
            if (this.planSelections.get(chatJid)?.awaitingCustomBudget) {
                const raw = ctx.message.text.trim().replace(/^\$/, '');
                const amount = parseFloat(raw);
                if (!isNaN(amount) && amount >= 0.01 && amount <= 100) {
                    this.planSelections.get(chatJid).budgetCap = amount;
                    this.planSelections.get(chatJid).awaitingCustomBudget = false;
                    await ctx.reply(`✅ Budget set to $${amount.toFixed(2)}`);
                }
                else {
                    await ctx.reply('⚠️ Enter a valid amount between $0.01 and $100 (e.g. 3.50 or $3.50)');
                }
                return;
            }
            let content = ctx.message.text;
            // Use received wall-clock time (ms precision) so consecutive messages always
            // get unique timestamps. Telegram's ctx.message.date is seconds-only, which
            // causes strict `timestamp >` DB comparisons to miss same-second messages.
            const timestamp = new Date(Math.max(Date.now(), ctx.message.date * 1000)).toISOString();
            const senderName = ctx.from?.first_name ||
                ctx.from?.username ||
                ctx.from?.id.toString() ||
                'Unknown';
            const sender = ctx.from?.id.toString() || '';
            const msgId = ctx.message.message_id.toString();
            // Determine chat name
            const chatName = ctx.chat.type === 'private'
                ? senderName
                : ctx.chat.title || chatJid;
            // Translate Telegram @bot_username mentions into TRIGGER_PATTERN format.
            // Telegram @mentions (e.g., @andy_ai_bot) won't match TRIGGER_PATTERN
            // (e.g., ^@Andy\b), so we prepend the trigger when the bot is @mentioned.
            const botUsername = ctx.me?.username?.toLowerCase();
            if (botUsername) {
                const entities = ctx.message.entities || [];
                const isBotMentioned = entities.some((entity) => {
                    if (entity.type === 'mention') {
                        const mentionText = content
                            .substring(entity.offset, entity.offset + entity.length)
                            .toLowerCase();
                        return mentionText === `@${botUsername}`;
                    }
                    return false;
                });
                if (isBotMentioned && !TRIGGER_PATTERN.test(content)) {
                    content = `@${ASSISTANT_NAME} ${content}`;
                }
            }
            // Only deliver full message for registered groups
            const group = this.opts.registeredGroups()[chatJid];
            if (!group) {
                logger.debug({ chatJid, chatName }, 'Message from unregistered Telegram chat');
                return;
            }
            // Store chat metadata only for registered chats
            this.opts.onChatMetadata(chatJid, timestamp, chatName);
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
            logger.info({ chatJid, chatName, sender: senderName }, 'Telegram message stored');
        });
        // Handle non-text messages with placeholders so the agent knows something was sent
        const storeNonText = (ctx, placeholder) => {
            const chatJid = `tg:${ctx.chat.id}`;
            const group = this.opts.registeredGroups()[chatJid];
            if (!group)
                return;
            const timestamp = new Date(Math.max(Date.now(), ctx.message.date * 1000)).toISOString();
            const senderName = ctx.from?.first_name ||
                ctx.from?.username ||
                ctx.from?.id?.toString() ||
                'Unknown';
            const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';
            this.opts.onChatMetadata(chatJid, timestamp);
            this.opts.onMessage(chatJid, {
                id: ctx.message.message_id.toString(),
                chat_jid: chatJid,
                sender: ctx.from?.id?.toString() || '',
                sender_name: senderName,
                content: `${placeholder}${caption}`,
                timestamp,
                is_from_me: false,
            });
        };
        this.bot.on('message:photo', (ctx) => storeNonText(ctx, '[Photo]'));
        this.bot.on('message:video', (ctx) => storeNonText(ctx, '[Video]'));
        this.bot.on('message:voice', (ctx) => storeNonText(ctx, '[Voice message]'));
        this.bot.on('message:audio', (ctx) => storeNonText(ctx, '[Audio]'));
        this.bot.on('message:document', (ctx) => {
            const name = ctx.message.document?.file_name || 'file';
            storeNonText(ctx, `[Document: ${name}]`);
        });
        this.bot.on('message:sticker', (ctx) => {
            const emoji = ctx.message.sticker?.emoji || '';
            storeNonText(ctx, `[Sticker ${emoji}]`);
        });
        this.bot.on('message:location', (ctx) => storeNonText(ctx, '[Location]'));
        this.bot.on('message:contact', (ctx) => storeNonText(ctx, '[Contact]'));
        // Handle errors gracefully
        this.bot.catch((err) => {
            logger.error({ err: err.message }, 'Telegram bot error');
        });
        // Start polling — returns a Promise that resolves when started
        return new Promise((resolve) => {
            this.bot.start({
                onStart: (botInfo) => {
                    logger.info({ username: botInfo.username, id: botInfo.id }, 'Telegram bot connected');
                    console.log(`\n  Telegram bot: @${botInfo.username}`);
                    console.log(`  /chatid    — get this chat's JID`);
                    console.log(`  /register  — register this chat (no DB access needed)`);
                    console.log(`  /ping      — check bot is online\n`);
                    resolve();
                },
            });
        });
    }
    async sendMessage(jid, text) {
        if (!this.bot) {
            logger.warn('Telegram bot not initialized');
            return;
        }
        try {
            const numericId = jid.replace(/^tg:/, '');
            // Telegram has a 4096 character limit per message — split if needed
            const MAX_LENGTH = 4096;
            if (text.length <= MAX_LENGTH) {
                await this.bot.api.sendMessage(numericId, text);
            }
            else {
                for (let i = 0; i < text.length; i += MAX_LENGTH) {
                    await this.bot.api.sendMessage(numericId, text.slice(i, i + MAX_LENGTH));
                }
            }
            logger.info({ jid, length: text.length }, 'Telegram message sent');
        }
        catch (err) {
            logger.error({ jid, err }, 'Failed to send Telegram message');
        }
    }
    isConnected() {
        return this.bot !== null;
    }
    ownsJid(jid) {
        return jid.startsWith('tg:');
    }
    async disconnect() {
        if (this.bot) {
            this.bot.stop();
            this.bot = null;
            logger.info('Telegram bot stopped');
        }
    }
    async setTyping(jid, isTyping) {
        if (!this.bot || !isTyping)
            return;
        try {
            const numericId = jid.replace(/^tg:/, '');
            await this.bot.api.sendChatAction(numericId, 'typing');
        }
        catch (err) {
            logger.debug({ jid, err }, 'Failed to send Telegram typing indicator');
        }
    }
    async sendModelPicker(jid) {
        if (!this.bot)
            return;
        try {
            const numericId = jid.replace(/^tg:/, '');
            const keyboard = {
                inline_keyboard: MODEL_PICKER_OPTIONS.map(opt => [
                    { text: opt.text, callback_data: opt.data }
                ])
            };
            await this.bot.api.sendMessage(numericId, 'Select a model to use for this task:', {
                reply_markup: keyboard
            });
        }
        catch (err) {
            logger.error({ jid, err }, 'Failed to send Telegram model picker');
        }
    }
    async sendPlanUI(jid, plan) {
        if (!this.bot)
            return;
        try {
            const numericId = jid.replace(/^tg:/, '');
            // Build plan summary text
            const subtaskLines = plan.subtasks
                .map(s => `${s.step}. [${s.tool}] ${s.description}`)
                .join('\n');
            const credLine = plan.credentialKeys.length > 0
                ? `\nCredentials: ${plan.credentialKeys.join(', ')}`
                : '';
            const summary = `📋 *Plan ready* — choose execution settings:\n\n${subtaskLines}${credLine}`;
            // Build 7-row keyboard
            const modelButtons = (prefix) => PLAN_MODEL_OPTIONS.map(o => ({
                text: `${o.emoji} ${o.label}`,
                callback_data: `${prefix}:${o.provider}`,
            }));
            const keyboard = {
                inline_keyboard: [
                    [{ text: '── Brain ──', callback_data: 'plan:noop' }],
                    modelButtons('plan:orch'),
                    [{ text: '── Worker ──', callback_data: 'plan:noop' }],
                    modelButtons('plan:work'),
                    [{ text: '── Budget ──', callback_data: 'plan:noop' }],
                    [
                        { text: '$0.10', callback_data: 'plan:budget:0.10' },
                        { text: '$0.25', callback_data: 'plan:budget:0.25' },
                        { text: '$0.50', callback_data: 'plan:budget:0.50' },
                        { text: '$1.00', callback_data: 'plan:budget:1.00' },
                        { text: '✏️ Custom', callback_data: 'plan:budget:custom' },
                    ],
                    [
                        { text: '✅ Execute', callback_data: 'plan:confirm' },
                        { text: '❌ Cancel', callback_data: 'plan:cancel' },
                    ],
                ],
            };
            await this.bot.api.sendMessage(numericId, summary, {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            });
        }
        catch (err) {
            logger.error({ jid, err }, 'Failed to send Telegram plan UI');
        }
    }
}
//# sourceMappingURL=telegram.js.map