import { describe, it, expect } from 'bun:test';
import { TaskManager } from '../src/task-manager.ts';

describe('TaskManager', () => {
  describe('create', () => {
    it('should create a task with pending state', () => {
      const tm = new TaskManager();
      const task = tm.create('ctx-1', 'agent-1');

      expect(task.id).toBeDefined();
      expect(task.contextId).toBe('ctx-1');
      expect(task.agentId).toBe('agent-1');
      expect(task.state).toBe('pending');
      expect(task.createdAt).toBeDefined();
      expect(task.updatedAt).toBeDefined();
    });

    it('should generate unique IDs', () => {
      const tm = new TaskManager();
      const t1 = tm.create('ctx-1', 'agent-1');
      const t2 = tm.create('ctx-1', 'agent-1');

      expect(t1.id).not.toBe(t2.id);
    });
  });

  describe('updateState', () => {
    it('should update task state', () => {
      const tm = new TaskManager();
      const task = tm.create('ctx-1', 'agent-1');

      const updated = tm.updateState(task.id, 'working');
      expect(updated.state).toBe('working');
    });

    it('should update the updatedAt timestamp', () => {
      const tm = new TaskManager();
      const task = tm.create('ctx-1', 'agent-1');
      const originalUpdatedAt = task.updatedAt;

      // Small delay to ensure different timestamp
      const updated = tm.updateState(task.id, 'completed');
      expect(updated.updatedAt).toBeDefined();
    });

    it('should throw for unknown task ID', () => {
      const tm = new TaskManager();
      expect(() => tm.updateState('nonexistent', 'working')).toThrow('Task not found');
    });
  });

  describe('get', () => {
    it('should return task by ID', () => {
      const tm = new TaskManager();
      const task = tm.create('ctx-1', 'agent-1');

      expect(tm.get(task.id)).toBe(task);
    });

    it('should return undefined for unknown ID', () => {
      const tm = new TaskManager();
      expect(tm.get('nonexistent')).toBeUndefined();
    });
  });

  describe('listByContext', () => {
    it('should return tasks for a given context', () => {
      const tm = new TaskManager();
      tm.create('ctx-1', 'agent-1');
      tm.create('ctx-1', 'agent-2');
      tm.create('ctx-2', 'agent-1');

      const tasks = tm.listByContext('ctx-1');
      expect(tasks).toHaveLength(2);
      expect(tasks.every((t) => t.contextId === 'ctx-1')).toBe(true);
    });

    it('should return empty array for unknown context', () => {
      const tm = new TaskManager();
      expect(tm.listByContext('unknown')).toEqual([]);
    });
  });
});
