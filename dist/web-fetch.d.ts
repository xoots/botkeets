/**
 * Web Fetch
 *
 * Fetches a URL and extracts clean readable text using a lightweight
 * readability algorithm — same approach as nanobot's WebFetchTool.
 *
 * Strategy:
 *   1. Fetch raw HTML with a browser-like User-Agent
 *   2. Strip script/style/nav/footer/form elements
 *   3. Extract main content text
 *   4. Truncate to maxChars to avoid blowing LLM context windows
 *
 * This runs inside the host process (not a container) so it must be fast
 * and have a strict timeout. For full headless browser interaction, use
 * the agent-browser tool inside a container instead.
 */
export interface FetchedPage {
    url: string;
    title: string;
    content: string;
    /** true if content was truncated */
    truncated: boolean;
}
/**
 * Fetch a URL and return its clean text content.
 *
 * @param url       Target URL
 * @param maxChars  Maximum characters to return (default 8000)
 * @param timeoutMs Request timeout in ms (default 15000)
 */
export declare function fetchPage(url: string, maxChars?: number, timeoutMs?: number): Promise<FetchedPage>;
/**
 * Format a FetchedPage for injection into an LLM prompt.
 */
export declare function formatFetchedPage(page: FetchedPage): string;
//# sourceMappingURL=web-fetch.d.ts.map