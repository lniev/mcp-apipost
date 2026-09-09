import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface EditorConfig {
  name: string;
  configPath: string;
  format: 'json' | 'toml';
}

export interface McpServerConfig {
  command: string;
  args: string[];
}

const home = homedir();

export const EDITORS: EditorConfig[] = [
  { name: 'claude-code', configPath: join(home, '.claude.json'), format: 'json' },
  { name: 'cursor', configPath: join(home, '.cursor', 'mcp.json'), format: 'json' },
  { name: 'codex', configPath: join(home, '.codex', 'config.toml'), format: 'toml' },
  { name: 'windsurf', configPath: join(home, '.windsurf', 'mcp.json'), format: 'json' },
  { name: 'trae', configPath: join(home, '.trae', 'mcp.json'), format: 'json' },
  { name: 'qoder', configPath: join(home, '.qoder', 'mcp.json'), format: 'json' },
  { name: 'workbuddy', configPath: join(home, '.workbuddy', 'mcp.json'), format: 'json' },
];

export function findEditor(name: string): EditorConfig | undefined {
  return EDITORS.find((e) => e.name === name);
}

export async function writeEditorConfig(
  editor: EditorConfig,
  serverConfig: McpServerConfig,
): Promise<void> {
  if (editor.format === 'json') {
    await writeJsonConfig(editor.configPath, serverConfig);
  } else {
    await writeTomlConfig(editor.configPath, serverConfig);
  }
}

async function writeJsonConfig(
  configPath: string,
  serverConfig: McpServerConfig,
): Promise<void> {
  let data: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      const raw = await readFile(configPath, 'utf-8');
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // 文件损坏时重新创建
    }
  }

  if (!data.mcpServers || typeof data.mcpServers !== 'object') {
    data.mcpServers = {};
  }

  (data.mcpServers as Record<string, unknown>).apipost = {
    command: serverConfig.command,
    args: serverConfig.args,
  };

  await writeFile(configPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

async function writeTomlConfig(
  configPath: string,
  serverConfig: McpServerConfig,
): Promise<void> {
  let content = '';
  if (existsSync(configPath)) {
    try {
      content = await readFile(configPath, 'utf-8');
    } catch {
      // 文件损坏时重新创建
    }
  }

  const argsStr = serverConfig.args.map((a) => `"${a}"`).join(', ');

  const apipostToml = `
[mcp_servers.apipost]
command = "${serverConfig.command}"
args = [${argsStr}]`.trim();

  const mcpServersRegex = /\[mcp_servers\.apipost\][\s\S]*?(?=\n\[|$)/;
  if (mcpServersRegex.test(content)) {
    content = content.replace(mcpServersRegex, apipostToml + '\n');
  } else {
    content = content.trimEnd() + '\n\n' + apipostToml + '\n';
  }

  await writeFile(configPath, content, 'utf-8');
}
