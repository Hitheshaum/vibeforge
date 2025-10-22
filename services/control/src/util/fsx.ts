import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Filesystem utilities
 */

export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

export async function writeJson(filePath: string, data: any): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function readJson<T = any>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function copyFile(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function readFile(filePath: string): Promise<string> {
  return await fs.readFile(filePath, 'utf-8');
}

export async function listDir(dirPath: string): Promise<string[]> {
  return await fs.readdir(dirPath);
}

export async function removeDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
}

export async function initGitRepo(repoPath: string, appName: string): Promise<void> {
  const cwd = repoPath;

  try {
    // Initialize git repository
    await execAsync('git init', { cwd });

    // Configure git
    await execAsync('git config user.name "VibeForge"', { cwd });
    await execAsync('git config user.email "vibe@vibeforge.dev"', { cwd });

    // Add all files
    await execAsync('git add .', { cwd });

    // Initial commit
    await execAsync(`git commit -m "Initial commit for ${appName}"`, { cwd });

    console.log(`[Git] Initialized repository in ${repoPath}`);
  } catch (error: any) {
    console.error(`[Git] Failed to initialize repository: ${error.message}`);
    throw error;
  }
}
