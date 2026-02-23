import { randomBytes } from 'node:crypto';
import { AgentLoop } from './loop.ts';
import { ToolRegistry } from '../tools/registry.ts';
import type { ContextBuilder } from '../context/context-builder.ts';
import type { EventBus } from '../events/event-bus.ts';
import type { AgentLoopConfig, AgentLoopResult } from './types.ts';

const RESTRICTED_TOOLS = ['message', 'spawn', 'cron'];
const SUBAGENT_MAX_ITERATIONS = 15;

const SUBAGENT_SYSTEM_SUFFIX = `

## Subagent Constraints

You are a background subagent with a specific task. Follow these rules strictly:
- Focus ONLY on your assigned task.
- Do NOT spawn new subagents or schedule cron jobs.
- Do NOT send messages to the user.
- Complete your task as efficiently as possible.`;

export interface SubagentTask {
  taskId: string;
  label: string;
  promise: Promise<AgentLoopResult>;
}

export class SubagentManager {
  private running = new Map<string, { label: string; promise: Promise<AgentLoopResult>; abortController: AbortController }>();

  constructor(
    private config: AgentLoopConfig,
    private contextBuilder: ContextBuilder,
    private fullRegistry: ToolRegistry,
    private eventBus: EventBus,
  ) {}

  async spawn(task: string, label?: string, contextId?: string): Promise<string> {
    const taskId = randomBytes(4).toString('hex');
    const resolvedLabel = label ?? `task-${taskId}`;
    const resolvedContextId = contextId ?? `subagent-${taskId}`;

    // Build restricted registry
    const restricted = new ToolRegistry();
    for (const name of this.fullRegistry.toolNames) {
      if (RESTRICTED_TOOLS.includes(name)) continue;
      const tool = this.fullRegistry.get(name);
      if (tool) restricted.register(tool);
    }

    // Build subagent loop with lower iterations
    const subConfig: AgentLoopConfig = {
      ...this.config,
      maxIterations: SUBAGENT_MAX_ITERATIONS,
    };
    const loop = new AgentLoop(subConfig, this.contextBuilder, restricted, this.eventBus);

    // Emit start event
    this.eventBus.emit('subagent-start', { taskId, label: resolvedLabel, task });

    // Run in background with AbortController
    const abortController = new AbortController();
    const promise = loop.run(resolvedContextId, task + SUBAGENT_SYSTEM_SUFFIX, undefined, {
      abortSignal: abortController.signal,
    }).then(
      (result) => {
        this.eventBus.emit('subagent-finish', {
          taskId,
          label: resolvedLabel,
          result: result.finishReason === 'error' ? `Error: ${result.text}` : result.text,
        });
        this.running.delete(taskId);
        return result;
      },
    );

    this.running.set(taskId, { label: resolvedLabel, promise, abortController });

    return `Subagent [${resolvedLabel}] started (id: ${taskId})`;
  }

  getRunningCount(): number {
    return this.running.size;
  }

  getRunningTasks(): Array<{ taskId: string; label: string }> {
    return Array.from(this.running.entries()).map(([taskId, { label }]) => ({
      taskId,
      label,
    }));
  }

  cancelTask(taskId: string): boolean {
    const task = this.running.get(taskId);
    if (!task) return false;
    task.abortController.abort();
    this.running.delete(taskId);
    this.eventBus.emit('subagent-finish', { taskId, label: task.label, result: 'Cancelled' });
    return true;
  }
}
