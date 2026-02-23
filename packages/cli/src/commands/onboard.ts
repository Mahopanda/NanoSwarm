import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { confirm, closePrompt } from '../utils/prompt.ts';
import { bold, green, dim, yellow } from '../utils/print.ts';
import { defaultConfig } from '../templates/config.ts';
import { BOOTSTRAP_FILES, MEMORY_FILES, CLAWHUB_SKILL_PATH } from '../templates/bootstrap.ts';

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

async function writeIfNotExists(path: string, content: string): Promise<boolean> {
  if (await fileExists(path)) return false;
  await writeFile(path, content, 'utf-8');
  return true;
}

export async function scaffoldWorkspace(workspace: string, clawhubSourceDir: string): Promise<void> {
  // Create workspace directories
  const memoryDir = join(workspace, '.nanoswarm', 'memory');
  const skillsDir = join(workspace, '.nanoswarm', 'skills', 'clawhub');
  await mkdir(memoryDir, { recursive: true });
  await mkdir(skillsDir, { recursive: true });

  // Write bootstrap files (SOUL.md, AGENTS.md, USER.md, TOOLS.md)
  for (const [filename, content] of Object.entries(BOOTSTRAP_FILES)) {
    const path = join(workspace, filename);
    if (await writeIfNotExists(path, content)) {
      console.log(`  ${green('+')} ${filename}`);
    } else {
      console.log(`  ${dim('-')} ${filename} ${dim('(already exists)')}`);
    }
  }

  // Write memory files (MEMORY.md, HISTORY.md)
  for (const [filename, content] of Object.entries(MEMORY_FILES)) {
    const path = join(memoryDir, filename);
    if (await writeIfNotExists(path, content)) {
      console.log(`  ${green('+')} .nanoswarm/memory/${filename}`);
    } else {
      console.log(`  ${dim('-')} .nanoswarm/memory/${filename} ${dim('(already exists)')}`);
    }
  }

  // Copy ClawHub skill
  const clawhubSource = join(clawhubSourceDir, CLAWHUB_SKILL_PATH);
  const clawhubDest = join(skillsDir, 'SKILL.md');
  if (await writeIfNotExists(clawhubDest, '')) {
    // Write placeholder first to check, then copy actual file
    try {
      await copyFile(clawhubSource, clawhubDest);
      console.log(`  ${green('+')} .nanoswarm/skills/clawhub/SKILL.md`);
    } catch {
      // If source doesn't exist, write inline content
      const { readFile: rf } = await import('node:fs/promises');
      try {
        const content = await rf(clawhubSource, 'utf-8');
        await writeFile(clawhubDest, content, 'utf-8');
      } catch {
        // Fallback: write a minimal skill file
        await writeFile(clawhubDest, getInlineClawHubSkill(), 'utf-8');
      }
      console.log(`  ${green('+')} .nanoswarm/skills/clawhub/SKILL.md`);
    }
  } else {
    console.log(`  ${dim('-')} .nanoswarm/skills/clawhub/SKILL.md ${dim('(already exists)')}`);
  }
}

function getInlineClawHubSkill(): string {
  return `---
name: ClawHub
description: Search and install public skills from ClawHub registry with mandatory security verification
tags: [skills, clawhub, install, security]
alwaysLoad: true
tools: [exec]
inputModes: [text]
outputModes: [text]
---

# ClawHub Skill

Search and install skills from ClawHub. Always verify safety (VirusTotal + OpenClaw must both be "Benign") before installing.

## Commands
- Search: \`npx clawhub search "<query>" --limit 5\`
- Inspect: \`npx clawhub inspect <slug> --json\`
- Install: \`npx clawhub install <slug> --workdir {workspace}\`

## Safety Rules
1. Both virusTotalVerdict and openClawVerdict must be "Benign"
2. Missing fields = unverified = refuse installation
3. Non-Benign = refuse + warn user
`;
}

export function getClawHubSourceDir(): string {
  // Resolve from @nanoswarm/core package
  const coreSkillsDir = join(
    import.meta.dir,
    '..', '..', '..', '..', 'core', 'src', 'skills', 'builtin',
  );
  return coreSkillsDir;
}

export async function runOnboard(): Promise<void> {
  console.log(bold('\nNanoSwarm Setup\n'));

  // Check existing config
  if (await fileExists(CONFIG_PATH)) {
    // If running without TTY (e.g. Docker), skip confirmation and refresh
    if (!process.stdin.isTTY) {
      console.log(dim('Config already exists. Refreshing workspace files.'));
    } else {
      const overwrite = await confirm(
        `${yellow('Config already exists at')} ${CONFIG_PATH}. Overwrite?`,
        false,
      );
      closePrompt();
      if (!overwrite) {
        console.log(dim('Keeping existing config.'));
        return;
      }
    }
  } else {
    // Create default config with placeholder
    await mkdir(CONFIG_DIR, { recursive: true });
    const workspace = join(CONFIG_DIR, 'workspace');
    const config = defaultConfig({
      provider: 'gemini',
      apiKey: 'YOUR_API_KEY',
      model: 'gemini-2.0-flash',
      workspace,
    });
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    console.log(`${green('+')} ${CONFIG_PATH}`);
  }

  // Scaffold workspace
  const workspace = join(CONFIG_DIR, 'workspace');
  console.log(`\n${bold('Creating workspace:')}`);
  await scaffoldWorkspace(workspace, getClawHubSourceDir());

  // Success
  console.log(`
${green(bold('Setup complete!'))}

${bold('Next steps:')}
  1. Add your API key to ${dim(CONFIG_PATH)}
  2. Edit ${dim(join(workspace, 'SOUL.md'))} to customize your agent
  3. Run ${bold('nanoswarm gateway')} to start
`);
}
