import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { CronService } from '../../src/cron/service.ts';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('CronService', () => {
  let tempDir: string;
  let service: CronService;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cron-test-'));
    service = new CronService(tempDir);
  });

  afterEach(async () => {
    service.stop();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('addJob', () => {
    it('should add an every-interval job', () => {
      const job = service.addJob({
        name: 'test-every',
        schedule: { kind: 'every', everyMs: 5000 },
        message: 'Run every 5 seconds',
      });

      expect(job.id).toBeTruthy();
      expect(job.name).toBe('test-every');
      expect(job.enabled).toBe(true);
      expect(job.schedule.kind).toBe('every');
      expect(job.schedule.everyMs).toBe(5000);
      expect(job.deleteAfterRun).toBe(false);
      expect(job.state.nextRunAtMs).toBeGreaterThan(Date.now() - 1000);
    });

    it('should add an at (one-time) job', () => {
      const futureMs = Date.now() + 60000;
      const job = service.addJob({
        name: 'test-at',
        schedule: { kind: 'at', atMs: futureMs },
        message: 'Run once',
        deleteAfterRun: true,
      });

      expect(job.schedule.kind).toBe('at');
      expect(job.schedule.atMs).toBe(futureMs);
      expect(job.deleteAfterRun).toBe(true);
      expect(job.state.nextRunAtMs).toBe(futureMs);
    });

    it('should add a cron-expression job', () => {
      const job = service.addJob({
        name: 'test-cron',
        schedule: { kind: 'cron', expr: '0 * * * *' },
        message: 'Run every hour',
      });

      expect(job.schedule.kind).toBe('cron');
      expect(job.schedule.expr).toBe('0 * * * *');
      expect(job.state.nextRunAtMs).toBeGreaterThan(Date.now());
    });
  });

  describe('listJobs', () => {
    it('should list enabled jobs', () => {
      service.addJob({ name: 'j1', schedule: { kind: 'every', everyMs: 1000 }, message: 'm1' });
      service.addJob({ name: 'j2', schedule: { kind: 'every', everyMs: 2000 }, message: 'm2' });

      const jobs = service.listJobs();
      expect(jobs).toHaveLength(2);
    });

    it('should include disabled jobs when flag is set', () => {
      const job = service.addJob({
        name: 'j1',
        schedule: { kind: 'every', everyMs: 1000 },
        message: 'm1',
      });
      service.enableJob(job.id, false);

      expect(service.listJobs()).toHaveLength(0);
      expect(service.listJobs(true)).toHaveLength(1);
    });
  });

  describe('removeJob', () => {
    it('should remove an existing job', () => {
      const job = service.addJob({
        name: 'j1',
        schedule: { kind: 'every', everyMs: 1000 },
        message: 'm1',
      });

      expect(service.removeJob(job.id)).toBe(true);
      expect(service.listJobs()).toHaveLength(0);
    });

    it('should return false for non-existent job', () => {
      expect(service.removeJob('nonexistent')).toBe(false);
    });
  });

  describe('enableJob', () => {
    it('should disable and re-enable a job', () => {
      const job = service.addJob({
        name: 'j1',
        schedule: { kind: 'every', everyMs: 1000 },
        message: 'm1',
      });

      const disabled = service.enableJob(job.id, false);
      expect(disabled?.enabled).toBe(false);

      const enabled = service.enableJob(job.id, true);
      expect(enabled?.enabled).toBe(true);
      expect(enabled?.state.nextRunAtMs).toBeGreaterThan(0);
    });

    it('should return undefined for non-existent job', () => {
      expect(service.enableJob('nonexistent', true)).toBeUndefined();
    });
  });

  describe('updateJob', () => {
    it('should update name and message', () => {
      const job = service.addJob({
        name: '警報',
        schedule: { kind: 'every', everyMs: 5000 },
        message: '這是警報',
      });

      const updated = service.updateJob(job.id, { name: '提醒', message: '這是提醒' });
      expect(updated?.name).toBe('提醒');
      expect(updated?.payload.message).toBe('這是提醒');
      expect(updated?.updatedAtMs).toBeGreaterThanOrEqual(job.updatedAtMs);
    });

    it('should update schedule and recompute nextRunAtMs', () => {
      const job = service.addJob({
        name: 'test',
        schedule: { kind: 'every', everyMs: 5000 },
        message: 'msg',
      });

      const oldNext = job.state.nextRunAtMs;
      const updated = service.updateJob(job.id, {
        schedule: { kind: 'every', everyMs: 60000 },
      });

      expect(updated?.schedule.everyMs).toBe(60000);
      expect(updated?.state.nextRunAtMs).not.toBe(oldNext);
    });

    it('should update enabled field', () => {
      const job = service.addJob({
        name: 'test',
        schedule: { kind: 'every', everyMs: 5000 },
        message: 'msg',
      });

      const updated = service.updateJob(job.id, { enabled: false });
      expect(updated?.enabled).toBe(false);
    });

    it('should return undefined for non-existent job', () => {
      expect(service.updateJob('nonexistent', { name: 'x' })).toBeUndefined();
    });
  });

  describe('addJob dedup', () => {
    it('should return existing job when schedule+channel+to match', () => {
      const job1 = service.addJob({
        name: '警報',
        schedule: { kind: 'every', everyMs: 5000 },
        message: '舊訊息',
        channel: 'telegram',
        to: 'user1',
      });

      const job2 = service.addJob({
        name: '提醒',
        schedule: { kind: 'every', everyMs: 5000 },
        message: '新訊息',
        channel: 'telegram',
        to: 'user1',
      });

      expect(job2.id).toBe(job1.id);
      expect(job2.name).toBe('提醒');
      expect(job2.payload.message).toBe('新訊息');
      expect(service.listJobs()).toHaveLength(1);
    });

    it('should create new job when schedule differs', () => {
      service.addJob({
        name: 'j1',
        schedule: { kind: 'every', everyMs: 5000 },
        message: 'm1',
        channel: 'telegram',
        to: 'user1',
      });

      service.addJob({
        name: 'j2',
        schedule: { kind: 'every', everyMs: 10000 },
        message: 'm2',
        channel: 'telegram',
        to: 'user1',
      });

      expect(service.listJobs()).toHaveLength(2);
    });

    it('should create new job when channel differs', () => {
      service.addJob({
        name: 'j1',
        schedule: { kind: 'every', everyMs: 5000 },
        message: 'm1',
        channel: 'telegram',
        to: 'user1',
      });

      service.addJob({
        name: 'j2',
        schedule: { kind: 'every', everyMs: 5000 },
        message: 'm2',
        channel: 'discord',
        to: 'user1',
      });

      expect(service.listJobs()).toHaveLength(2);
    });

    it('should dedup cron-expression jobs with same expr', () => {
      const job1 = service.addJob({
        name: 'j1',
        schedule: { kind: 'cron', expr: '0 9 * * *' },
        message: 'old',
        channel: 'ch',
        to: 'u',
      });

      const job2 = service.addJob({
        name: 'j2',
        schedule: { kind: 'cron', expr: '0 9 * * *' },
        message: 'new',
        channel: 'ch',
        to: 'u',
      });

      expect(job2.id).toBe(job1.id);
      expect(service.listJobs()).toHaveLength(1);
    });
  });

  describe('computeNextRun', () => {
    it('should compute next run for at schedule', () => {
      const futureMs = Date.now() + 60000;
      const next = service.computeNextRun({ kind: 'at', atMs: futureMs }, Date.now());
      expect(next).toBe(futureMs);
    });

    it('should return undefined for past at schedule', () => {
      const pastMs = Date.now() - 60000;
      const next = service.computeNextRun({ kind: 'at', atMs: pastMs }, Date.now());
      expect(next).toBeUndefined();
    });

    it('should compute next run for every schedule', () => {
      const now = Date.now();
      const next = service.computeNextRun({ kind: 'every', everyMs: 5000 }, now);
      expect(next).toBe(now + 5000);
    });

    it('should compute next run for cron schedule', () => {
      const now = Date.now();
      const next = service.computeNextRun({ kind: 'cron', expr: '* * * * *' }, now);
      expect(next).toBeGreaterThan(now);
      // Should be within 60 seconds for "every minute" cron
      expect(next! - now).toBeLessThanOrEqual(60000);
    });

    it('should return undefined for invalid cron expression', () => {
      const next = service.computeNextRun({ kind: 'cron', expr: 'invalid' }, Date.now());
      expect(next).toBeUndefined();
    });
  });

  describe('persistence', () => {
    it('should save and load store from JSON file', async () => {
      service.addJob({
        name: 'persist-test',
        schedule: { kind: 'every', everyMs: 10000 },
        message: 'persisted',
      });

      // Force save
      await service.saveStore();

      // Read the file
      const data = await readFile(join(tempDir, 'cron-store.json'), 'utf-8');
      const store = JSON.parse(data);
      expect(store.version).toBe(1);
      expect(store.jobs).toHaveLength(1);
      expect(store.jobs[0].name).toBe('persist-test');

      // Create new service and load
      const service2 = new CronService(tempDir);
      await service2.start();
      const jobs = service2.listJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].name).toBe('persist-test');
      service2.stop();
    });
  });

  describe('timer execution', () => {
    it('should execute a due job via timer', async () => {
      const onJob = mock(async () => null);
      const timerService = new CronService(tempDir, onJob);

      await timerService.start();

      timerService.addJob({
        name: 'quick',
        schedule: { kind: 'every', everyMs: 50 },
        message: 'quick-run',
      });

      // Wait for timer to fire
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(onJob).toHaveBeenCalled();
      const calledJob = onJob.mock.calls[0][0] as any;
      expect(calledJob.name).toBe('quick');

      timerService.stop();
    });

    it('should delete job after run when deleteAfterRun is true', async () => {
      const onJob = mock(async () => null);
      const timerService = new CronService(tempDir, onJob);

      await timerService.start();

      timerService.addJob({
        name: 'one-time',
        schedule: { kind: 'at', atMs: Date.now() + 50 },
        message: 'once',
        deleteAfterRun: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(onJob).toHaveBeenCalled();
      expect(timerService.listJobs(true)).toHaveLength(0);

      timerService.stop();
    });
  });
});
