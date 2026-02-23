# TOOLS

> Available tools and their usage instructions.
> This file will be loaded as part of the Bootstrap Files context.

## Built-in Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents from the workspace |
| `write_file` | Write content to a file in the workspace |
| `edit_file` | Edit specific parts of an existing file |
| `list_dir` | List directory contents |
| `exec` | Execute a shell command |
| `web_search` | Search the web for information |
| `web_fetch` | Fetch content from a URL |
| `message` | Send a message to another agent |
| `spawn` | Spawn a sub-agent for background tasks |
| `cron` | Schedule recurring tasks |

## Usage Notes

- File tools (`read_file`, `write_file`, `edit_file`, `list_dir`) operate within the workspace directory.
- `exec` runs commands in the workspace root. Use with caution.
- `message` and `spawn` require configured agents in AGENTS.md.
- `cron` supports `at`, `every`, and cron expression formats.
