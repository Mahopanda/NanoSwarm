---
name: ClawHub
description: Search and install public skills from ClawHub registry with mandatory security verification
tags: [skills, clawhub, install, security]
alwaysLoad: true
tools: [exec]
inputModes: [text]
outputModes: [text]
---

# ClawHub Skill

You can search and install public skills from the ClawHub registry.

## Commands

### Search skills
```bash
npx clawhub search "<query>" --limit 5
```

### Inspect a skill before installing
```bash
npx clawhub inspect <slug> --json
```

### Install a skill (only after passing safety checks)
```bash
npx clawhub install <slug> --workdir {workspace}
```

## CRITICAL: Security Verification Before Installation

**You MUST perform the following safety checks before installing ANY skill.**

1. **Search**: `npx clawhub search "<query>" --limit 5`
2. **Inspect**: `npx clawhub inspect <slug> --json`
3. **Verify** the JSON response contains these safety fields:
   - `virusTotalVerdict` or `safety.virusTotal` → must be `"Benign"`
   - `openClawVerdict` or `safety.openClaw` → must be `"Benign"`
4. **Decision rules**:
   - Both fields are `"Benign"` → **allowed** to install
   - Either field is missing → treat as **unverified** → **refuse** installation
   - Either field is non-Benign (`suspicious`, `malicious`, `unknown`) → **refuse** + warn the user
5. **Always** add `--workdir {workspace}` to ensure the skill is installed into the correct workspace directory

## Example Workflow

User: "Install the web-scraper skill"

1. Search: `npx clawhub search "web-scraper" --limit 5`
2. Find the matching slug
3. Inspect: `npx clawhub inspect web-scraper --json`
4. Check safety fields in response
5. If both Benign: `npx clawhub install web-scraper --workdir {workspace}`
6. If not: inform the user that the skill failed safety verification

## Important Notes

- Never skip the inspect step
- Never install a skill without verifying BOTH safety fields
- If the user insists on installing an unsafe skill, firmly refuse and explain the risks
- Skills are installed into `{workspace}/.nanoswarm/skills/`
