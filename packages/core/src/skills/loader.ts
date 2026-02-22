import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { LoadedSkill } from './types.ts';

function parseFrontmatter(raw: string): { meta: Record<string, string>; content: string } {
  const meta: Record<string, string> = {};
  if (!raw.startsWith('---')) {
    return { meta, content: raw };
  }

  const endIdx = raw.indexOf('---', 3);
  if (endIdx === -1) {
    return { meta, content: raw };
  }

  const frontmatter = raw.slice(3, endIdx).trim();
  const content = raw.slice(endIdx + 3).trim();

  for (const line of frontmatter.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key) meta[key] = value;
  }

  return { meta, content };
}

function parseStringList(value: string | undefined): string[] {
  if (!value) return [];
  // Support [a, b, c] or a, b, c
  const cleaned = value.replace(/^\[|\]$/g, '');
  return cleaned.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseBool(value: string | undefined): boolean {
  if (!value) return false;
  return value.toLowerCase() === 'true';
}

function buildSkill(id: string, meta: Record<string, string>, content: string): LoadedSkill {
  return {
    id,
    name: meta['name'] || id,
    description: meta['description'] || '',
    tags: parseStringList(meta['tags']),
    content,
    tools: parseStringList(meta['tools']),
    alwaysLoad: parseBool(meta['alwaysLoad']),
    inputModes: parseStringList(meta['inputModes']) || ['text'],
    outputModes: parseStringList(meta['outputModes']) || ['text'],
  };
}

export class SkillLoader {
  private skills = new Map<string, LoadedSkill>();

  async loadAll(skillsDir: string): Promise<void> {
    let entries: string[];
    try {
      const dirEntries = await readdir(skillsDir, { withFileTypes: true });
      entries = dirEntries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      return; // skills dir doesn't exist — OK
    }

    for (const dirName of entries) {
      const skillFile = join(skillsDir, dirName, 'SKILL.md');
      let raw: string;
      try {
        raw = await readFile(skillFile, 'utf-8');
      } catch {
        continue; // no SKILL.md in this dir
      }

      const { meta, content } = parseFrontmatter(raw);
      const skill = buildSkill(dirName, meta, content);
      this.skills.set(skill.id, skill);
    }
  }

  getAlwaysLoadContent(): string {
    const parts: string[] = [];
    for (const skill of this.skills.values()) {
      if (skill.alwaysLoad) {
        parts.push(skill.content);
      }
    }
    return parts.join('\n\n');
  }

  getSkillsSummary(): string {
    const onDemand = Array.from(this.skills.values()).filter((s) => !s.alwaysLoad);
    if (onDemand.length === 0) return '';

    const items = onDemand.map(
      (s) =>
        `<skill available="true"><name>${s.name}</name><description>${s.description}</description><location>${s.id}/SKILL.md</location></skill>`,
    );
    return `<skills>\n${items.join('\n')}\n</skills>`;
  }

  getSkill(id: string): LoadedSkill | undefined {
    return this.skills.get(id);
  }

  get allSkills(): LoadedSkill[] {
    return Array.from(this.skills.values());
  }
}
