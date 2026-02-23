import { z } from 'zod';
import type { NanoTool } from './base.ts';
import type { CronService } from '../cron/service.ts';
import type { CronSchedule } from '../cron/types.ts';

export function createCronTool(service: CronService): NanoTool {
  return {
    name: 'cron',
    description:
      'Schedule reminders, recurring tasks, and periodic agent jobs. ' +
      "Set task_type='direct' for simple reminders (message sent as-is). " +
      "Set task_type='agent' for complex tasks that need agent processing (web_search, etc.). " +
      'Actions: add, list, remove.',
    parameters: z.object({
      action: z.enum(['add', 'list', 'remove']).describe('The action to perform'),
      message: z.string().optional().describe('Message or instruction for the agent to execute when the job fires (for add). Can be a simple reminder or a complex instruction.'),
      every_seconds: z.number().optional().describe('Run every N seconds (for add with interval schedule)'),
      cron_expr: z.string().optional().describe('Cron expression (for add with cron schedule)'),
      tz: z.string().optional().describe('Timezone for cron expression (e.g., "Asia/Taipei")'),
      at: z.string().optional().describe('ISO datetime string for one-time execution (for add with at schedule)'),
      job_id: z.string().optional().describe('Job ID (required for remove)'),
      task_type: z.enum(['direct', 'agent']).optional().describe("Job type: 'direct' sends the message as-is (for reminders), 'agent' processes through the agent loop (for complex tasks). Default: direct"),
    }),
    execute: async (params, context) => {
      switch (params.action) {
        case 'add': {
          if (!params.message) {
            return 'Error: message is required for add action';
          }

          let schedule: CronSchedule;
          let deleteAfterRun = false;

          if (params.every_seconds) {
            schedule = { kind: 'every', everyMs: params.every_seconds * 1000 };
          } else if (params.cron_expr) {
            schedule = { kind: 'cron', expr: params.cron_expr, tz: params.tz };
          } else if (params.at) {
            const atMs = Date.parse(params.at);
            if (isNaN(atMs)) {
              return 'Error: invalid datetime format for "at"';
            }
            schedule = { kind: 'at', atMs };
            deleteAfterRun = true;
          } else {
            return 'Error: one of every_seconds, cron_expr, or at is required for add';
          }

          const payloadKind = params.task_type === 'agent' ? 'agent_turn' as const : 'direct_deliver' as const;
          const job = service.addJob({
            name: params.message.slice(0, 50),
            schedule,
            message: params.message,
            deleteAfterRun,
            payloadKind,
            deliver: true,
            channel: context.channel,
            to: context.chatId,
          });

          return `Job added: ${job.id} (${job.name})`;
        }

        case 'list': {
          const jobs = service.listJobs(true);
          if (jobs.length === 0) return 'No scheduled jobs';
          return jobs
            .map(
              (j) =>
                `[${j.id}] ${j.name} | ${j.enabled ? 'enabled' : 'disabled'} | ${j.schedule.kind} | next: ${j.state.nextRunAtMs ? new Date(j.state.nextRunAtMs).toISOString() : 'none'}`,
            )
            .join('\n');
        }

        case 'remove': {
          if (!params.job_id) {
            return 'Error: job_id is required for remove action';
          }
          const removed = service.removeJob(params.job_id);
          return removed ? `Job ${params.job_id} removed` : `Job ${params.job_id} not found`;
        }

        default:
          return `Error: unknown action "${params.action}"`;
      }
    },
  };
}
