/**
 * Web Search
 *
 * Two-tier search strategy:
 *
 *   ECO / STANDARD (default)  → Brave Search API
 *     - Free tier: 2,000 queries/month
 *     - Returns: title, URL, snippet
 *     - Fast: ~200-400ms
 *
 *   PRO (high quality_stakes) → Perplexity API
 *     - Combines web search + LLM reasoning in one call
 *     - Returns a synthesised answer with citations
 *     - More expensive but eliminates a separate LLM call for research tasks
 *
 * The caller (mode-router / direct-runner) decides which tier to invoke
 * based on the ProviderPlan.needsWebSearch flag and the active mode.
 */
export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}
export interface SearchResponse {
    query: string;
    results: SearchResult[];
    /** For Perplexity: the synthesised answer text */
    answer?: string;
    provider: 'brave' | 'perplexity' | 'duckduckgo';
    /** Non-fatal warning note for caller-side fallbacks */
    warning?: string;
}
/**
 * Search via Brave API and return top results.
 * @param query   The search query string
 * @param count   Number of results (1-20, default 5)
 */
export declare function braveSearch(query: string, count?: number): Promise<SearchResponse>;
/**
 * Search DuckDuckGo's HTML endpoint as a last-resort fallback.
 * This is intentionally lightweight and only used when primary providers fail.
 */
export declare function duckDuckGoHtmlSearch(query: string, count?: number): Promise<SearchResponse>;
/**
 * Search + synthesise via Perplexity API.
 * Returns a synthesised answer and the cited sources.
 * @param query  The search / question
 */
export declare function perplexitySearch(query: string): Promise<SearchResponse>;
/**
 * Run a web search using the best available provider.
 *
 * @param query     Search query
 * @param usePro    True → try Perplexity first; false → Brave only
 * @returns         SearchResponse with results (and optional synthesised answer)
 */
export declare function webSearch(query: string, usePro?: boolean): Promise<SearchResponse>;
/**
 * Format a SearchResponse into a compact string for injection into an LLM prompt.
 */
export declare function formatSearchResults(sr: SearchResponse): string;
//# sourceMappingURL=web-search.d.ts.map