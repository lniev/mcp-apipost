#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EDITORS, findEditor, isEditorInstalled, removeEditorConfig, writeEditorConfig } from './setup/editors.js';
import { applyGlobalConfig, getConfigPath, removeGlobalConfig, saveGlobalConfig } from './setup/global-config.js';
import { closeReadline, confirmDanger, confirmStartTest, runInteractiveSetup } from './setup/interactive.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, 'cli.js');

// 编辑器配置使用 node + 绝对路径，跨平台兼容（Windows npm bin 生成 .cmd shim，spawn 可能找不到）
function getServerCommand(): { command: string; args: string[] } {
  return { command: process.execPath, args: [CLI_PATH, 'start'] };
}

function printHelp(): void {
  console.log(`
ApiPost MCP - API 文档管理工具

用法: apipost-mcp <command>

命令:
  setup              交互式配置（写入全局配置并同步到编辑器）
  setup:<editor>     从全局配置同步到指定编辑器
  start              启动 MCP Server（stdio 模式）
  remove             移除所有编辑器配置、全局配置（含 Token）并卸载全局 npm 包

支持的编辑器: ${EDITORS.map((e) => e.name).join(', ')}

示例:
  apipost-mcp setup          # 交互式配置
  apipost-mcp setup:cursor   # 配置到 Cursor
  apipost-mcp start          # 启动 MCP Server
  apipost-mcp remove         # 交互确认后移除
  apipost-mcp remove --force # 跳过确认直接移除
`);
}

function buildEnv(answers: {
  token: string;
  host: string;
  securityMode: string;
  defaultTeam: string;
  defaultProject: string;
  urlPrefix: string;
}): Record<string, string> {
  const env: Record<string, string> = {
    APIPOST_TOKEN: answers.token,
    APIPOST_HOST: answers.host,
    APIPOST_SECURITY_MODE: answers.securityMode,
  };
  if (answers.defaultTeam) env.APIPOST_DEFAULT_TEAM_NAME = answers.defaultTeam;
  if (answers.defaultProject) env.APIPOST_DEFAULT_PROJECT_NAME = answers.defaultProject;
  if (answers.urlPrefix) env.APIPOST_URL_PREFIX = answers.urlPrefix;
  return env;
}

async function cmdSetup(): Promise<void> {
  const answers = await runInteractiveSetup();

  const env = buildEnv(answers);

  // 1. 写入全局配置
  await saveGlobalConfig(env);
  console.log(`\n✅ 已保存全局配置到 ${getConfigPath()}`);

  // 2. 生成 mcp.json 到当前目录（供其他 setup 脚本使用）
  const mcpJson = { mcpServers: { apipost: { command: 'apipost-mcp', args: ['start'] } } };
  const { writeFile } = await import('node:fs/promises');
  const mcpJsonPath = resolve(process.cwd(), 'mcp.json');
  await writeFile(mcpJsonPath, JSON.stringify(mcpJson, null, 2) + '\n', 'utf-8');
  console.log(`✅ 已生成 ${mcpJsonPath}`);

  // 3. 写入各编辑器配置（不含 env，启动时从全局配置读取），未安装的编辑器提示并跳过
  const serverConfig = getServerCommand();
  for (const editorName of answers.editors) {
    const editor = findEditor(editorName);
    if (!editor) continue;
    if (!isEditorInstalled(editor)) {
      console.log(`⏭️ 未检测到 ${editor.name}，已跳过 (${editor.configPath})`);
      continue;
    }
    try {
      await writeEditorConfig(editor, serverConfig);
      console.log(`✅ 已配置到 ${editor.name} (${editor.configPath})`);
    } catch (err) {
      console.error(`❌ 配置 ${editor.name} 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 4. 可选连接测试（所有交互结束后统一关闭 readline）
  const startTest = await confirmStartTest();
  closeReadline();
  if (startTest) {
    applyGlobalConfig(env);
    await cmdStart();
  }
}

async function cmdSetupEditor(editorName: string): Promise<void> {
  const editor = findEditor(editorName);
  if (!editor) {
    console.error(`❌ 未知编辑器: ${editorName}`);
    console.error(`支持的编辑器: ${EDITORS.map((e) => e.name).join(', ')}`);
    process.exit(1);
  }

  if (!isEditorInstalled(editor)) {
    console.error(`⏭️ 未检测到 ${editor.name}，已跳过 (${editor.configPath})`);
    process.exit(1);
  }

  try {
    await writeEditorConfig(editor, getServerCommand());
    console.log(`✅ 已配置到 ${editor.name} (${editor.configPath})`);
  } catch (err) {
    console.error(`❌ 配置失败: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

async function cmdRemove(force: boolean): Promise<void> {
  console.log('\n🗑️  移除 ApiPost MCP\n');

  if (!force) {
    const ok = await confirmDanger(
      '? 将移除所有编辑器配置、全局配置（含 Token）并卸载全局 npm 包，确认? (y/N) ',
    );
    if (!ok) {
      closeReadline();
      console.log('已取消');
      return;
    }
  }
  closeReadline();

  // 1. 移除各编辑器配置（保留编辑器配置文件中的其他 mcpServers）
  for (const editor of EDITORS) {
    try {
      if (await removeEditorConfig(editor)) {
        console.log(`✅ 已从 ${editor.name} 移除 (${editor.configPath})`);
      }
    } catch (err) {
      console.error(`❌ 移除 ${editor.name} 配置失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. 移除全局配置（含 Token）
  try {
    if (await removeGlobalConfig()) {
      console.log(`✅ 已删除全局配置 (${getConfigPath()})`);
    } else {
      console.log(`⏭️ 未找到全局配置 (${getConfigPath()})`);
    }
  } catch (err) {
    console.error(`❌ 删除全局配置失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. 卸载全局 npm 包（最后执行，此时所需模块均已加载到内存）
  console.log('\n📦 卸载全局 npm 包 apipost-mcp-cli ...');
  try {
    const { execSync } = await import('node:child_process');
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const globalRoot = execSync(`${npmCmd} root -g`, { encoding: 'utf-8' }).trim();
    if (!existsSync(join(globalRoot, 'apipost-mcp-cli'))) {
      console.log('⏭️ 未检测到全局安装，跳过卸载');
      return;
    }
    execSync(`${npmCmd} uninstall -g apipost-mcp-cli`, { stdio: 'inherit' });
    console.log('✅ 已卸载全局 npm 包');
  } catch {
    console.error('❌ 卸载失败，请手动执行: npm uninstall -g apipost-mcp-cli');
  }
}

async function cmdStart(): Promise<void> {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { validateEnv } = await import('./config/index.js');
  const { createServer } = await import('./server.js');
  const { initWorkspace } = await import('./workspace/index.js');

  validateEnv();

  const mainStartTime = Date.now();
  console.error('='.repeat(50));
  console.error('🚀 ApiPost MCP 启动中...');

  try {
    console.error('🔄 预初始化工作空间...');
    await initWorkspace(mainStartTime);
    console.error('✨ 工作空间预初始化完成');
  } catch (error) {
    console.error(
      '⚠️ 工作空间预初始化失败，将在首次调用时重试:',
      error instanceof Error ? error.message : String(error),
    );
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('✅ ApiPost MCP 启动成功!');
  console.error('📊 可用工具: apipost_create_folder, apipost_smart_create, apipost_list, apipost_update, apipost_delete');
  console.error('📈 等待工具调用...');
  console.error('='.repeat(50));
}

async function main(): Promise<void> {
  const command = process.argv[2];

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'setup') {
    await cmdSetup();
  } else if (command.startsWith('setup:')) {
    const editorName = command.slice(6);
    await cmdSetupEditor(editorName);
  } else if (command === 'start') {
    await cmdStart();
  } else if (command === 'remove') {
    const force = process.argv.includes('--force') || process.argv.includes('-f');
    await cmdRemove(force);
  } else {
    console.error(`❌ 未知命令: ${command}`);
    printHelp();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ 执行失败:', err);
  process.exit(1);
});
