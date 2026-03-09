export const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
export const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';
function isContainerOutputPayload(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const payload = value;
    if (payload.status !== 'success' && payload.status !== 'error')
        return false;
    if (!(typeof payload.result === 'string' || payload.result === null))
        return false;
    if ('newSessionId' in payload && typeof payload.newSessionId !== 'string')
        return false;
    if ('error' in payload && typeof payload.error !== 'string')
        return false;
    return true;
}
export function extractContainerOutputPayload(output) {
    const start = output.indexOf(OUTPUT_START_MARKER);
    if (start === -1)
        return null;
    const end = output.indexOf(OUTPUT_END_MARKER, start + OUTPUT_START_MARKER.length);
    if (end === -1)
        return null;
    const rawPayload = output.slice(start + OUTPUT_START_MARKER.length, end).trim();
    if (!rawPayload)
        return null;
    try {
        const parsed = JSON.parse(rawPayload);
        return isContainerOutputPayload(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
export function resolveContainerStdout(output) {
    const payload = extractContainerOutputPayload(output);
    if (payload) {
        return { kind: 'payload', payload };
    }
    const text = output.trim();
    if (text) {
        return { kind: 'plain_text', text };
    }
    return { kind: 'none' };
}
//# sourceMappingURL=container-output-contract.js.map