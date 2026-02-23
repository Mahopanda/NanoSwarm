import * as readline from 'node:readline';

const rl = () =>
  readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

export async function ask(question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  const iface = rl();
  try {
    return await new Promise<string>((resolve) => {
      iface.question(`${question}${suffix}: `, (answer) => {
        resolve(answer.trim() || defaultValue || '');
      });
    });
  } finally {
    iface.close();
  }
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
