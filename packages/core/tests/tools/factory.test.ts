import { describe, it, expect, mock } from 'bun:test';
import { ToolRegistry } from '../../src/tools/registry.ts';
import { registerDefaultTools } from '../../src/tools/factory.ts';
import type { EventBus } from '../../src/events/event-bus.ts';
import type { SubagentManager } from '../../src/agent/subagent-manager.ts';
import type { CronService } from '../../src/cron/service.ts';

describe('registerDefaultTools', () => {
  const mockEventBus = {
    on: mock(() => {}),
    off: mock(() => {}),
    emit: mock(() => {}),
    removeAllListeners: mock(() => {}),
  } as unknown as EventBus;

  it('should register 8 base tools (no spawn, no cron)', () => {
    const registry = new ToolRegistry();
    registerDefaultTools(registry, { eventBus: mockEventBus });

    expect(registry.size).toBe(8);
    expect(registry.has('read_file')).toBe(true);
    expect(registry.has('write_file')).toBe(true);
    expect(registry.has('edit_file')).toBe(true);
    expect(registry.has('list_dir')).toBe(true);
    expect(registry.has('exec')).toBe(true);
    expect(registry.has('web_search')).toBe(true);
    expect(registry.has('web_fetch')).toBe(true);
    expect(registry.has('message')).toBe(true);
    expect(registry.has('spawn')).toBe(false);
    expect(registry.has('cron')).toBe(false);
  });

  it('should register 9 tools with subagentManager (adds spawn)', () => {
    const registry = new ToolRegistry();
    const mockManager = {} as SubagentManager;
    registerDefaultTools(registry, {
      eventBus: mockEventBus,
      subagentManager: mockManager,
    });

    expect(registry.size).toBe(9);
    expect(registry.has('spawn')).toBe(true);
    expect(registry.has('cron')).toBe(false);
  });

  it('should register 9 tools with cronService (adds cron)', () => {
    const registry = new ToolRegistry();
    const mockCron = {} as CronService;
    registerDefaultTools(registry, {
      eventBus: mockEventBus,
      cronService: mockCron,
    });

    expect(registry.size).toBe(9);
    expect(registry.has('spawn')).toBe(false);
    expect(registry.has('cron')).toBe(true);
  });

  it('should register all 10 tools with both subagentManager and cronService', () => {
    const registry = new ToolRegistry();
    const mockManager = {} as SubagentManager;
    const mockCron = {} as CronService;
    registerDefaultTools(registry, {
      eventBus: mockEventBus,
      subagentManager: mockManager,
      cronService: mockCron,
    });

    expect(registry.size).toBe(10);
    expect(registry.has('spawn')).toBe(true);
    expect(registry.has('cron')).toBe(true);
  });

  it('should pass execOptions to exec tool', () => {
    const registry = new ToolRegistry();
    registerDefaultTools(registry, {
      eventBus: mockEventBus,
      execOptions: { timeout: 5000 },
    });

    const execTool = registry.get('exec');
    expect(execTool).toBeDefined();
    expect(execTool!.name).toBe('exec');
  });
});
