import { beforeEach, describe, expect, it, vi } from 'vitest';

// 用 vi.hoisted 让 mock 工厂能安全引用实例
const axiosMocks = vi.hoisted(() => {
  const instance = {
    get: vi.fn(),
    post: vi.fn()
  };
  return { instance, create: vi.fn(() => instance) };
});

vi.mock('axios', () => ({
  default: { create: axiosMocks.create }
}));

import {
  apiRequest,
  createApi,
  createFolder,
  deleteApis,
  getApiDetails,
  getApiList,
  getProjectList,
  getTeamList,
  updateApi
} from './index.js';

beforeEach(() => {
  vi.clearAllMocks();
  axiosMocks.instance.get.mockReset();
  axiosMocks.instance.post.mockReset();
});

describe('apiRequest', () => {
  it('GET 成功返回 data', async () => {
    axiosMocks.instance.get.mockResolvedValue({ data: { code: 0, data: { hello: 'world' } } });

    const result = await apiRequest('get', '/x', undefined, { a: 1 });

    expect(result).toEqual({ hello: 'world' });
    expect(axiosMocks.instance.get).toHaveBeenCalledWith('/x', { params: { a: 1 } });
  });

  it('GET code 非 0 时用 msg 抛错', async () => {
    axiosMocks.instance.get.mockResolvedValue({ data: { code: 1, msg: '失败啦' } });

    await expect(apiRequest('get', '/x')).rejects.toThrow('API 请求失败: 失败啦');
  });

  it('GET code 非 0 且无 msg 时用 message 抛错', async () => {
    axiosMocks.instance.get.mockResolvedValue({ data: { code: 1, message: '错误信息' } });

    await expect(apiRequest('get', '/x')).rejects.toThrow('错误信息');
  });

  it('POST 成功返回 data', async () => {
    axiosMocks.instance.post.mockResolvedValue({ data: { code: 0, data: 42 } });

    const result = await apiRequest('post', '/y', { name: 'x' });

    expect(result).toBe(42);
    expect(axiosMocks.instance.post).toHaveBeenCalledWith('/y', { name: 'x' });
  });
});

describe('团队与项目 API', () => {
  it('getTeamList 请求团队列表', async () => {
    axiosMocks.instance.get.mockResolvedValue({ data: { code: 0, data: [{ team_id: 't1', name: 'A' }] } });

    const teams = await getTeamList();

    expect(teams).toEqual([{ team_id: 't1', name: 'A' }]);
    expect(axiosMocks.instance.get).toHaveBeenCalledWith('/open/team/list', { params: undefined });
  });

  it('getProjectList 携带 team_id 参数', async () => {
    axiosMocks.instance.get.mockResolvedValue({ data: { code: 0, data: [] } });

    await getProjectList('t1');

    expect(axiosMocks.instance.get).toHaveBeenCalledWith('/open/project/list', {
      params: { team_id: 't1', action: 0 }
    });
  });
});

describe('接口 API', () => {
  it('getApiDetails 使用 POST 携带 target_ids', async () => {
    axiosMocks.instance.post.mockResolvedValue({ data: { code: 0, data: { list: [] } } });

    await getApiDetails('p1', ['a1']);

    expect(axiosMocks.instance.post).toHaveBeenCalledWith('/open/apis/details', {
      project_id: 'p1',
      target_ids: ['a1']
    });
  });

  it('deleteApis 使用 POST 携带 api_ids', async () => {
    axiosMocks.instance.post.mockResolvedValue({ data: { code: 0, data: null } });

    await deleteApis('p1', ['a1', 'a2']);

    expect(axiosMocks.instance.post).toHaveBeenCalledWith('/open/apis/delete', {
      project_id: 'p1',
      api_ids: ['a1', 'a2']
    });
  });

  it('createApi / updateApi / getApiList 走对应端点', async () => {
    axiosMocks.instance.post.mockResolvedValue({ data: { code: 0, data: null } });
    axiosMocks.instance.get.mockResolvedValue({ data: { code: 0, data: { list: [] } } });

    await createApi({ name: 'x' });
    await updateApi({ target_id: 'a1' });
    await getApiList('p1');

    expect(axiosMocks.instance.post).toHaveBeenCalledWith('/open/apis/create', { name: 'x' });
    expect(axiosMocks.instance.post).toHaveBeenCalledWith('/open/apis/update', { target_id: 'a1' });
    expect(axiosMocks.instance.get).toHaveBeenCalledWith('/open/apis/list', {
      params: { project_id: 'p1' }
    });
  });

  it('createFolder 直接拒绝（官方未开放）', async () => {
    await expect(createFolder('p1', 'name', '0')).rejects.toThrow('创建目录 API 官方还未支持');
  });
});