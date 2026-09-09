import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// mock 工作空间模块，让 ensureWorkspace 不发起真实 HTTP
vi.mock('../workspace/index.js', () => ({
  getCurrentWorkspace: vi.fn(),
  initWorkspace: vi.fn(),
  isWorkspaceInitialized: vi.fn(() => true),
  switchWorkspace: vi.fn()
}));

// mock API 客户端
vi.mock('../api-client/index.js', () => ({
  createApi: vi.fn(),
  createFolder: vi.fn(),
  deleteApis: vi.fn(),
  getApiDetails: vi.fn(),
  getApiList: vi.fn(),
  getProjectList: vi.fn(),
  getTeamList: vi.fn(),
  updateApi: vi.fn()
}));

import {
  createApi,
  createFolder,
  deleteApis,
  getApiDetails,
  getApiList,
  getProjectList,
  getTeamList,
  updateApi
} from '../api-client/index.js';
import {
  getCurrentWorkspace,
  isWorkspaceInitialized,
  switchWorkspace
} from '../workspace/index.js';
import {
  handleCreateFolder,
  handleDelete,
  handleDetail,
  handleList,
  handleSchemaToTypes,
  handleSmartCreate,
  handleTestConnection,
  handleUpdate,
  handleWorkspace
} from './handlers.js';

const workspaceFixture = { teamId: 't1', teamName: 'Team1', projectId: 'p1', projectName: 'Proj1' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isWorkspaceInitialized).mockReturnValue(true);
  vi.mocked(getCurrentWorkspace).mockReturnValue(workspaceFixture);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('handleTestConnection', () => {
  it('返回连接信息与当前工作空间', async () => {
    const res = await handleTestConnection({});

    expect(res.content[0].text).toContain('连接测试成功');
    expect(res.content[0].text).toContain('Team1');
    expect(res.content[0].text).toContain('limited');
  });
});

describe('handleWorkspace', () => {
  it('current 展示当前工作空间', async () => {
    const res = await handleWorkspace({ action: 'current' });

    expect(res.content[0].text).toContain('Team1');
    expect(res.content[0].text).toContain('Proj1');
  });

  it('switch 调用 switchWorkspace 并展示结果', async () => {
    vi.mocked(switchWorkspace).mockResolvedValue({
      teamId: 't2', teamName: 'Team2', projectId: 'p2', projectName: 'Proj2'
    });

    const res = await handleWorkspace({ action: 'switch', team_id: 't2', project_id: 'p2' });

    expect(switchWorkspace).toHaveBeenCalledWith('t2', 'p2', undefined, undefined);
    expect(res.content[0].text).toContain('Team2');
  });

  it('未知 action 抛错', async () => {
    await expect(handleWorkspace({ action: 'bad' })).rejects.toThrow('未知的 workspace 操作');
  });

  it('list_projects 缺少 team_id 抛错', async () => {
    await expect(handleWorkspace({ action: 'list_projects' })).rejects.toThrow('需要提供 team_id');
  });
});

describe('handleSmartCreate', () => {
  it('解析字段并调用 createApi，URL 应用前缀', async () => {
    vi.mocked(createApi).mockResolvedValue({ target_id: 'api-new' });

    const res = await handleSmartCreate({
      name: '测试接口',
      method: 'POST',
      url: '/api/test',
      body: JSON.stringify([{ key: 'id', type: 'integer', example: 1, desc: 'ID' }])
    });

    expect(createApi).toHaveBeenCalledTimes(1);
    const template = vi.mocked(createApi).mock.calls[0][0] as Record<string, unknown>;
    expect(template).toMatchObject({
      project_id: 'p1',
      name: '测试接口',
      method: 'POST',
      url: '/api/test'
    });
    expect(res.content[0].text).toContain('API创建成功');
  });

  it('参数非法 JSON 抛错', async () => {
    await expect(handleSmartCreate({ name: 'x', method: 'GET', url: '/x', body: 'not-json' }))
      .rejects.toThrow('参数解析失败');
  });

  it('预校验发现错误时阻断保存，不调用 createApi', async () => {
    await expect(handleSmartCreate({
      name: '坏接口',
      method: 'POST',
      url: '/api/bad',
      responses: JSON.stringify([{ name: '成功', status: 200, data: { code: 0 } }])
    })).rejects.toThrow('预校验未通过');

    expect(createApi).not.toHaveBeenCalled();
  });

  it('预校验错误信息包含全部问题清单', async () => {
    await expect(handleSmartCreate({
      name: '坏接口',
      method: 'POST',
      url: '/api/bad',
      body: JSON.stringify([
        { key: 'data', desc: '返回体', type: 'object', example: '{"a":1}' },
        { key: 'data.id', desc: 'ID', type: 'int', example: 1 }
      ])
    })).rejects.toThrow('字符串化的 JSON');

    expect(createApi).not.toHaveBeenCalled();
  });

  it('validate_only 模式只返回报告不保存', async () => {
    const res = await handleSmartCreate({
      name: '好接口',
      method: 'GET',
      url: '/api/ok',
      validate_only: true,
      query: JSON.stringify([{ key: 'id', desc: 'ID', type: 'integer', example: 1 }])
    });

    expect(createApi).not.toHaveBeenCalled();
    expect(res.content[0].text).toContain('预校验结果');
    expect(res.content[0].text).toContain('预校验通过');
    expect(res.isError).toBeFalsy();
  });

  it('validate_only 模式下有错误时返回报告且标记 isError', async () => {
    const res = await handleSmartCreate({
      name: '坏接口',
      method: 'GET',
      url: '/api/bad',
      validate_only: true,
      responses: JSON.stringify([{ name: '成功', status: 200, fields: [] }])
    });

    expect(createApi).not.toHaveBeenCalled();
    expect(res.content[0].text).toContain('fields 必填且不能为空');
    expect(res.isError).toBe(true);
  });

  it('skip_validation 跳过校验强制保存', async () => {
    vi.mocked(createApi).mockResolvedValue({ target_id: 'api-forced' });

    const res = await handleSmartCreate({
      name: '强制保存',
      method: 'POST',
      url: '/api/force',
      skip_validation: true,
      responses: JSON.stringify([{ name: '成功', status: 200, data: { code: 0 }, fields: [{ key: 'code', desc: 'c', type: 'integer' }] }])
    });

    expect(createApi).toHaveBeenCalledTimes(1);
    expect(res.content[0].text).toContain('API创建成功');
  });
});

describe('handleList', () => {
  it('按搜索关键字过滤', async () => {
    vi.mocked(getApiList).mockResolvedValue({
      list: [
        { target_id: 'a1', name: '用户接口', url: '/user', method: 'GET', is_folder: 0 },
        { target_id: 'a2', name: '订单接口', url: '/order', method: 'POST', is_folder: 0 }
      ]
    });

    const res = await handleList({ search: '用户' });

    expect(res.content[0].text).toContain('用户接口');
    expect(res.content[0].text).not.toContain('订单接口');
  });
});

describe('handleUpdate', () => {
  it('基于原接口做增量更新并递增版本', async () => {
    vi.mocked(getApiDetails).mockResolvedValue({
      list: [
        { target_id: 'a1', name: '旧名称', method: 'GET', url: '/old', request: {}, response: {} }
      ]
    });
    vi.mocked(updateApi).mockResolvedValue({});

    const res = await handleUpdate({ target_id: 'a1', name: '新名称' });

    expect(updateApi).toHaveBeenCalledTimes(1);
    const template = vi.mocked(updateApi).mock.calls[0][0] as Record<string, unknown>;
    expect(template).toMatchObject({ target_id: 'a1', name: '新名称', version: 1 });
    expect(res.content[0].text).toContain('接口修改成功');
  });

  it('缺少 target_id 抛错', async () => {
    await expect(handleUpdate({})).rejects.toThrow('请提供接口ID');
  });

  it('接口不存在时抛错', async () => {
    vi.mocked(getApiDetails).mockResolvedValue({ list: [] });

    await expect(handleUpdate({ target_id: 'missing' })).rejects.toThrow('未找到接口详情');
  });

  it('提供的字段校验不合格时阻断更新', async () => {
    vi.mocked(getApiDetails).mockResolvedValue({
      list: [{ target_id: 'a1', name: '旧名称', method: 'GET', url: '/old', request: {}, response: {} }]
    });

    await expect(handleUpdate({
      target_id: 'a1',
      responses: JSON.stringify([{ name: '成功', status: 200, data: { code: 0 } }])
    })).rejects.toThrow('预校验未通过');

    expect(updateApi).not.toHaveBeenCalled();
  });

  it('skip_validation 时跳过校验直接更新', async () => {
    vi.mocked(getApiDetails).mockResolvedValue({
      list: [{ target_id: 'a1', name: '旧名称', method: 'GET', url: '/old', request: {}, response: {} }]
    });
    vi.mocked(updateApi).mockResolvedValue({});

    await handleUpdate({
      target_id: 'a1',
      skip_validation: true,
      responses: JSON.stringify([{ name: '成功', status: 200, data: { code: 0 }, fields: [{ key: 'code', desc: '状态码', type: 'integer', example: 0 }] }])
    });

    expect(updateApi).toHaveBeenCalledTimes(1);
  });
});

describe('handleDetail', () => {
  it('渲染接口详情', async () => {
    vi.mocked(getApiDetails).mockResolvedValue({
      list: [{ name: '用户详情', url: '/user', method: 'GET', version: 2, target_id: 'a1' }]
    });

    const res = await handleDetail({ target_id: 'a1' });

    expect(res.content[0].text).toContain('用户详情');
    expect(res.content[0].text).toContain('/user');
  });
});

describe('handleDelete', () => {
  it('limited 模式下禁止删除', async () => {
    await expect(handleDelete({ api_ids: ['a1'] })).rejects.toThrow('当前安全模式禁止删除操作');
    expect(deleteApis).not.toHaveBeenCalled();
  });
});

describe('handleSchemaToTypes', () => {
  it('生成请求体与响应的 TS 类型', async () => {
    vi.mocked(getApiDetails).mockResolvedValue({
      list: [{
        url: '/user',
        method: 'GET',
        request: {
          body: {
            mode: 'json',
            raw_schema: {
              type: 'object',
              properties: { id: { type: 'integer', description: 'ID' } }
            }
          }
        },
        response: {
          example: [{
            expect: {
              name: '成功',
              schema: { type: 'object', properties: { code: { type: 'integer' } } }
            }
          }]
        }
      }]
    });

    const res = await handleSchemaToTypes({ target_id: 'a1', output_ts: true });

    expect(res.content[0].text).toContain('RequestBody');
    expect(res.content[0].text).toContain('Response');
  });

  it('缺少 target_id 抛错', async () => {
    await expect(handleSchemaToTypes({})).rejects.toThrow('请提供接口ID');
  });
});

describe('handleCreateFolder', () => {
  it('创建目录并传递父目录', async () => {
    vi.mocked(createFolder).mockResolvedValue({ target_id: 'f1' });

    const res = await handleCreateFolder({ name: '新目录' });

    expect(createFolder).toHaveBeenCalledWith('p1', '新目录', '0', undefined);
    expect(res.content[0].text).toContain('目录创建成功');
  });
});