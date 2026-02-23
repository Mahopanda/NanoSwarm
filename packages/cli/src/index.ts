#!/usr/bin/env bun
import { printUsage } from './utils/print.ts';

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case 'onboard': {
    const { runOnboard } = await import('./commands/onboard.ts');
    await runOnboard();
    break;
  }
  case 'status': {
    const { runStatus } = await import('./commands/status.ts');
    await runStatus();
    break;
  }
  case 'agent': {
    const { runAgent } = await import('./commands/agent.ts');
    await runAgent(rest);
    break;
  }
  case 'gateway': {
    const { runGateway } = await import('./commands/gateway.ts');
    await runGateway();
    break;
  }
  default:
    printUsage();
    break;
}
