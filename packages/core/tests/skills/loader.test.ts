import { describe, it, expect, beforeEach } from 'bun:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SkillLoader } from '../../src/skills/loader.ts';

describe('SkillLoader', () => {
  let skillsDir: string;
  let loader: SkillLoader;

  beforeEach(async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'nanoswarm-skills-'));
    skillsDir = join(tempDir, 'skills');
    await mkdir(skillsDir, { recursive: true });
    loader = new SkillLoader();
  });

  async function createSkill(name: string, content: string): Promise<void> {
    const dir = join(skillsDir, name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), content, 'utf-8');
  }

  it('should load skills from directory', async () => {
    await createSkill('greeting', `---
name: Greeting
description: Greet the user
tags: [social, basic]
alwaysLoad: true
tools: [message]
inputModes: [text]
outputModes: [text]
---
# Greeting Skill

Always greet the user warmly.`);

    await loader.loadAll(skillsDir);
    const skill = loader.getSkill('greeting');

    expect(skill).toBeDefined();
    expect(skill!.name).toBe('Greeting');
    expect(skill!.description).toBe('Greet the user');
    expect(skill!.tags).toEqual(['social', 'basic']);
    expect(skill!.alwaysLoad).toBe(true);
    expect(skill!.tools).toEqual(['message']);
    expect(skill!.content).toContain('# Greeting Skill');
  });

  it('should parse frontmatter without brackets in lists', async () => {
    await createSkill('test', `---
name: Test
tags: alpha, beta
---
Body content`);

    await loader.loadAll(skillsDir);
    const skill = loader.getSkill('test');
    expect(skill!.tags).toEqual(['alpha', 'beta']);
  });

  it('should return always-load content', async () => {
    await createSkill('always', `---
name: Always
alwaysLoad: true
---
Always loaded content here.`);

    await createSkill('ondemand', `---
name: OnDemand
alwaysLoad: false
---
On demand content.`);

    await loader.loadAll(skillsDir);
    const content = loader.getAlwaysLoadContent();
    expect(content).toContain('Always loaded content here.');
    expect(content).not.toContain('On demand content.');
  });

  it('should return XML skills summary for on-demand skills', async () => {
    await createSkill('always', `---
name: Always
alwaysLoad: true
---
Content`);

    await createSkill('search', `---
name: Web Search
description: Search the web
alwaysLoad: false
---
Search content`);

    await loader.loadAll(skillsDir);
    const summary = loader.getSkillsSummary();
    expect(summary).toContain('<skills>');
    expect(summary).toContain('<name>Web Search</name>');
    expect(summary).toContain('<description>Search the web</description>');
    expect(summary).not.toContain('<name>Always</name>');
  });

  it('should handle non-existent skills directory', async () => {
    await loader.loadAll('/non/existent/path');
    expect(loader.allSkills).toHaveLength(0);
  });

  it('should skip directories without SKILL.md', async () => {
    await mkdir(join(skillsDir, 'empty-dir'), { recursive: true });
    await createSkill('valid', `---
name: Valid
---
Content`);

    await loader.loadAll(skillsDir);
    expect(loader.allSkills).toHaveLength(1);
    expect(loader.allSkills[0].name).toBe('Valid');
  });

  it('should handle SKILL.md without frontmatter', async () => {
    await createSkill('nofm', '# Just content\nNo frontmatter here.');
    await loader.loadAll(skillsDir);

    const skill = loader.getSkill('nofm');
    expect(skill).toBeDefined();
    expect(skill!.name).toBe('nofm'); // falls back to id
    expect(skill!.content).toContain('# Just content');
  });

  it('should list all skills', async () => {
    await createSkill('a', '---\nname: A\n---\nA');
    await createSkill('b', '---\nname: B\n---\nB');
    await loader.loadAll(skillsDir);
    expect(loader.allSkills).toHaveLength(2);
  });
});
