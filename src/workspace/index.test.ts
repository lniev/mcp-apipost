import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api-client/index.js', () => ({
  getTeamList: vi.fn(),
  getProjectList: vi.fn()
}));

import { getProjectList, getTeamList } from '../api-client/index.js';
import { getCurrentWorkspace, initWorkspace, switchWorkspace } from './index.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('initWorkspace', () => {
  it('默认选择第一个团队和第一个项目', async () => {
    vi.mocked(getTeamList).mockResolvedValue([
      { team_id: 't1', name: 'Team1' },
      { team_id: 't2', name: 'Team2' }
    ]);
    vi.mocked(getProjectList).mockResolvedValue([{ project_id: 'p1', name: 'Proj1' }]);

    const ws = await initWorkspace();

    expect(ws).toEqual({ teamId: 't1', teamName: 'Team1', projectId: 'p1', projectName: 'Proj1' });
    expect(getCurrentWorkspace()).toEqual(ws);
    expect(getProjectList).toHaveBeenCalledWith('t1');
  });

  it('无团队时抛错', async () => {
    vi.mocked(getTeamList).mockResolvedValue([]);

    await expect(initWorkspace()).rejects.toThrow('未找到任何团队');
  });

  it('无项目时抛错', async () => {
    vi.mocked(getTeamList).mockResolvedValue([{ team_id: 't1', name: 'Team1' }]);
    vi.mocked(getProjectList).mockResolvedValue([]);

    await expect(initWorkspace()).rejects.toThrow('未找到任何项目');
  });
});

describe('switchWorkspace', () => {
  it('通过 team_id + project_id 切换', async () => {
    vi.mocked(getTeamList).mockResolvedValue([
      { team_id: 't1', name: 'Team1' },
      { team_id: 't2', name: 'Team2' }
    ]);
    vi.mocked(getProjectList).mockResolvedValue([{ project_id: 'p1', name: 'Proj1' }]);

    const ws = await switchWorkspace('t2', 'p1');

    expect(ws).toEqual({ teamId: 't2', teamName: 'Team2', projectId: 'p1', projectName: 'Proj1' });
  });

  it('通过 team_name + project_name 切换', async () => {
    vi.mocked(getTeamList).mockResolvedValue([{ team_id: 't1', name: 'Team1' }]);
    vi.mocked(getProjectList).mockResolvedValue([{ project_id: 'p1', name: 'Proj1' }]);

    const ws = await switchWorkspace(undefined, undefined, 'Team1', 'Proj1');

    expect(ws.teamId).toBe('t1');
    expect(ws.projectId).toBe('p1');
  });

  it('缺少参数时抛错', async () => {
    await expect(switchWorkspace()).rejects.toThrow('切换工作空间需要提供');
  });

  it('团队名找不到时抛错', async () => {
    vi.mocked(getTeamList).mockResolvedValue([{ team_id: 't1', name: 'Team1' }]);

    await expect(switchWorkspace(undefined, undefined, 'Nope', undefined)).rejects.toThrow('未找到团队');
  });

  it('项目 ID 找不到时抛错', async () => {
    vi.mocked(getTeamList).mockResolvedValue([{ team_id: 't1', name: 'Team1' }]);
    vi.mocked(getProjectList).mockResolvedValue([{ project_id: 'p1', name: 'Proj1' }]);

    await expect(switchWorkspace('t1', 'p-missing')).rejects.toThrow('未找到项目 ID');
  });
});