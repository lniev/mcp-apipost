#!/usr/bin/env node
/**
 * ApiPost MCP - API文档管理工具
 * 提供简洁高效的API文档创建、查看、修改和删除功能
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { APIPOST_HOST, APIPOST_TOKEN, validateEnv } from './config/index.js';
import { createServer } from './server.js';
import { initWorkspace } from './workspace/index.js';

// 验证环境变量
validateEnv();

// 启动服务器
async function main() {
    try {
        const mainStartTime = Date.now();
        console.error('='.repeat(50));
        console.error('🚀 ApiPost MCP 启动中...');
        console.error(`🔗 连接到: ${APIPOST_HOST}`);
        console.error(`🔐 Token: ${APIPOST_TOKEN?.substring(0, 8)}...`);

        // 预初始化工作空间以提高首次调用速度（在MCP连接前完成，避免日志重复）
        try {
            console.error('🔄 预初始化工作空间...');
            await initWorkspace(mainStartTime);
            console.error('✨ 工作空间预初始化完成');
        } catch (error) {
            console.error('⚠️ 工作空间预初始化失败，将在首次调用时重试:', error instanceof Error ? error.message : String(error));
            // 不阻止服务器启动，在工具调用时再尝试初始化
        }

        const server = createServer();
        const transport = new StdioServerTransport();
        await server.connect(transport);

        console.error('✅ ApiPost MCP 启动成功!');
        console.error('📊 可用工具: apipost_create_folder, apipost_smart_create, apipost_list, apipost_update, apipost_delete');
        console.error('📈 等待工具调用...');
        console.error('='.repeat(50));
    } catch (error) {
        console.error('❌ 启动失败:', error);
        process.exit(1);
    }
}

main();