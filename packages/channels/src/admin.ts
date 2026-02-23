export interface AgentStatus {
  running: boolean;
  idle: boolean;
  processingSeconds: number;
  currentSender: string | null;
  lastActivityAgo: number;
  messagesProcessed: number;
  errorsCount: number;
  uptimeSeconds: number;
  runningAgents: Array<{ taskId: string; label: string }>;
  cronJobs: number;
}

export interface AdminProvider {
  getStatus(): AgentStatus;
  getRunningTasks(): Array<{ taskId: string; label: string }>;
  cancelTask(taskId: string): boolean;
  getRecentLogs(count: number, filter?: 'error'): string[];
}
