#!/usr/bin/env node
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

const WORKBUDDY_CONFIG_PATH = join(homedir(), '.workbuddy', 'mcp.json');
const MCP_JSON_PATH = resolve(process.cwd(), 'mcp.json');

async function main() {
  // 1. 读取 mcp.json
  let mcpData;
  try {
    const raw = await readFile(MCP_JSON_PATH, 'utf-8');
    mcpData = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ 无法读取或解析 ${MCP_JSON_PATH}:`, err.message);
    process.exit(1);
  }

  const apipostConfig = mcpData?.mcpServers?.apipost;
  if (!apipostConfig) {
    console.error('❌ mcp.json 中未找到 mcpServers.apipost 配置');
    process.exit(1);
  }

  // 2. 读取或创建 ~/.workbuddy/mcp.json
  let workbuddyData = {};
  if (existsSync(WORKBUDDY_CONFIG_PATH)) {
    try {
      const raw = await readFile(WORKBUDDY_CONFIG_PATH, 'utf-8');
      workbuddyData = JSON.parse(raw);
    } catch (err) {
      console.error(`❌ 无法解析 ${WORKBUDDY_CONFIG_PATH}:`, err.message);
      process.exit(1);
    }
  }

  // 3. 合并配置
  if (!workbuddyData.mcpServers) {
    workbuddyData.mcpServers = {};
  }
  workbuddyData.mcpServers.apipost = apipostConfig;

  // 4. 写回 ~/.workbuddy/mcp.json
  try {
    await writeFile(WORKBUDDY_CONFIG_PATH, JSON.stringify(workbuddyData, null, 2) + '\n', 'utf-8');
    console.log(`✅ 已将 apipost MCP 配置写入 ${WORKBUDDY_CONFIG_PATH}`);
  } catch (err) {
    console.error(`❌ 无法写入 ${WORKBUDDY_CONFIG_PATH}:`, err.message);
    process.exit(1);
  }
}

main();
