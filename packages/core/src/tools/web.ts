import { z } from 'zod';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import type { NanoTool, ToolContext } from './base.ts';

export interface WebSearchOptions {
  apiKey?: string;
}

export interface WebFetchOptions {
  maxChars?: number;
}

export function createWebSearchTool(options: WebSearchOptions = {}): NanoTool {
  return {
    name: 'web_search',
    description: 'Search the web using Brave Search API. Returns a list of results with title, URL, and description.',
    parameters: z.object({
      query: z.string().describe('Search query'),
      count: z.number().min(1).max(20).default(5).describe('Number of results to return'),
    }),
    execute: async (params: { query: string; count: number }, _context: ToolContext): Promise<string> => {
      const apiKey = options.apiKey || process.env.BRAVE_API_KEY;
      if (!apiKey) {
        return 'Error: Brave Search API key not configured. Set BRAVE_API_KEY environment variable.';
      }

      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.searchParams.set('q', params.query);
      url.searchParams.set('count', String(params.count));

      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': apiKey,
        },
      });

      if (!response.ok) {
        return `Error: Brave Search API returned ${response.status}: ${response.statusText}`;
      }

      const data = (await response.json()) as {
        web?: { results?: Array<{ title: string; url: string; description: string }> };
      };
      const results = data.web?.results;

      if (!results || results.length === 0) {
        return `No results found for: ${params.query}`;
      }

      return results
        .map(
          (r, i) =>
            `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`,
        )
        .join('\n\n');
    },
  };
}

function htmlToText(html: string, url: string): { text: string; extractor: string } {
  try {
    const { document } = parseHTML(html);
    const reader = new Readability(document as any);
    const article = reader.parse();

    if (article?.textContent) {
      // Clean up whitespace
      const text = article.textContent
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      return { text, extractor: 'readability' };
    }
  } catch {
    // Fall through to simple extraction
  }

  // Simple fallback: strip tags and clean whitespace
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  return { text, extractor: 'fallback' };
}

export function createWebFetchTool(options: WebFetchOptions = {}): NanoTool {
  const defaultMaxChars = options.maxChars ?? 50000;

  return {
    name: 'web_fetch',
    description: 'Fetch content from a URL. Automatically extracts readable text from HTML pages.',
    parameters: z.object({
      url: z.string().describe('URL to fetch'),
      maxChars: z.number().optional().describe('Maximum characters to return'),
    }),
    execute: async (params: { url: string; maxChars?: number }, _context: ToolContext): Promise<string> => {
      const maxChars = params.maxChars ?? defaultMaxChars;

      // Validate URL
      let parsed: URL;
      try {
        parsed = new URL(params.url);
      } catch {
        return `Error: Invalid URL: ${params.url}`;
      }

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return `Error: Only http and https URLs are supported. Got: ${parsed.protocol}`;
      }

      let response: Response;
      try {
        response = await fetch(params.url, {
          headers: {
            'User-Agent': 'NanoSwarm/0.1',
            Accept: 'text/html,application/json,text/plain,*/*',
          },
          redirect: 'follow',
        });
      } catch (err: any) {
        return `Error: Failed to fetch ${params.url}: ${err.message}`;
      }

      if (!response.ok) {
        return `Error: HTTP ${response.status}: ${response.statusText}`;
      }

      const contentType = response.headers.get('content-type') || '';
      const finalUrl = response.url;
      const rawText = await response.text();

      let text: string;
      let extractor: string;

      if (contentType.includes('application/json')) {
        try {
          const data = JSON.parse(rawText);
          text = JSON.stringify(data, null, 2);
          extractor = 'json';
        } catch {
          text = rawText;
          extractor = 'raw';
        }
      } else if (contentType.includes('text/html')) {
        const result = htmlToText(rawText, params.url);
        text = result.text;
        extractor = result.extractor;
      } else {
        text = rawText;
        extractor = 'raw';
      }

      const truncated = text.length > maxChars;
      if (truncated) {
        text = text.slice(0, maxChars);
      }

      return JSON.stringify({
        url: params.url,
        finalUrl,
        status: response.status,
        extractor,
        truncated,
        length: text.length,
        text,
      });
    },
  };
}
