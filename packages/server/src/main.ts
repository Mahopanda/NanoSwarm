import { resolve } from 'node:path';
import { loadConfig, resolveModel, resolveWorkspace } from './config.ts';
import { createServer } from './server.ts';

// Load config
const config = await loadConfig();
const model = resolveModel(config);

// Support WORKSPACE env override for development
const workspace = process.env.WORKSPACE
  ? resolve(process.env.WORKSPACE)
  : await resolveWorkspace(config);

const server = await createServer({
  name: config.server?.name ?? 'NanoSwarm',
  port: config.server?.port ?? Number(process.env.PORT) || 4000,
  host: config.server?.host ?? 'localhost',
  model,
  workspace,
});

await server.start();

// Graceful shutdown
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    console.log(`\n[NanoSwarm] Shutting down...`);
    await server.stop();
    process.exit(0);
  });
}
