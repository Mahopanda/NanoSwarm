import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { bold, green, red, dim, banner } from '../utils/print.ts';

const CONFIG_DIR = join(homedir(), '.nanoswarm');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

export interface StatusResult {
  configExists: boolean;
  workspaceExists: boolean;
  model: string | null;
  providers: Record<string, boolean>;
  port: number;
}

export async function getStatus(): Promise<StatusResult> {
  const result: StatusResult = {
    configExists: false,
    workspaceExists: false,
    model: null,
    providers: { gemini: false, anthropic: false, openai: false },
    port: 4000,
  };

  if (!(await fileExists(CONFIG_PATH))) return result;

  result.configExists = true;
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(raw);

    result.model = config.agents?.defaults?.model ?? null;
    result.port = config.server?.port ?? 4000;

    const workspace = config.agents?.defaults?.workspace ?? join(CONFIG_DIR, 'workspace');
    result.workspaceExists = await fileExists(join(workspace, 'SOUL.md'));

    if (config.providers?.gemini?.apiKey || config.providers?.google?.apiKey) {
      result.providers.gemini = true;
    }
    if (config.providers?.anthropic?.apiKey) {
      result.providers.anthropic = true;
    }
    if (config.providers?.openai?.apiKey) {
      result.providers.openai = true;
    }
  } catch {
    // config exists but is invalid
  }

  return result;
}

export async function runStatus(): Promise<void> {
  banner('NanoSwarm Status');

  const status = await getStatus();

  if (!status.configExists) {
    console.log(`Config:    ${CONFIG_PATH} ${red('✗ not found')}`);
    console.log(`\nRun ${bold('nanoswarm onboard')} to set up.`);
    return;
  }

  const configMark = status.configExists ? green('✓') : red('✗ not found');
  const wsMark = status.workspaceExists ? green('✓') : red('✗ not found');

  console.log(`Config:    ${CONFIG_PATH} ${configMark}`);
  console.log(`Workspace: ${status.workspaceExists ? green('✓') : red('✗')} ${dim('(SOUL.md check)')}`);
  console.log(`Model:     ${status.model ?? dim('not set')}`);
  console.log('Providers:');
  for (const [name, configured] of Object.entries(status.providers)) {
    const mark = configured ? `${green('✓')} configured` : `${dim('-')} not set`;
    console.log(`  ${name.padEnd(12)} ${mark}`);
  }
  console.log(`Server:    port ${status.port}`);
}
