import { resolve } from 'node:path';
import { loadConfig, resolveModel, resolveWorkspace, createServer } from '@nanoswarm/server';
import { bold, green, dim } from '../utils/print.ts';

export async function runAgent(args: string[]): Promise<void> {
  // Parse -m flag for one-shot mode
  const mIndex = args.indexOf('-m');
  const oneShot = mIndex !== -1 ? args[mIndex + 1] : null;

  const config = await loadConfig();
  const model = resolveModel(config);
  const workspace = process.env.WORKSPACE
    ? resolve(process.env.WORKSPACE)
    : await resolveWorkspace(config);

  if (oneShot) {
    // One-shot mode: send message, print result, exit
    console.log(dim(`[NanoSwarm] One-shot mode\n`));

    const server = await createServer({
      name: config.server?.name ?? 'NanoSwarm',
      model,
      workspace,
    });

    try {
      const result = await server.agent.chat('cli-oneshot', oneShot);
      console.log(result.text);
    } finally {
      await server.stop();
    }
  } else {
    // Interactive mode: start with CLI channel
    console.log(bold('NanoSwarm Agent'));
    console.log(dim('Type "exit" to quit.\n'));

    const server = await createServer({
      name: config.server?.name ?? 'NanoSwarm',
      port: config.server?.port ?? 4000,
      host: config.server?.host ?? 'localhost',
      model,
      workspace,
      channels: {
        cli: { enabled: true, prompt: `${green('You')}: ` },
      },
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
}
