const COGNEE_URL = process.env.COGNEE_URL ?? 'http://localhost:8765';
export async function searchCognee(query, projectId, topK = 3) {
    try {
        const resp = await fetch(`${COGNEE_URL}/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, namespace: projectId, top_k: topK }),
            signal: AbortSignal.timeout(3000),
        });
        if (!resp.ok)
            return [];
        const data = await resp.json();
        return data.chunks ?? [];
    }
    catch {
        // Cognee not running — graceful degradation
        return [];
    }
}
//# sourceMappingURL=memory-cognee-search.js.map