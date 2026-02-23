import { generateText, tool } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { MemoryStore } from './memory-store.ts';
import type { HistoryStore } from './history-store.ts';

const CONSOLIDATION_PROMPT = `You are a memory consolidation assistant. Your job is to:

1. Review the conversation messages provided.
2. Extract important facts, decisions, and context into an updated MEMORY.md.
3. Create a brief history summary (2-5 sentences with timestamp) for the HISTORY log.

Use the save_memory tool to store both the updated memory and history entry.
Preserve existing memory content that is still relevant, and add/update with new information.
Remove outdated or contradicted information.`;

export class MemoryConsolidator {
  constructor(
    private model: LanguageModel,
    private memoryStore: MemoryStore,
    private historyStore: HistoryStore,
  ) {}

  async consolidate(
    contextId: string,
    messages: Array<{ role: string; content: string; timestamp?: string }>,
    options?: { archiveAll?: boolean; memoryWindow?: number },
  ): Promise<void> {
    const window = options?.memoryWindow ?? messages.length;
    const archiveAll = options?.archiveAll ?? false;

    // Decide which messages to process
    let toProcess: typeof messages;
    if (archiveAll) {
      toProcess = messages;
    } else {
      // Keep recent half, process older half
      const splitPoint = Math.floor(window / 2);
      toProcess = messages.slice(0, messages.length - splitPoint);
    }

    if (toProcess.length === 0) return;

    // Format messages for LLM
    const formatted = toProcess
      .map((m) => {
        const ts = m.timestamp ? `[${m.timestamp}] ` : '';
        return `${ts}${m.role}: ${m.content}`;
      })
      .join('\n\n');

    // Read existing memory
    const existingMemory = (await this.memoryStore.getMemory(contextId)) ?? '';

    // Capture stores for closure
    const historyStore = this.historyStore;
    const memoryStore = this.memoryStore;

    // Call LLM with save_memory tool — persistence happens directly in execute
    await generateText({
      model: this.model,
      system: CONSOLIDATION_PROMPT,
      messages: [
        {
          role: 'user',
          content: `## Existing Memory\n\n${existingMemory || '(empty)'}\n\n## Conversation to Consolidate\n\n${formatted}`,
        },
      ],
      tools: {
        save_memory: tool({
          description: 'Save consolidated memory and history entry',
          inputSchema: z.object({
            history_entry: z
              .string()
              .describe('A 2-5 sentence summary of the conversation, with timestamp'),
            memory_update: z
              .string()
              .describe('The complete updated MEMORY.md content'),
          }),
          execute: async ({ history_entry, memory_update }) => {
            await historyStore.append(contextId, '(consolidation)', history_entry);
            await memoryStore.saveMemory(contextId, memory_update);
            return 'Memory consolidated successfully';
          },
        }),
      },
      maxOutputTokens: 4096,
    });
  }
}
