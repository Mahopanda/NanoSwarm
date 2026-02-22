import { describe, it, expect, mock } from 'bun:test';
import { EventBus } from '../../src/events/event-bus.ts';

describe('EventBus', () => {
  it('should emit and receive typed events', () => {
    const bus = new EventBus();
    const received: any[] = [];
    bus.on('tool-start', (data) => received.push(data));

    bus.emit('tool-start', { toolName: 'read_file', args: { path: '/test' } });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ toolName: 'read_file', args: { path: '/test' } });
  });

  it('should support multiple listeners for same event', () => {
    const bus = new EventBus();
    const a: string[] = [];
    const b: string[] = [];
    bus.on('message', (d) => a.push(d.content));
    bus.on('message', (d) => b.push(d.content));

    bus.emit('message', { role: 'agent', content: 'hello', contextId: 'ctx1' });

    expect(a).toEqual(['hello']);
    expect(b).toEqual(['hello']);
  });

  it('should remove a specific listener with off()', () => {
    const bus = new EventBus();
    const results: string[] = [];
    const listener = (d: any) => results.push(d.message);

    bus.on('error', listener);
    bus.emit('error', { message: 'err1' });
    bus.off('error', listener);
    bus.emit('error', { message: 'err2' });

    expect(results).toEqual(['err1']);
  });

  it('should clear all listeners with removeAllListeners()', () => {
    const bus = new EventBus();
    const fn = mock(() => {});
    bus.on('tool-start', fn);
    bus.on('tool-finish', fn);

    bus.removeAllListeners();
    bus.emit('tool-start', { toolName: 'x', args: {} });
    bus.emit('tool-finish', { toolName: 'x', result: '', durationMs: 0 });

    expect(fn).not.toHaveBeenCalled();
  });

  it('should not throw when emitting with no listeners', () => {
    const bus = new EventBus();
    expect(() => {
      bus.emit('error', { message: 'no one listening' });
    }).not.toThrow();
  });

  it('should not throw when removing non-existent listener', () => {
    const bus = new EventBus();
    const fn = () => {};
    expect(() => bus.off('error', fn)).not.toThrow();
  });
});
