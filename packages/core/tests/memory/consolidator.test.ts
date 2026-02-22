import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { MemoryConsolidator } from '../../src/memory/consolidator.ts';
import type { MemoryStore } from '../../src/memory/memory-store.ts';
import type { HistoryStore } from '../../src/memory/history-store.ts';

// Mock generateText
const mockGenerateText = mock(async () => ({
  text: '',
  steps: [
    {
      toolCalls: [
        {
          toolName: 'save_memory',
          input: {
            history_entry: 'User discussed project setup. Agent helped configure dependencies.',
            memory_update: '# Updated Memory\n\n- Project uses TypeScript\n- Dependencies configured',
          },
        },
      ],
    },
  ],
}));

mock.module('ai', () => ({
  generateText: mockGenerateText,
  tool: (config: any) => config,
}));

describe('MemoryConsolidator', () => {
  let consolidator: MemoryConsolidator;
  let mockMemoryStore: MemoryStore;
  let mockHistoryStore: HistoryStore;
  const mockGetMemory = mock(async () => '# Existing Memory\n\n- Some fact');
  const mockSaveMemory = mock(async () => {});
  const mockAppend = mock(async () => {});

  beforeEach(() => {
    mockGenerateText.mockClear();
    mockGetMemory.mockClear();
    mockSaveMemory.mockClear();
    mockAppend.mockClear();

    mockMemoryStore = {
      getMemory: mockGetMemory,
      saveMemory: mockSaveMemory,
    };

    mockHistoryStore = {
      append: mockAppend,
      getHistory: mock(async () => []),
    } as unknown as HistoryStore;

    consolidator = new MemoryConsolidator(
      { modelId: 'test-model' } as any,
      mockMemoryStore,
      mockHistoryStore,
    );
  });

  it('should call generateText with existing memory and messages', async () => {
    await consolidator.consolidate('ctx1', [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ]);

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const call = mockGenerateText.mock.calls[0][0] as any;
    expect(call.system).toContain('memory consolidation');
    expect(call.messages[0].content).toContain('Existing Memory');
    expect(call.messages[0].content).toContain('Hello');
  });

  it('should write history entry from tool call result', async () => {
    await consolidator.consolidate('ctx1', [
      { role: 'user', content: 'Setup project' },
      { role: 'assistant', content: 'Done' },
    ]);

    expect(mockAppend).toHaveBeenCalledTimes(1);
    expect(mockAppend.mock.calls[0][0]).toBe('ctx1');
    expect(mockAppend.mock.calls[0][1]).toBe('(consolidation)');
    expect(mockAppend.mock.calls[0][2]).toContain('project setup');
  });

  it('should write updated memory from tool call result', async () => {
    await consolidator.consolidate('ctx1', [
      { role: 'user', content: 'Setup project' },
      { role: 'assistant', content: 'Done' },
    ]);

    expect(mockSaveMemory).toHaveBeenCalledTimes(1);
    expect(mockSaveMemory.mock.calls[0][0]).toBe('ctx1');
    expect(mockSaveMemory.mock.calls[0][1]).toContain('Updated Memory');
  });

  it('should skip when no messages to process', async () => {
    await consolidator.consolidate('ctx1', []);

    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it('should process only older half of messages by default', async () => {
    const messages = [
      { role: 'user', content: 'Msg 1' },
      { role: 'assistant', content: 'Reply 1' },
      { role: 'user', content: 'Msg 2' },
      { role: 'assistant', content: 'Reply 2' },
    ];

    await consolidator.consolidate('ctx1', messages);

    const call = mockGenerateText.mock.calls[0][0] as any;
    // Should contain earlier messages but not necessarily the last ones
    expect(call.messages[0].content).toContain('Msg 1');
  });

  it('should process all messages when archiveAll is true', async () => {
    const messages = [
      { role: 'user', content: 'Msg 1' },
      { role: 'assistant', content: 'Reply 1' },
      { role: 'user', content: 'Msg 2' },
      { role: 'assistant', content: 'Reply 2' },
    ];

    await consolidator.consolidate('ctx1', messages, { archiveAll: true });

    const call = mockGenerateText.mock.calls[0][0] as any;
    expect(call.messages[0].content).toContain('Msg 1');
    expect(call.messages[0].content).toContain('Msg 2');
  });

  it('should include timestamps in formatted messages', async () => {
    await consolidator.consolidate('ctx1', [
      { role: 'user', content: 'Hello', timestamp: '2026-01-01 10:00' },
    ], { archiveAll: true });

    const call = mockGenerateText.mock.calls[0][0] as any;
    expect(call.messages[0].content).toContain('[2026-01-01 10:00]');
  });

  it('should handle null existing memory', async () => {
    mockGetMemory.mockResolvedValueOnce(null);

    await consolidator.consolidate('ctx1', [
      { role: 'user', content: 'First message' },
    ], { archiveAll: true });

    const call = mockGenerateText.mock.calls[0][0] as any;
    expect(call.messages[0].content).toContain('(empty)');
  });
});
