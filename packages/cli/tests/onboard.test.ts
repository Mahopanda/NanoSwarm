import { describe, it, expect } from 'bun:test';
import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scaffoldWorkspace } from '../src/commands/onboard.ts';
import { BOOTSTRAP_FILES, MEMORY_FILES } from '../src/templates/bootstrap.ts';

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe('Onboard', () => {
  describe('scaffoldWorkspace', () => {
    it('should create full directory structure', async () => {
      const workspace = await mkdtemp(join(tmpdir(), 'nanoswarm-onboard-'));
      const clawhubSource = join(tmpdir(), 'clawhub-source-nonexistent');

      await scaffoldWorkspace(workspace, clawhubSource);

      // Check bootstrap files
      for (const filename of Object.keys(BOOTSTRAP_FILES)) {
        expect(await fileExists(join(workspace, filename))).toBe(true);
      }

      // Check memory dir
      for (const filename of Object.keys(MEMORY_FILES)) {
        expect(await fileExists(join(workspace, '.nanoswarm', 'memory', filename))).toBe(true);
      }

      // Check skills dir
      expect(await fileExists(join(workspace, '.nanoswarm', 'skills', 'clawhub', 'SKILL.md'))).toBe(true);
    });

    it('should not overwrite existing files', async () => {
      const workspace = await mkdtemp(join(tmpdir(), 'nanoswarm-onboard-'));
      const { writeFile } = await import('node:fs/promises');

      // Pre-create SOUL.md with custom content
      await writeFile(join(workspace, 'SOUL.md'), 'custom soul content', 'utf-8');

      const clawhubSource = join(tmpdir(), 'clawhub-source-nonexistent');
      await scaffoldWorkspace(workspace, clawhubSource);

      // SOUL.md should retain custom content
      const content = await readFile(join(workspace, 'SOUL.md'), 'utf-8');
      expect(content).toBe('custom soul content');

      // Other files should still be created
      expect(await fileExists(join(workspace, 'AGENTS.md'))).toBe(true);
    });

    it('should create bootstrap files with correct content', async () => {
      const workspace = await mkdtemp(join(tmpdir(), 'nanoswarm-onboard-'));
      const clawhubSource = join(tmpdir(), 'clawhub-source-nonexistent');

      await scaffoldWorkspace(workspace, clawhubSource);

      for (const [filename, expectedContent] of Object.entries(BOOTSTRAP_FILES)) {
        const content = await readFile(join(workspace, filename), 'utf-8');
        expect(content).toBe(expectedContent);
      }
    });

    it('should create ClawHub skill in skills directory', async () => {
      const workspace = await mkdtemp(join(tmpdir(), 'nanoswarm-onboard-'));
      const clawhubSource = join(tmpdir(), 'clawhub-source-nonexistent');

      await scaffoldWorkspace(workspace, clawhubSource);

      const skillPath = join(workspace, '.nanoswarm', 'skills', 'clawhub', 'SKILL.md');
      expect(await fileExists(skillPath)).toBe(true);

      const content = await readFile(skillPath, 'utf-8');
      expect(content).toContain('ClawHub');
      expect(content).toContain('Benign');
    });

    it('should create memory files with correct content', async () => {
      const workspace = await mkdtemp(join(tmpdir(), 'nanoswarm-onboard-'));
      const clawhubSource = join(tmpdir(), 'clawhub-source-nonexistent');

      await scaffoldWorkspace(workspace, clawhubSource);

      for (const [filename, expectedContent] of Object.entries(MEMORY_FILES)) {
        const path = join(workspace, '.nanoswarm', 'memory', filename);
        const content = await readFile(path, 'utf-8');
        expect(content).toBe(expectedContent);
      }
    });
  });
});
