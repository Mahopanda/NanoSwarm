import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Bot } from 'grammy';

const MIME_EXT_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'video/mp4': '.mp4',
  'application/pdf': '.pdf',
};

const TYPE_EXT_MAP: Record<string, string> = {
  image: '.jpg',
  sticker: '.webp',
  voice: '.ogg',
  audio: '.mp3',
  video: '.mp4',
  file: '',
};

export type MediaType = 'image' | 'sticker' | 'voice' | 'audio' | 'video' | 'file';

export function getExtension(mediaType: MediaType, mimeType?: string): string {
  if (mimeType && mimeType in MIME_EXT_MAP) {
    return MIME_EXT_MAP[mimeType];
  }
  return TYPE_EXT_MAP[mediaType] ?? '';
}

export async function getMediaDir(baseDir?: string): Promise<string> {
  const dir = baseDir ?? join(homedir(), '.nanoswarm', 'media');
  await mkdir(dir, { recursive: true });
  return dir;
}

export interface DownloadedMedia {
  path: string;
  mediaType: MediaType;
}

/**
 * Download a Telegram file to local disk.
 *
 * grammy's `bot.api.getFile()` returns the `file_path` on Telegram's servers.
 * We manually construct the download URL and fetch it.
 */
export async function downloadTelegramFile(
  bot: Bot,
  fileId: string,
  mediaType: MediaType,
  options?: { mimeType?: string; fileName?: string; mediaDir?: string },
): Promise<DownloadedMedia> {
  const file = await bot.api.getFile(fileId);
  if (!file.file_path) {
    throw new Error(`Telegram returned no file_path for fileId: ${fileId}`);
  }

  const mediaDir = await getMediaDir(options?.mediaDir);

  // Determine local filename
  let localName: string;
  if (options?.fileName) {
    // Use original filename (for documents)
    localName = `${fileId.slice(0, 8)}_${options.fileName}`;
  } else {
    const ext = getExtension(mediaType, options?.mimeType);
    localName = `${fileId.slice(0, 16)}${ext}`;
  }

  const localPath = join(mediaDir, localName);

  // Download via Telegram Bot API file URL
  const url = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to download file: ${resp.status} ${resp.statusText}`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  await writeFile(localPath, buffer);

  return { path: localPath, mediaType };
}
