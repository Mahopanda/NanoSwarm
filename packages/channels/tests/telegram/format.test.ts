import { describe, it, expect } from 'bun:test';
import { markdownToTelegramHtml, splitMessage } from '../../src/telegram/format.ts';

describe('markdownToTelegramHtml', () => {
  it('should convert **bold** to <b>', () => {
    expect(markdownToTelegramHtml('hello **world**')).toBe('hello <b>world</b>');
  });

  it('should convert _italic_ to <i>', () => {
    expect(markdownToTelegramHtml('hello _world_')).toBe('hello <i>world</i>');
  });

  it('should convert inline code', () => {
    expect(markdownToTelegramHtml('use `npm install`')).toBe('use <code>npm install</code>');
  });

  it('should convert fenced code blocks', () => {
    const input = '```js\nconst x = 1;\n```';
    const result = markdownToTelegramHtml(input);
    expect(result).toContain('<pre><code');
    expect(result).toContain('const x = 1;');
    expect(result).toContain('</code></pre>');
  });

  it('should convert markdown links', () => {
    expect(markdownToTelegramHtml('[Google](https://google.com)')).toBe(
      '<a href="https://google.com">Google</a>',
    );
  });

  it('should convert headings to bold', () => {
    expect(markdownToTelegramHtml('# Title')).toBe('<b>Title</b>');
    expect(markdownToTelegramHtml('## Subtitle')).toBe('<b>Subtitle</b>');
  });

  it('should convert ~~strikethrough~~', () => {
    expect(markdownToTelegramHtml('~~removed~~')).toBe('<s>removed</s>');
  });

  it('should escape HTML entities', () => {
    expect(markdownToTelegramHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });

  it('should not transform content inside code blocks', () => {
    const input = '```\n**not bold**\n```';
    const result = markdownToTelegramHtml(input);
    expect(result).not.toContain('<b>');
    expect(result).toContain('**not bold**');
  });

  it('should convert bullet lists', () => {
    const input = '- item one\n- item two';
    const result = markdownToTelegramHtml(input);
    expect(result).toContain('• item one');
    expect(result).toContain('• item two');
  });

  it('should handle mixed formatting', () => {
    const input = '**Bold** and _italic_ with `code`';
    const result = markdownToTelegramHtml(input);
    expect(result).toContain('<b>Bold</b>');
    expect(result).toContain('<i>italic</i>');
    expect(result).toContain('<code>code</code>');
  });
});

describe('splitMessage', () => {
  it('should not split short messages', () => {
    expect(splitMessage('hello')).toEqual(['hello']);
  });

  it('should split at newline boundaries', () => {
    const line = 'a'.repeat(30);
    const input = `${line}\n${line}\n${line}`;
    const chunks = splitMessage(input, 65);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should be within limit
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(65);
    }
  });

  it('should split at space when no newline available', () => {
    const words = Array(20).fill('word').join(' ');
    const chunks = splitMessage(words, 30);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(30);
    }
  });

  it('should hard-cut when no space or newline available', () => {
    const input = 'a'.repeat(100);
    const chunks = splitMessage(input, 30);
    expect(chunks.length).toBe(4); // 30+30+30+10
    expect(chunks[0]).toBe('a'.repeat(30));
  });

  it('should handle exact maxLen', () => {
    const input = 'a'.repeat(4000);
    expect(splitMessage(input, 4000)).toEqual([input]);
  });
});
