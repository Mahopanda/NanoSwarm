export interface CronSchedule {
  kind: 'at' | 'every' | 'cron';
  atMs?: number;
  everyMs?: number;
  expr?: string;
  tz?: string;
}

export interface CronPayload {
  message: string;
}

export interface CronJobState {
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: 'ok' | 'error' | 'skipped';
  lastError?: string;
}

export interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: CronSchedule;
  payload: CronPayload;
  state: CronJobState;
  createdAtMs: number;
  updatedAtMs: number;
  deleteAfterRun: boolean;
}

export interface CronStore {
  version: number;
  jobs: CronJob[];
}
