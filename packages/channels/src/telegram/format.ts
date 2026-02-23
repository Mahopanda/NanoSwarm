/**
 * Convert Markdown to Telegram-compatible HTML.
 *
 * Processing order matters — code blocks and inline code are extracted first
 * so that their contents are not affected by subsequent transformations.
 */
export function markdownToTelegramHtml(text: string): string {
  let result = text;
  const codeBlocks: string[] = [];
  const inlineCodes: string[] = [];

  // 1. Extract fenced code blocks → placeholder
  result = result.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, lang, code) => {
    const escaped = escapeHtml(code.replace(/\n$/, ''));
    const langAttr = lang ? ` class="language-${lang}"` : '';
    codeBlocks.push(`<pre><code${langAttr}>${escaped}</code></pre>`);
    return `\x00CB${codeBlocks.length - 1}\x00`;
  });

  // 2. Extract inline code → placeholder
  result = result.replace(/`([^`]+)`/g, (_match, code) => {
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00IC${inlineCodes.length - 1}\x00`;
  });

  // 3. Extract headings → placeholder (before HTML escape)
  const headings: string[] = [];
  result = result.replace(/^#{1,6}\s+(.+)$/gm, (_match, content) => {
    headings.push(content);
    return `\x00HD${headings.length - 1}\x00`;
  });

  // 4. Remove > blockquote markers
  result = result.replace(/^>\s?(.*)$/gm, '$1');

  // 5. HTML escape & < >
  result = escapeHtml(result);

  // 6. [link](url) → <a>
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>',
  );

  // 7. **bold** → <b>
  result = result.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

  // 8. _italic_ or *italic* → <i> (but not inside words with underscores)
  result = result.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<i>$1</i>');
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<i>$1</i>');

  // 9. ~~strikethrough~~ → <s>
  result = result.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // 10. Restore headings as bold
  result = result.replace(/\x00HD(\d+)\x00/g, (_match, idx) => `<b>${escapeHtml(headings[Number(idx)])}</b>`);

  // 11. Bullet lists → •
  result = result.replace(/^[\s]*[-*]\s+/gm, '• ');

  // 12. Restore inline code
  result = result.replace(/\x00IC(\d+)\x00/g, (_match, idx) => inlineCodes[Number(idx)]);

  // 13. Restore code blocks
  result = result.replace(/\x00CB(\d+)\x00/g, (_match, idx) => codeBlocks[Number(idx)]);

  return result.trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Split a message into chunks that fit within Telegram's message size limit.
 * Prefers splitting at newlines, then spaces, then hard-cuts as last resort.
 */
export function splitMessage(content: string, maxLen = 4000): string[] {
  if (content.length <= maxLen) {
    return [content];
  }

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    let splitAt = -1;

    // Try to split at newline
    const newlineIdx = remaining.lastIndexOf('\n', maxLen);
    if (newlineIdx > 0) {
      splitAt = newlineIdx;
    }

    // Fallback: split at space
    if (splitAt === -1) {
      const spaceIdx = remaining.lastIndexOf(' ', maxLen);
      if (spaceIdx > 0) {
        splitAt = spaceIdx;
      }
    }

    // Last resort: hard cut
    if (splitAt === -1) {
      splitAt = maxLen;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^[\n ]/, '');
  }

  return chunks;
}
