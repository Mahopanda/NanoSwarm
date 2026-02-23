import * as readline from 'node:readline';

let iface: readline.Interface | null = null;
let lineBuffer: string[] = [];
let lineResolvers: Array<(line: string) => void> = [];
let eofReached = false;

function ensureInterface(): void {
  if (iface) return;
  iface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY ?? false,
  });
  iface.on('line', (line) => {
    const resolver = lineResolvers.shift();
    if (resolver) {
      resolver(line);
    } else {
      lineBuffer.push(line);
    }
  });
  iface.on('close', () => {
    eofReached = true;
    // Resolve any remaining waiters with empty string
    for (const resolver of lineResolvers) {
      resolver('');
    }
    lineResolvers = [];
  });
}

function nextLine(): Promise<string> {
  if (lineBuffer.length > 0) {
    return Promise.resolve(lineBuffer.shift()!);
  }
  if (eofReached) {
    return Promise.resolve('');
  }
  return new Promise<string>((resolve) => {
    lineResolvers.push(resolve);
  });
}

export function closePrompt(): void {
  iface?.close();
  iface = null;
  lineBuffer = [];
  lineResolvers = [];
  eofReached = false;
}

export async function ask(question: string, defaultValue?: string): Promise<string> {
  ensureInterface();
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  process.stdout.write(`${question}${suffix}: `);
  const answer = await nextLine();
  return answer.trim() || defaultValue || '';
}

export async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = await ask(`${question} [${hint}]`);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

export async function select(question: string, options: string[], defaultIndex = 0): Promise<string> {
  console.log(question);
  for (let i = 0; i < options.length; i++) {
    const marker = i === defaultIndex ? '>' : ' ';
    console.log(`  ${marker} ${i + 1}. ${options[i]}`);
  }
  const answer = await ask('Choose', String(defaultIndex + 1));
  const idx = parseInt(answer, 10) - 1;
  if (idx >= 0 && idx < options.length) return options[idx];
  return options[defaultIndex];
}
