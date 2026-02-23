# NanoSwarm

A TypeScript multi-agent swarm framework based on the [Google A2A Protocol](https://github.com/google/A2A).

Built with [Bun](https://bun.sh) and the [Vercel AI SDK](https://sdk.vercel.ai).

## Quick Start

```bash
# Install dependencies
bun install

# Run tests
bun test

# Start dev server
bun run dev
```

## Project Structure

```
packages/
  core/       # @nanoswarm/core — agent engine, tools, memory
  server/     # @nanoswarm/server — A2A HTTP server
workspace/    # Bootstrap Files (SOUL.md, AGENTS.md, USER.md, TOOLS.md)
skills/       # Skill definitions
data/         # SQLite data directory
```

This project is an independent research and experimental effort 
developed entirely on personal time using personal equipment. 
It is not affiliated with, sponsored by, or endorsed by any employer or organization.

All original design decisions, code, and documentation are the author’s own work.

Some ideas and technical approaches were inspired by existing open-source projects. 
Any such projects are referenced or acknowledged where appropriate.
