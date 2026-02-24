import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { A2AClientHandler, extractTextFromResult } from '../src/client-handler.ts';
import type { Message, Task } from '@a2a-js/sdk';

// Mock the ClientFactory and Client
const mockSendMessage = mock(async () => ({} as any));
const mockCreateFromUrl = mock(async () => ({
  sendMessage: mockSendMessage,
}));

mock.module('@a2a-js/sdk/client', () => ({
  ClientFactory: class {
    createFromUrl = mockCreateFromUrl;
  },
}));

describe('A2AClientHandler', () => {
  let handler: A2AClientHandler;

  beforeEach(() => {
    mockSendMessage.mockReset();
    mockCreateFromUrl.mockReset();
    mockCreateFromUrl.mockResolvedValue({ sendMessage: mockSendMessage });
    handler = new A2AClientHandler('http://localhost:5000');
  });

  it('should send message and extract text from Message response', async () => {
    const messageResponse: Message = {
      kind: 'message',
      messageId: 'msg-1',
      role: 'agent',
      parts: [{ kind: 'text', text: 'Hello from external agent' }],
    };
    mockSendMessage.mockResolvedValue(messageResponse);

    const result = await handler.chat('ctx-1', 'Hello');

    expect(result.text).toBe('Hello from external agent');
    expect(mockCreateFromUrl).toHaveBeenCalledWith('http://localhost:5000');
    expect(mockSendMessage).toHaveBeenCalledTimes(1);

    const sendArgs = mockSendMessage.mock.calls[0][0];
    expect(sendArgs.message.role).toBe('user');
    expect(sendArgs.message.parts[0].text).toBe('Hello');
    expect(sendArgs.message.contextId).toBe('ctx-1');
  });

  it('should send message and extract text from Task response', async () => {
    const taskResponse: Task = {
      kind: 'task',
      id: 'task-1',
      contextId: 'ctx-1',
      status: {
        state: 'completed',
        message: {
          kind: 'message',
          messageId: 'msg-2',
          role: 'agent',
          parts: [{ kind: 'text', text: 'Task completed response' }],
        },
      },
    };
    mockSendMessage.mockResolvedValue(taskResponse);

    const result = await handler.chat('ctx-1', 'Do something');

    expect(result.text).toBe('Task completed response');
  });

  it('should propagate errors from sendMessage', async () => {
    mockSendMessage.mockRejectedValue(new Error('Connection refused'));

    await expect(handler.chat('ctx-1', 'Hello')).rejects.toThrow('Connection refused');
  });
});

describe('extractTextFromResult', () => {
  it('should extract text from Message', () => {
    const msg: Message = {
      kind: 'message',
      messageId: 'msg-1',
      role: 'agent',
      parts: [{ kind: 'text', text: 'response text' }],
    };

    expect(extractTextFromResult(msg)).toBe('response text');
  });

  it('should extract text from Message with multiple text parts', () => {
    const msg: Message = {
      kind: 'message',
      messageId: 'msg-1',
      role: 'agent',
      parts: [
        { kind: 'text', text: 'line 1' },
        { kind: 'text', text: 'line 2' },
      ],
    };

    expect(extractTextFromResult(msg)).toBe('line 1\nline 2');
  });

  it('should extract text from Task status message', () => {
    const task: Task = {
      kind: 'task',
      id: 'task-1',
      contextId: 'ctx-1',
      status: {
        state: 'completed',
        message: {
          kind: 'message',
          messageId: 'msg-1',
          role: 'agent',
          parts: [{ kind: 'text', text: 'status message' }],
        },
      },
    };

    expect(extractTextFromResult(task)).toBe('status message');
  });

  it('should extract text from Task history when no status message', () => {
    const task: Task = {
      kind: 'task',
      id: 'task-1',
      contextId: 'ctx-1',
      status: { state: 'completed' },
      history: [
        {
          kind: 'message',
          messageId: 'msg-1',
          role: 'agent',
          parts: [{ kind: 'text', text: 'history text' }],
        },
      ],
    };

    expect(extractTextFromResult(task)).toBe('history text');
  });

  it('should fallback to task summary when no text available', () => {
    const task: Task = {
      kind: 'task',
      id: 'task-1',
      contextId: 'ctx-1',
      status: { state: 'working' },
    };

    expect(extractTextFromResult(task)).toBe('Task task-1 (working)');
  });
});
