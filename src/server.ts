/**
 * ApiPost MCP Server 组装模块
 * 负责创建 Server 实例并注册工具处理器，与启动逻辑（stdio 传输、工作空间预热）解耦，便于测试
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { logWithTime } from './config/index.js';
import { tools } from './tools/definitions.js';
import { handlers } from './tools/handlers.js';
import { formatError } from './utils/index.js';

export type ToolResult = {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
};

/**
 * 工具调用处理器：分发到具体 handler，并将异常统一格式化为 isError 响应
 */
export async function handleCallTool(params: {
    name: string;
    arguments?: Record<string, unknown>;
}): Promise<ToolResult> {
    const { name, arguments: args } = params;
    if (!args) {
        throw new Error('缺少参数');
    }

    const startTime = Date.now();
    const handler = handlers[name];

    if (!handler) {
        throw new Error(`未知工具: ${name}`);
    }

    try {
        return await handler(args);
    } catch (error) {
        const errorMsg = formatError(error, name);
        logWithTime(`❌ 工具 '${name}' 执行失败: ${error instanceof Error ? error.message : String(error)}`, startTime);
        return {
            content: [{
                type: 'text',
                text: `❌ ${errorMsg}\n\n💡 调试提示:\n• 检查传入的参数是否正确\n• 确认接口ID是否存在\n• 验证网络连接和API权限`
            }],
            isError: true
        };
    }
}

/**
 * 创建 MCP Server 实例（不含副作用，可安全用于测试）
 */
export function createServer(): Server {
    const server = new Server({
        name: 'apipost-mcp',
        version: '1.0.0',
        capabilities: { tools: {} }
    });

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) =>
        handleCallTool(request.params as { name: string; arguments?: Record<string, unknown> })
    );

    return server;
}