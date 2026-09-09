import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  findEditor,
  isEditorInstalled,
  removeEditorConfig,
  writeEditorConfig,
  type EditorConfig,
} from './editors.js';

describe('findEditor', () => {
  it('按名称找到编辑器', () => {
    expect(findEditor('claude-code')?.name).toBe('claude-code');
    expect(findEditor('trae')?.configPath).toContain('.trae');
  });

  it('未知名称返回 undefined', () => {
    expect(findEditor('not-exist')).toBeUndefined();
  });
});

describe('isEditorInstalled', () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `apipost-mcp-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('配置目录存在时返回 true', () => {
    const editor: EditorConfig = { name: 'test', configPath: join(dir, 'mcp.json'), format: 'json' };
    expect(isEditorInstalled(editor)).toBe(true);
  });

  it('配置目录不存在时返回 false', () => {
    const editor: EditorConfig = {
      name: 'test',
      configPath: join(dir, 'not-installed', 'mcp.json'),
      format: 'json',
    };
    expect(isEditorInstalled(editor)).toBe(false);
  });
});

describe('writeEditorConfig', () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `apipost-mcp-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('写入 JSON 配置并保留已有内容', async () => {
    const configPath = join(dir, 'mcp.json');
    writeFileSync(configPath, JSON.stringify({ mcpServers: { other: { command: 'x', args: [] } } }));
    const editor: EditorConfig = { name: 'test', configPath, format: 'json' };

    await writeEditorConfig(editor, { command: 'node', args: ['cli.js', 'start'] });

    const data = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(data.mcpServers.other).toEqual({ command: 'x', args: [] });
    expect(data.mcpServers.apipost).toEqual({ command: 'node', args: ['cli.js', 'start'] });
  });

  it('JSON 配置文件损坏时重新创建', async () => {
    const configPath = join(dir, 'mcp.json');
    writeFileSync(configPath, '{broken');
    const editor: EditorConfig = { name: 'test', configPath, format: 'json' };

    await writeEditorConfig(editor, { command: 'node', args: ['cli.js'] });

    const data = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(data.mcpServers.apipost).toEqual({ command: 'node', args: ['cli.js'] });
  });

  it('写入 TOML 配置', async () => {
    const configPath = join(dir, 'config.toml');
    const editor: EditorConfig = { name: 'test', configPath, format: 'toml' };

    await writeEditorConfig(editor, { command: 'node', args: ['cli.js', 'start'] });

    const content = await readFile(configPath, 'utf-8');
    expect(content).toContain('[mcp_servers.apipost]');
    expect(content).toContain('command = "node"');
    expect(content).toContain('args = ["cli.js", "start"]');
  });

  it('TOML 已存在 apipost 段时替换而非追加', async () => {
    const configPath = join(dir, 'config.toml');
    const editor: EditorConfig = { name: 'test', configPath, format: 'toml' };

    await writeEditorConfig(editor, { command: 'node', args: ['old.js'] });
    await writeEditorConfig(editor, { command: 'node', args: ['new.js'] });

    const content = await readFile(configPath, 'utf-8');
    expect(content).toContain('args = ["new.js"]');
    expect(content).not.toContain('old.js');
    expect(content.match(/\[mcp_servers\.apipost\]/g)).toHaveLength(1);
  });
});

describe('removeEditorConfig', () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `apipost-mcp-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('JSON：移除 apipost 条目并保留其他配置', async () => {
    const configPath = join(dir, 'mcp.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: { apipost: { command: 'node', args: [] }, other: { command: 'x', args: [] } },
        otherKey: 1,
      }),
    );
    const editor: EditorConfig = { name: 'test', configPath, format: 'json' };

    expect(await removeEditorConfig(editor)).toBe(true);

    const data = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(data.mcpServers.apipost).toBeUndefined();
    expect(data.mcpServers.other).toEqual({ command: 'x', args: [] });
    expect(data.otherKey).toBe(1);
  });

  it('JSON：无 apipost 条目返回 false 且不改动文件', async () => {
    const configPath = join(dir, 'mcp.json');
    const raw = JSON.stringify({ mcpServers: { other: { command: 'x', args: [] } } });
    writeFileSync(configPath, raw);
    const editor: EditorConfig = { name: 'test', configPath, format: 'json' };

    expect(await removeEditorConfig(editor)).toBe(false);
    expect(await readFile(configPath, 'utf-8')).toBe(raw);
  });

  it('JSON：文件不存在返回 false', async () => {
    const editor: EditorConfig = { name: 'test', configPath: join(dir, 'mcp.json'), format: 'json' };
    expect(await removeEditorConfig(editor)).toBe(false);
  });

  it('JSON：文件损坏返回 false', async () => {
    const configPath = join(dir, 'mcp.json');
    writeFileSync(configPath, '{broken');
    const editor: EditorConfig = { name: 'test', configPath, format: 'json' };
    expect(await removeEditorConfig(editor)).toBe(false);
  });

  it('TOML：移除 apipost 段并保留其他段', async () => {
    const configPath = join(dir, 'config.toml');
    writeFileSync(
      configPath,
      '[mcp_servers.other]\ncommand = "x"\n\n[mcp_servers.apipost]\ncommand = "node"\nargs = ["a"]\n',
    );
    const editor: EditorConfig = { name: 'test', configPath, format: 'toml' };

    expect(await removeEditorConfig(editor)).toBe(true);

    const content = await readFile(configPath, 'utf-8');
    expect(content).not.toContain('apipost');
    expect(content).toContain('[mcp_servers.other]');
    expect(content).toContain('command = "x"');
  });

  it('TOML：apipost 段在中间时也能正确移除', async () => {
    const configPath = join(dir, 'config.toml');
    writeFileSync(
      configPath,
      '[mcp_servers.apipost]\ncommand = "node"\nargs = ["a"]\n\n[mcp_servers.other]\ncommand = "x"\n',
    );
    const editor: EditorConfig = { name: 'test', configPath, format: 'toml' };

    expect(await removeEditorConfig(editor)).toBe(true);

    const content = await readFile(configPath, 'utf-8');
    expect(content).not.toContain('apipost');
    expect(content).toContain('[mcp_servers.other]');
    expect(content.startsWith('[')).toBe(true);
  });

  it('TOML：仅剩 apipost 段时文件清空', async () => {
    const configPath = join(dir, 'config.toml');
    writeFileSync(configPath, '[mcp_servers.apipost]\ncommand = "node"\nargs = []\n');
    const editor: EditorConfig = { name: 'test', configPath, format: 'toml' };

    expect(await removeEditorConfig(editor)).toBe(true);
    expect(await readFile(configPath, 'utf-8')).toBe('');
  });

  it('TOML：无 apipost 段返回 false', async () => {
    const configPath = join(dir, 'config.toml');
    writeFileSync(configPath, '[mcp_servers.other]\ncommand = "x"\n');
    const editor: EditorConfig = { name: 'test', configPath, format: 'toml' };
    expect(await removeEditorConfig(editor)).toBe(false);
  });

  it('TOML：文件不存在返回 false', async () => {
    const editor: EditorConfig = { name: 'test', configPath: join(dir, 'config.toml'), format: 'toml' };
    expect(await removeEditorConfig(editor)).toBe(false);
  });
});
