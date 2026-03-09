import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock(import('../config.js'), async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        BRAVE_API_KEY: 'brave-test-key',
        PERPLEXITY_API_KEY: 'perplexity-test-key',
    };
});
import { duckDuckGoHtmlSearch, webSearch } from '../web-search.js';
describe('webSearch()', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });
    it('falls back to DuckDuckGo HTML when Perplexity and Brave fail', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce({
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
        })
            .mockResolvedValueOnce({
            ok: false,
            status: 502,
            statusText: 'Bad Gateway',
        })
            .mockResolvedValueOnce({
            ok: true,
            text: async () => `
          <html>
            <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fstory">Example Result</a>
            <div class="result__snippet">Fallback snippet</div>
          </html>
        `,
        });
        const result = await webSearch('fallback query', true);
        expect(result.provider).toBe('duckduckgo');
        expect(result.results).toEqual([
            {
                title: 'Example Result',
                url: 'https://example.com/story',
                snippet: 'Fallback snippet',
            },
        ]);
        expect(result.warning).toContain('Primary search providers unavailable');
    });
    it('returns an empty result with an explicit warning when all providers fail', async () => {
        vi.mocked(fetch)
            .mockRejectedValueOnce(new Error('perplexity down'))
            .mockRejectedValueOnce(new Error('brave down'))
            .mockRejectedValueOnce(new Error('duckduckgo down'));
        const result = await webSearch('total failure', true);
        expect(result.results).toEqual([]);
        expect(result.provider).toBe('duckduckgo');
        expect(result.warning).toContain('All web search providers failed');
        expect(result.warning).toContain('duckduckgo');
    });
});
describe('duckDuckGoHtmlSearch()', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });
    it('parses DuckDuckGo HTML results', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            text: async () => `
        <html>
          <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fone">First &amp; Best</a>
          <div class="result__snippet">Alpha <b>snippet</b>.</div>
          <a class="result__a" href="https://example.org/two">Second Result</a>
          <div class="result__snippet">Beta snippet.</div>
        </html>
      `,
        });
        const result = await duckDuckGoHtmlSearch('html parse');
        expect(result.provider).toBe('duckduckgo');
        expect(result.results).toEqual([
            {
                title: 'First & Best',
                url: 'https://example.com/one',
                snippet: 'Alpha snippet.',
            },
            {
                title: 'Second Result',
                url: 'https://example.org/two',
                snippet: 'Beta snippet.',
            },
        ]);
    });
});
//# sourceMappingURL=web-search.test.js.map