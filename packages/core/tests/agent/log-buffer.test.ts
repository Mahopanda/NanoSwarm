import { describe, it, expect } from 'bun:test';
import { LogBuffer } from '../../src/agent/log-buffer.ts';
import { EventBus } from '../../src/events/event-bus.ts';

describe('LogBuffer', () => {
  it('should push and tail entries', () => {
    const buf = new LogBuffer();
    buf.push('line1');
    buf.push('line2');
    buf.push('line3');
    expect(buf.tail(2)).toEqual(['line2', 'line3']);
    expect(buf.tail(5)).toEqual(['line1', 'line2', 'line3']);
  });

  it('should evict oldest entries when exceeding maxEntries', () => {
    const buf = new LogBuffer(3);
    buf.push('a');
    buf.push('b');
    buf.push('c');
    buf.push('d');
    expect(buf.tail(10)).toEqual(['b', 'c', 'd']);
  });

  it('should filter entries by error pattern', () => {
    const buf = new LogBuffer();
    buf.push('[10:00:00] tool-finish: read_file (ok, 5ms)');
    buf.push('[10:00:01] error: something went wrong');
    buf.push('[10:00:02] tool-finish: write_file (error, 10ms)');
    const errors = buf.filter('error');
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('error');
    expect(errors[1]).toContain('error');
  });

  it('should attach to EventBus and collect events', () => {
    const eventBus = new EventBus();
    const buf = LogBuffer.attach(eventBus);

    eventBus.emit('tool-start', { toolName: 'read_file', args: { path: '/test' } });
    eventBus.emit('tool-finish', { toolName: 'read_file', result: 'ok', durationMs: 5 });
    eventBus.emit('error', { message: 'test error' });
    eventBus.emit('subagent-start', { taskId: 'abc', label: 'test', task: 'do stuff' });
    eventBus.emit('subagent-finish', { taskId: 'abc', label: 'test', result: 'done' });

    const lines = buf.tail(10);
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain('tool-start: read_file');
    expect(lines[1]).toContain('tool-finish: read_file (ok, 5ms)');
    expect(lines[2]).toContain('error: test error');
    expect(lines[3]).toContain('subagent-start: [test] abc');
    expect(lines[4]).toContain('subagent-finish: [test] abc');
  });

  it('should return empty array when buffer is empty', () => {
    const buf = new LogBuffer();
    expect(buf.tail(10)).toEqual([]);
    expect(buf.filter('error')).toEqual([]);
  });
});
