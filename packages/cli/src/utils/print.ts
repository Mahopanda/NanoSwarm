const ESC = '\x1b[';

export const bold = (s: string) => `${ESC}1m${s}${ESC}0m`;
export const dim = (s: string) => `${ESC}2m${s}${ESC}0m`;
export const green = (s: string) => `${ESC}32m${s}${ESC}0m`;
export const red = (s: string) => `${ESC}31m${s}${ESC}0m`;
export const yellow = (s: string) => `${ESC}33m${s}${ESC}0m`;
export const cyan = (s: string) => `${ESC}36m${s}${ESC}0m`;

export function banner(title: string): void {
  const line = '─'.repeat(title.length + 4);
  console.log(bold(title));
  console.log(dim(line));
}

export function printUsage(): void {
  console.log(`
${bold('NanoSwarm CLI')} v0.1.0

${bold('Usage:')} nanoswarm <command> [options]

${bold('Commands:')}
  onboard     Interactive setup wizard
  status      Show configuration status
  agent       Chat with your agent (-m "msg" for one-shot)
  gateway     Start the HTTP server

${bold('Examples:')}
  nanoswarm onboard
  nanoswarm agent -m "hello"
  nanoswarm gateway
`);
}
