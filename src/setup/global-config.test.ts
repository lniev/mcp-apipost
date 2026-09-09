import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const fakeHome = vi.hoisted(() => `/tmp/apipost-mcp-gcfg-test-${process.pid}-${Date.now()}`);

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return { ...original, homedir: () => fakeHome };
});

import {
  getConfigPath,
  loadGlobalConfig,
  removeGlobalConfig,
  saveGlobalConfig,
} from './global-config.js';

const configDir = join(fakeHome, '.apipost-mcp');
const configPath = join(configDir, 'config.json');

describe('global-config', () => {
  beforeAll(() => {
    mkdirSync(fakeHome, { recursive: true });
  });

  afterAll(() => {
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it('getConfigPath 指向 home 下的 .apipost-mcp/config.json', () => {
    expect(getConfigPath()).toBe(configPath);
  });

  it('loadGlobalConfig：文件不存在返回空对象', async () => {
    expect(await loadGlobalConfig()).toEqual({});
  });

  it('saveGlobalConfig 写入后可读回，且自动创建目录', async () => {
    await saveGlobalConfig({ APIPOST_TOKEN: 't1', APIPOST_HOST: 'https://x' });
    expect(await loadGlobalConfig()).toEqual({ APIPOST_TOKEN: 't1', APIPOST_HOST: 'https://x' });
  });

  it('loadGlobalConfig：文件损坏返回空对象', async () => {
    writeFileSync(configPath, '{broken');
    expect(await loadGlobalConfig()).toEqual({});
  });

  it('removeGlobalConfig：文件不存在返回 false', async () => {
    rmSync(configDir, { recursive: true, force: true });
    expect(await removeGlobalConfig()).toBe(false);
  });

  it('removeGlobalConfig：删除配置文件并清理空目录', async () => {
    await saveGlobalConfig({ APIPOST_TOKEN: 't1' });
    expect(existsSync(configPath)).toBe(true);

    expect(await removeGlobalConfig()).toBe(true);
    expect(existsSync(configPath)).toBe(false);
    expect(existsSync(configDir)).toBe(false);
  });

  it('removeGlobalConfig：目录内有其他文件时保留目录', async () => {
    await saveGlobalConfig({ APIPOST_TOKEN: 't1' });
    writeFileSync(join(configDir, 'keep.txt'), 'keep');

    expect(await removeGlobalConfig()).toBe(true);
    expect(existsSync(configPath)).toBe(false);
    expect(existsSync(join(configDir, 'keep.txt'))).toBe(true);
  });
});
