import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { CronExpressionParser } from 'cron-parser';
import type { CronJob, CronSchedule, CronStore } from './types.ts';

export class CronService {
  private store: CronStore = { version: 1, jobs: [] };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private storePath: string;

  constructor(
    storeDir: string,
    private onJob?: (job: CronJob) => Promise<string | null>,
  ) {
    this.storePath = join(storeDir, 'cron-store.json');
  }

  async start(): Promise<void> {
    await this.loadStore();
    this.armTimer();
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  addJob(opts: {
    name: string;
    schedule: CronSchedule;
    message: string;
    deleteAfterRun?: boolean;
  }): CronJob {
    const now = Date.now();
    const job: CronJob = {
      id: randomBytes(4).toString('hex'),
      name: opts.name,
      enabled: true,
      schedule: opts.schedule,
      payload: { message: opts.message },
      state: {
        nextRunAtMs: this.computeNextRun(opts.schedule, now),
      },
      createdAtMs: now,
      updatedAtMs: now,
      deleteAfterRun: opts.deleteAfterRun ?? false,
    };

    this.store.jobs.push(job);
    this.saveStore().catch(() => {});
    this.armTimer();
    return job;
  }

  listJobs(includeDisabled?: boolean): CronJob[] {
    if (includeDisabled) return [...this.store.jobs];
    return this.store.jobs.filter((j) => j.enabled);
  }

  removeJob(jobId: string): boolean {
    const idx = this.store.jobs.findIndex((j) => j.id === jobId);
    if (idx === -1) return false;
    this.store.jobs.splice(idx, 1);
    this.saveStore().catch(() => {});
    this.armTimer();
    return true;
  }

  enableJob(jobId: string, enabled: boolean): CronJob | undefined {
    const job = this.store.jobs.find((j) => j.id === jobId);
    if (!job) return undefined;
    job.enabled = enabled;
    job.updatedAtMs = Date.now();
    if (enabled) {
      job.state.nextRunAtMs = this.computeNextRun(job.schedule, Date.now());
    }
    this.saveStore().catch(() => {});
    this.armTimer();
    return job;
  }

  private async loadStore(): Promise<void> {
    try {
      const data = await readFile(this.storePath, 'utf-8');
      this.store = JSON.parse(data) as CronStore;
    } catch {
      this.store = { version: 1, jobs: [] };
    }
  }

  async saveStore(): Promise<void> {
    await mkdir(join(this.storePath, '..'), { recursive: true });
    await writeFile(this.storePath, JSON.stringify(this.store, null, 2), 'utf-8');
  }

  computeNextRun(schedule: CronSchedule, nowMs: number): number | undefined {
    switch (schedule.kind) {
      case 'at':
        return schedule.atMs !== undefined && schedule.atMs > nowMs ? schedule.atMs : undefined;
      case 'every':
        return schedule.everyMs ? nowMs + schedule.everyMs : undefined;
      case 'cron': {
        if (!schedule.expr) return undefined;
        try {
          const options: { tz?: string; currentDate?: Date } = {};
          if (schedule.tz) options.tz = schedule.tz;
          options.currentDate = new Date(nowMs);
          const expr = CronExpressionParser.parse(schedule.expr, options);
          return expr.next().toDate().getTime();
        } catch {
          return undefined;
        }
      }
      default:
        return undefined;
    }
  }

  private armTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const now = Date.now();
    let earliest: number | undefined;

    for (const job of this.store.jobs) {
      if (!job.enabled || job.state.nextRunAtMs === undefined) continue;
      if (earliest === undefined || job.state.nextRunAtMs < earliest) {
        earliest = job.state.nextRunAtMs;
      }
    }

    if (earliest === undefined) return;

    const delay = Math.max(0, earliest - now);
    this.timer = setTimeout(() => this.onTimer(), delay);
  }

  private async onTimer(): Promise<void> {
    this.timer = null;
    const now = Date.now();

    const dueJobs = this.store.jobs.filter(
      (j) => j.enabled && j.state.nextRunAtMs !== undefined && j.state.nextRunAtMs <= now,
    );

    for (const job of dueJobs) {
      await this.executeJob(job);
    }

    this.armTimer();
  }

  private async executeJob(job: CronJob): Promise<void> {
    const now = Date.now();
    job.state.lastRunAtMs = now;

    try {
      if (this.onJob) {
        await this.onJob(job);
      }
      job.state.lastStatus = 'ok';
      job.state.lastError = undefined;
    } catch (err) {
      job.state.lastStatus = 'error';
      job.state.lastError = err instanceof Error ? err.message : String(err);
    }

    if (job.deleteAfterRun) {
      const idx = this.store.jobs.indexOf(job);
      if (idx !== -1) this.store.jobs.splice(idx, 1);
    } else {
      job.state.nextRunAtMs = this.computeNextRun(job.schedule, now);
      job.updatedAtMs = now;
    }

    await this.saveStore().catch(() => {});
  }
}
