import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

// 底层 HTTP 打桩，让集成测试聚焦 MCP 协议层（真正网络在 E2E 里验证）
vi.mock('./api-client/index.js', () => ({
  createApi: vi.fn(),
  createFolder: vi.fn(),
  deleteApis: vi.fn(),
  getApiDetails: vi.fn(),
  getApiList: vi.fn(),
  getProjectList: vi.fn(),
  getTeamList: vi.fn(),
  updateApi: vi.fn()
}));

import { getApiList, getProjectList, getTeamList } from './api-client/index.js';
import { createServer } from './server.js';

// ============ 进程内内存 transport ============
// SDK 0.4.0 无 InMemoryTransport，这里自实现一对互连的 transport，
// 让 Client 与 Server 在同一进程内完成真实的 MCP 协议握手。
class InMemoryTransport implements Transport {
  private peer: InMemoryTransport | null = null;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  async start(): Promise<void> {}

  async close(): Promise<void> {
    this.onclose?.();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.peer) {
      throw new Error('InMemoryTransport 未配对');
    }
    queueMicrotask(() => this.peer!.onmessage?.(message));
  }

  static createLinkedPair(): [InMemoryTransport, InMemoryTransport] {
    const a = new InMemoryTransport();
    const b = new InMemoryTransport();
    a.peer = b;
    b.peer = a;
    return [a, b];
  }
}

const toolNames = [
  'apipost_test_connection',
  'apipost_workspace',
  'apipost_create_folder',
  'apipost_smart_create',
  'apipost_list',
  'apipost_update',
  'apipost_detail',
  'apipost_delete',
  'apipost_schema_to_types'
];

let server: ReturnType<typeof createServer>;
let client: Client;

beforeAll(async () => {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  server = createServer();
  client = new Client({ name: 'test-client', version: '1.0.0' });

  await server.connect(serverTransport);
  await client.connect(clientTransport); // 自动完成 initialize 握手
});

afterAll(async () => {
  await client.close();
  await server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  // 任何触发 workspace 初始化的路径都能拿到有效团队/项目
  vi.mocked(getTeamList).mockResolvedValue([{ team_id: 't1', name: 'Team1' }]);
  vi.mocked(getProjectList).mockResolvedValue([{ project_id: 'p1', name: 'Proj1' }]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.map(c => c.text ?? '').join('');
}

describe('MCP 协议集成', () => {
  it('tools/list 返回全部工具', async () => {
    const result = await client.listTools();

    expect(result.tools).toHaveLength(toolNames.length);
    for (const name of toolNames) {
      expect(result.tools.some(t => t.name === name)).toBe(true);
    }
    // 每个工具都携带 inputSchema
    for (const tool of result.tools) {
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it('apipost_test_connection 返回连接信息', async () => {
    const result = await client.callTool({ name: 'apipost_test_connection', arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('连接测试成功');
  });

  it('apipost_list 走完整链路（workspace 初始化 + API 调用）', async () => {
    vi.mocked(getApiList).mockResolvedValue({
      list: [
        { target_id: 'a1', name: '用户接口', url: '/user', method: 'GET', is_folder: 0 }
      ]
    });

    const result = await client.callTool({ name: 'apipost_list', arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('用户接口');
    expect(getProjectList).toHaveBeenCalledWith('t1');
    expect(getApiList).toHaveBeenCalledWith('p1');
  });

  it('未知工具返回协议层错误', async () => {
    await expect(
      client.callTool({ name: 'no_such_tool', arguments: {} })
    ).rejects.toThrow();
  });

  it('业务异常（limited 模式禁止删除）通过 isError 回传', async () => {
    const result = await client.callTool({ name: 'apipost_delete', arguments: { api_ids: ['a1'] } });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('当前安全模式禁止删除操作');
  });
});