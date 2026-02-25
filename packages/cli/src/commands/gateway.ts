import { join, resolve } from 'node:path';
import { loadConfig, resolveModel, resolveWorkspace, createServer } from '@nanoswarm/server';
import { createStores } from '@nanoswarm/core';
import { dim } from '../utils/print.ts';

export async function runGateway(): Promise<void> {
  const config = await loadConfig();
  const model = resolveModel(config);

  const workspace = process.env.WORKSPACE
    ? resolve(process.env.WORKSPACE)
    : await resolveWorkspace(config);

  // Create stores (sqlite or file-based)
  const storeType = config.stores?.type ?? 'file';
  const stores = createStores({
    type: storeType,
    sqlitePath: config.stores?.sqlitePath ?? join(workspace, '.nanoswarm', 'nanoswarm.db'),
    workspace,
  });
  if (storeType === 'sqlite') {
    console.log(dim(`[NanoSwarm] Using SQLite store: ${config.stores?.sqlitePath ?? join(workspace, '.nanoswarm', 'nanoswarm.db')}`));
  }

  const server = await createServer({
    name: config.server?.name ?? 'NanoSwarm',
    port: config.server?.port ?? (Number(process.env.PORT) || 4000),
    host: config.server?.host ?? 'localhost',
    adminApiKey: config.server?.adminApiKey,
    model,
    workspace,
    stores,
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
