import type { TaskRecord, TaskState } from './types.ts';

export class TaskManager {
  private tasks = new Map<string, TaskRecord>();

  create(contextId: string, agentId: string): TaskRecord {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const task: TaskRecord = {
      id,
      contextId,
      agentId,
      state: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(id, task);
    return task;
  }

  updateState(taskId: string, state: TaskState): TaskRecord {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    task.state = state;
    task.updatedAt = new Date().toISOString();
    return task;
  }

  get(taskId: string): TaskRecord | undefined {
    return this.tasks.get(taskId);
  }

  listByContext(contextId: string): TaskRecord[] {
    return [...this.tasks.values()].filter((t) => t.contextId === contextId);
  }
}
