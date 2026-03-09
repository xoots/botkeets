export function escapeXml(s) {
    if (!s)
        return '';
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
export function formatMessages(messages) {
    const lines = messages.map((m) => `<message sender="${escapeXml(m.sender_name)}" time="${m.timestamp}">${escapeXml(m.content)}</message>`);
    return `<messages>\n${lines.join('\n')}\n</messages>`;
}
export function stripInternalTags(text) {
    return text.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
}
export function formatOutbound(rawText) {
    const text = stripInternalTags(rawText);
    if (!text)
        return '';
    return text;
}
//# sourceMappingURL=router.js.map