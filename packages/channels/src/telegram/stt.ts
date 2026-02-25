import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

export interface STTProvider {
  transcribe(filePath: string): Promise<string>;
}

/**
 * Groq Whisper STT provider.
 * Uses the OpenAI-compatible `/openai/v1/audio/transcriptions` endpoint.
 */
export class GroqSTTProvider implements STTProvider {
  private apiKey: string;
  private apiUrl = 'https://api.groq.com/openai/v1/audio/transcriptions';
  private model = 'whisper-large-v3';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async transcribe(filePath: string): Promise<string> {
    const fileData = await readFile(filePath);
    const fileName = basename(filePath);

    const form = new FormData();
    form.append('file', new Blob([fileData]), fileName);
    form.append('model', this.model);

    const resp = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error(`[STT] Groq transcription failed: ${resp.status} ${body}`);
      return '';
    }

    const data = (await resp.json()) as { text?: string };
    return data.text ?? '';
  }
}

export function createSTTProvider(
  provider: 'groq' | 'whisper' | undefined,
  apiKey: string | undefined,
): STTProvider | null {
  if (!provider || !apiKey) return null;

  switch (provider) {
    case 'groq':
      return new GroqSTTProvider(apiKey);
    case 'whisper':
      // Whisper uses the same OpenAI-compatible API format
      return new GroqSTTProvider(apiKey);
    default:
      return null;
  }
}
