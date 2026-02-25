import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { createCronTool } from '../../src/tools/cron.ts';
import type { CronService } from '../../src/cron/service.ts';

describe('cron tool', () => {
  let mockService: CronService;
  const mockAddJob = mock(() => ({
    id: 'abc123',
    name: 'test-job',
    enabled: true,
    schedule: { kind: 'every' as const, everyMs: 5000 },
    payload: { message: 'test' },
    state: {},
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    deleteAfterRun: false,
  }));
  const mockListJobs = mock(() => []);
  const mockRemoveJob = mock(() => true);
  const mockUpdateJob = mock(() => ({
    id: 'abc123',
    name: 'updated-job',
    enabled: true,
    schedule: { kind: 'every' as const, everyMs: 5000 },
    payload: { message: 'updated' },
    state: {},
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    deleteAfterRun: false,
  }));

  beforeEach(() => {
    mockAddJob.mockClear();
    mockListJobs.mockClear();
    mockRemoveJob.mockClear();
    mockUpdateJob.mockClear();
    mockService = {
      addJob: mockAddJob,
      listJobs: mockListJobs,
      removeJob: mockRemoveJob,
      updateJob: mockUpdateJob,
    } as unknown as CronService;
  });

  it('should have correct tool metadata', () => {
    const tool = createCronTool(mockService);
    expect(tool.name).toBe('cron');
    expect(tool.description).toBeTruthy();
  });

  describe('add action', () => {
    it('should add every-seconds job', async () => {
      const tool = createCronTool(mockService);
      const result = await tool.execute(
        { action: 'add', message: 'Test task', every_seconds: 60 },
        { workspace: '/test', contextId: 'ctx1' },
      );

      expect(mockAddJob).toHaveBeenCalledTimes(1);
      const call = mockAddJob.mock.calls[0][0] as any;
      expect(call.schedule).toEqual({ kind: 'every', everyMs: 60000 });
      expect(call.message).toBe('Test task');
      expect(result).toContain('Job added');
    });

    it('should add cron-expression job', async () => {
      const tool = createCronTool(mockService);
      await tool.execute(
        { action: 'add', message: 'Hourly check', cron_expr: '0 * * * *', tz: 'Asia/Taipei' },
        { workspace: '/test', contextId: 'ctx1' },
      );

      const call = mockAddJob.mock.calls[0][0] as any;
      expect(call.schedule).toEqual({ kind: 'cron', expr: '0 * * * *', tz: 'Asia/Taipei' });
    });

    it('should add at (one-time) job with deleteAfterRun', async () => {
      const tool = createCronTool(mockService);
      await tool.execute(
        { action: 'add', message: 'One-time task', at: '2026-12-31T23:59:00Z' },
        { workspace: '/test', contextId: 'ctx1' },
      );

      const call = mockAddJob.mock.calls[0][0] as any;
      expect(call.schedule.kind).toBe('at');
      expect(call.schedule.atMs).toBe(Date.parse('2026-12-31T23:59:00Z'));
      expect(call.deleteAfterRun).toBe(true);
    });

    it('should return error when message is missing', async () => {
      const tool = createCronTool(mockService);
      const result = await tool.execute(
        { action: 'add' },
        { workspace: '/test', contextId: 'ctx1' },
      );
      expect(result).toContain('Error');
      expect(result).toContain('message');
    });

    it('should return error when no schedule type is provided', async () => {
      const tool = createCronTool(mockService);
      const result = await tool.execute(
        { action: 'add', message: 'No schedule' },
        { workspace: '/test', contextId: 'ctx1' },
      );
      expect(result).toContain('Error');
    });

    it('should return error for invalid at datetime', async () => {
      const tool = createCronTool(mockService);
      const result = await tool.execute(
        { action: 'add', message: 'Bad date', at: 'not-a-date' },
        { workspace: '/test', contextId: 'ctx1' },
      );
      expect(result).toContain('Error');
      expect(result).toContain('invalid');
    });
  });

  describe('list action', () => {
    it('should return "No scheduled jobs" when empty', async () => {
      const tool = createCronTool(mockService);
      const result = await tool.execute(
        { action: 'list' },
        { workspace: '/test', contextId: 'ctx1' },
      );
      expect(result).toBe('No scheduled jobs');
    });

    it('should format job list', async () => {
      mockListJobs.mockReturnValueOnce([
        {
          id: 'abc',
          name: 'test',
          enabled: true,
          schedule: { kind: 'every', everyMs: 5000 },
          state: { nextRunAtMs: Date.now() + 5000 },
        },
      ] as any);

      const tool = createCronTool(mockService);
      const result = await tool.execute(
        { action: 'list' },
        { workspace: '/test', contextId: 'ctx1' },
      );

      expect(result).toContain('[abc]');
      expect(result).toContain('test');
      expect(result).toContain('enabled');
      expect(result).toContain('every');
    });
  });

  describe('remove action', () => {
    it('should remove a job by ID', async () => {
      const tool = createCronTool(mockService);
      const result = await tool.execute(
        { action: 'remove', job_id: 'abc123' },
        { workspace: '/test', contextId: 'ctx1' },
      );

      expect(mockRemoveJob).toHaveBeenCalledWith('abc123');
      expect(result).toContain('removed');
    });

    it('should return error when job_id is missing', async () => {
      const tool = createCronTool(mockService);
      const result = await tool.execute(
        { action: 'remove' },
        { workspace: '/test', contextId: 'ctx1' },
      );
      expect(result).toContain('Error');
      expect(result).toContain('job_id');
    });

    it('should indicate when job is not found', async () => {
      mockRemoveJob.mockReturnValueOnce(false);
      const tool = createCronTool(mockService);
      const result = await tool.execute(
        { action: 'remove', job_id: 'nonexist' },
        { workspace: '/test', contextId: 'ctx1' },
      );
      expect(result).toContain('not found');
    });
  });

  describe('update action', () => {
    it('should update a job message', async () => {
      const tool = createCronTool(mockService);
      const result = await tool.execute(
        { action: 'update', job_id: 'abc123', message: 'new message' },
        { workspace: '/test', contextId: 'ctx1' },
      );

      expect(mockUpdateJob).toHaveBeenCalledTimes(1);
      const call = mockUpdateJob.mock.calls[0] as any[];
      expect(call[0]).toBe('abc123');
      expect(call[1].message).toBe('new message');
      expect(call[1].name).toBe('new message');
      expect(result).toContain('Job updated');
    });

    it('should update a job schedule', async () => {
      const tool = createCronTool(mockService);
      await tool.execute(
        { action: 'update', job_id: 'abc123', every_seconds: 120 },
        { workspace: '/test', contextId: 'ctx1' },
      );

      const call = mockUpdateJob.mock.calls[0] as any[];
      expect(call[1].schedule).toEqual({ kind: 'every', everyMs: 120000 });
    });

    it('should update schedule with cron_expr', async () => {
      const tool = createCronTool(mockService);
      await tool.execute(
        { action: 'update', job_id: 'abc123', cron_expr: '0 9 * * *', tz: 'Asia/Taipei' },
        { workspace: '/test', contextId: 'ctx1' },
      );

      const call = mockUpdateJob.mock.calls[0] as any[];
      expect(call[1].schedule).toEqual({ kind: 'cron', expr: '0 9 * * *', tz: 'Asia/Taipei' });
    });

    it('should return error when job_id is missing', async () => {
      const tool = createCronTool(mockService);
      const result = await tool.execute(
        { action: 'update', message: 'new' },
        { workspace: '/test', contextId: 'ctx1' },
      );
      expect(result).toContain('Error');
      expect(result).toContain('job_id');
    });

    it('should indicate when job is not found', async () => {
      mockUpdateJob.mockReturnValueOnce(undefined as any);
      const tool = createCronTool(mockService);
      const result = await tool.execute(
        { action: 'update', job_id: 'nonexist', message: 'x' },
        { workspace: '/test', contextId: 'ctx1' },
      );
      expect(result).toContain('not found');
    });

    it('should return error for invalid at datetime', async () => {
      const tool = createCronTool(mockService);
      const result = await tool.execute(
        { action: 'update', job_id: 'abc123', at: 'not-a-date' },
        { workspace: '/test', contextId: 'ctx1' },
      );
      expect(result).toContain('Error');
      expect(result).toContain('invalid');
    });
  });
});
