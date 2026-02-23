export const SOUL_MD = `# SOUL

You are a helpful AI assistant powered by NanoSwarm.

## Personality
- Friendly, concise, and accurate
- Ask clarifying questions when the request is ambiguous
- Use tools when they would help accomplish the task

## Guidelines
- Always respond in the user's language
- Be transparent about your limitations
- Provide structured output when appropriate
`;

export const AGENTS_MD = `# AGENTS

## Default Agent
- Role: General assistant
- Capabilities: All available tools
- This file defines multi-agent configuration. Add more agents as needed.
`;

export const USER_MD = `# USER

## Preferences
- Language: (auto-detect)
- Response style: Concise

## Notes
- Add any personal preferences or context here
`;

export const TOOLS_MD = `# TOOLS

## Available Built-in Tools
- read_file: Read file contents
- write_file: Write content to a file
- edit_file: Edit specific sections of a file
- list_dir: List directory contents
- exec: Execute shell commands
- web_search: Search the web
- web_fetch: Fetch a URL
- message: Send messages to other agents
- spawn: Create background sub-agents
- cron: Schedule recurring tasks

## Tool Configuration
- exec timeout: 30000ms (default)
- File operations are restricted to workspace directory
`;

export const MEMORY_MD = `# MEMORY

This file stores persistent memory across conversations.
The agent will read and update this file automatically.
`;

export const HISTORY_MD = `# HISTORY

Conversation history summaries are stored here.
This file is updated during memory consolidation.
`;

export const CLAWHUB_SKILL_PATH = 'clawhub/SKILL.md';

export const BOOTSTRAP_FILES: Record<string, string> = {
  'SOUL.md': SOUL_MD,
  'AGENTS.md': AGENTS_MD,
  'USER.md': USER_MD,
  'TOOLS.md': TOOLS_MD,
};

export const MEMORY_FILES: Record<string, string> = {
  'MEMORY.md': MEMORY_MD,
  'HISTORY.md': HISTORY_MD,
};
