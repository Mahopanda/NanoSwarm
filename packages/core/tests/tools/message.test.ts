import { describe, it, expect, mock } from 'bun:test';
import { createMessageTool } from '../../src/tools/message.ts';
import { EventBus } from '../../src/events/event-bus.ts';

describe('message tool', () => {
  it('should emit message event via eventBus', async () => {
    const bus = new EventBus();
    const received: any[] = [];
    bus.on('message', (data) => received.push(data));

    const tool = createMessageTool(bus);
    const result = await tool.execute(
      { content: 'Processing your request...' },
      { workspace: '/test', contextId: 'ctx1' },
    );

    expect(result).toBe('Message sent');
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      role: 'agent',
      content: 'Processing your request...',
      contextId: 'ctx1',
    });
  });

  it('should have correct tool metadata', () => {
    const bus = new EventBus();
    const tool = createMessageTool(bus);

    expect(tool.name).toBe('message');
    expect(tool.description).toBeTruthy();
    expect(tool.parameters).toBeDefined();
  });
});
