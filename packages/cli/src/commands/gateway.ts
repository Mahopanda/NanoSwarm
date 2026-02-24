import { resolve } from 'node:path';
import { loadConfig, resolveModel, resolveWorkspace, createServer } from '@nanoswarm/server';
import { dim } from '../utils/print.ts';

export async function runGateway(): Promise<void> {
  const config = await loadConfig();
  const model = resolveModel(config);

  const workspace = process.env.WORKSPACE
    ? resolve(process.env.WORKSPACE)
    : await resolveWorkspace(config);

  const server = await createServer({
    name: config.server?.name ?? 'NanoSwarm',
    port: config.server?.port ?? (Number(process.env.PORT) || 4000),
    host: config.server?.host ?? 'localhost',
    model,
    workspace,
    externalAgents: config.externalAgents,
    channels: config.channels,
  });

  await server.start();

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
      console.log(dim('\n[NanoSwarm] Shutting down...'));
      await server.stop();
      process.exit(0);
    });
  }
}
