import { existsSync } from 'node:fs';
import { mkdir, readFile, rmdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.apipost-mcp');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export interface GlobalConfig {
  APIPOST_TOKEN?: string;
  APIPOST_HOST?: string;
  APIPOST_SECURITY_MODE?: string;
  APIPOST_DEFAULT_TEAM_NAME?: string;
  APIPOST_DEFAULT_PROJECT_NAME?: string;
  APIPOST_URL_PREFIX?: string;
  APIPOST_INLINE_COMMENTS?: string;
}

export async function loadGlobalConfig(): Promise<GlobalConfig> {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as GlobalConfig;
  } catch {
    return {};
  }
}

export async function saveGlobalConfig(config: GlobalConfig): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export async function removeGlobalConfig(): Promise<boolean> {
  if (!existsSync(CONFIG_PATH)) return false;
  await rm(CONFIG_PATH);
  try {
    await rmdir(CONFIG_DIR);
  } catch {
    // 目录非空（存在其他文件）则保留
  }
  return true;
}

export function applyGlobalConfig(config: GlobalConfig): void {
  for (const [key, value] of Object.entries(config)) {
    if (value !== undefined && !process.env[key]) {
      process.env[key] = value;
    }
  }
}
