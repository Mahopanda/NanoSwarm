import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { createWebSearchTool, createWebFetchTool } from '../../src/tools/web.ts';
import type { ToolContext } from '../../src/tools/base.ts';

const context: ToolContext = {
  workspace: '/tmp',
  contextId: 'test',
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('web_search', () => {
  it('should return error when no API key', async () => {
    const oldKey = process.env.BRAVE_API_KEY;
    delete process.env.BRAVE_API_KEY;
    const tool = createWebSearchTool();
    const result = await tool.execute({ query: 'test', count: 5 }, context);
    expect(result).toContain('Error: Brave Search API key not configured');
    if (oldKey) process.env.BRAVE_API_KEY = oldKey;
  });

  it('should format search results', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          web: {
            results: [
              { title: 'Result 1', url: 'https://example.com/1', description: 'Desc 1' },
              { title: 'Result 2', url: 'https://example.com/2', description: 'Desc 2' },
            ],
          },
        }),
        { status: 200 },
      )) as any;

    const tool = createWebSearchTool({ apiKey: 'test-key' });
    const result = await tool.execute({ query: 'test', count: 5 }, context);
    expect(result).toContain('1. Result 1');
    expect(result).toContain('https://example.com/1');
    expect(result).toContain('2. Result 2');
  });

  it('should handle API errors', async () => {
    globalThis.fetch = (async () =>
      new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' })) as any;

    const tool = createWebSearchTool({ apiKey: 'bad-key' });
    const result = await tool.execute({ query: 'test', count: 5 }, context);
    expect(result).toContain('Error: Brave Search API returned 401');
  });

  it('should handle no results', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ web: { results: [] } }), { status: 200 })) as any;

    const tool = createWebSearchTool({ apiKey: 'test-key' });
    const result = await tool.execute({ query: 'nothing', count: 5 }, context);
    expect(result).toContain('No results found');
  });
});

describe('web_fetch', () => {
  it('should reject invalid URLs', async () => {
    const tool = createWebFetchTool();
    const result = await tool.execute({ url: 'not-a-url' }, context);
    expect(result).toContain('Error: Invalid URL');
  });

  it('should reject non-http protocols', async () => {
    const tool = createWebFetchTool();
    const result = await tool.execute({ url: 'ftp://example.com' }, context);
    expect(result).toContain('Error: Only http and https');
  });

  it('should fetch and return JSON', async () => {
    const jsonData = { key: 'value', number: 42 };
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(jsonData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as any;

    const tool = createWebFetchTool();
    const result = await tool.execute({ url: 'https://api.example.com/data' }, context);
    const parsed = JSON.parse(result);
    expect(parsed.extractor).toBe('json');
    expect(parsed.status).toBe(200);
    expect(parsed.text).toContain('"key": "value"');
  });

  it('should fetch and extract HTML', async () => {
    const html = `
      <html><head><title>Test</title></head>
      <body><article><h1>Hello</h1><p>This is a test page with content.</p></article></body>
      </html>
    `;
    globalThis.fetch = (async () =>
      new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })) as any;

    const tool = createWebFetchTool();
    const result = await tool.execute({ url: 'https://example.com' }, context);
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe(200);
    expect(['readability', 'fallback']).toContain(parsed.extractor);
    expect(parsed.text.length).toBeGreaterThan(0);
  });

  it('should truncate long content', async () => {
    const longText = 'x'.repeat(1000);
    globalThis.fetch = (async () =>
      new Response(longText, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })) as any;

    const tool = createWebFetchTool({ maxChars: 100 });
    const result = await tool.execute({ url: 'https://example.com/big' }, context);
    const parsed = JSON.parse(result);
    expect(parsed.truncated).toBe(true);
    expect(parsed.text.length).toBe(100);
  });

  it('should handle fetch errors', async () => {
    globalThis.fetch = (async () => {
      throw new Error('Network error');
    }) as any;

    const tool = createWebFetchTool();
    const result = await tool.execute({ url: 'https://example.com/fail' }, context);
    expect(result).toContain('Error: Failed to fetch');
    expect(result).toContain('Network error');
  });

  it('should handle HTTP errors', async () => {
    globalThis.fetch = (async () =>
      new Response('Not Found', { status: 404, statusText: 'Not Found' })) as any;

    const tool = createWebFetchTool();
    const result = await tool.execute({ url: 'https://example.com/404' }, context);
    expect(result).toContain('Error: HTTP 404');
  });

  it('should follow safe redirects to external URL', async () => {
    let callCount = 0;
    globalThis.fetch = (async (url: string, opts?: any) => {
      callCount++;
      if (callCount === 1) {
        return new Response('', {
          status: 302,
          headers: { Location: 'https://example.com/final' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as any;

    const tool = createWebFetchTool();
    const result = await tool.execute({ url: 'https://example.com/start' }, context);
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe(200);
    expect(callCount).toBe(2);
  });

  it('should block redirect to loopback address (SSRF)', async () => {
    globalThis.fetch = (async () =>
      new Response('', {
        status: 302,
        headers: { Location: 'http://127.0.0.1/secret' },
      })) as any;

    const tool = createWebFetchTool();
    const result = await tool.execute({ url: 'https://example.com/redir' }, context);
    expect(result).toContain('SSRF blocked redirect');
  });

  it('should block redirect to cloud metadata endpoint (SSRF)', async () => {
    globalThis.fetch = (async () =>
      new Response('', {
        status: 302,
        headers: { Location: 'http://169.254.169.254/latest/meta-data/' },
      })) as any;

    const tool = createWebFetchTool();
    const result = await tool.execute({ url: 'https://example.com/redir' }, context);
    expect(result).toContain('SSRF blocked redirect');
  });

  it('should error on too many redirects', async () => {
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount++;
      return new Response('', {
        status: 302,
        headers: { Location: `https://example.com/hop${callCount}` },
      });
    }) as any;

    const tool = createWebFetchTool();
    const result = await tool.execute({ url: 'https://example.com/loop' }, context);
    expect(result).toContain('Too many redirects');
  });
});
