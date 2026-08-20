import { afterEach, describe, expect, it, vi } from 'vitest';

// config 模块在 import 时就读取环境变量，因此需要 resetModules + 动态 import 来控制
async function loadConfig() {
  vi.resetModules();
  return import('./index.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('checkSecurityPermission', () => {
  it('readonly 模式只允许读', async () => {
    vi.stubEnv('APIPOST_SECURITY_MODE', 'readonly');
    const { checkSecurityPermission } = await loadConfig();
    expect(checkSecurityPermission('read')).toBe(true);
    expect(checkSecurityPermission('write')).toBe(false);
    expect(checkSecurityPermission('delete')).toBe(false);
  });

  it('limited 模式允许读写，禁止删除', async () => {
    vi.stubEnv('APIPOST_SECURITY_MODE', 'limited');
    const { checkSecurityPermission } = await loadConfig();
    expect(checkSecurityPermission('read')).toBe(true);
    expect(checkSecurityPermission('write')).toBe(true);
    expect(checkSecurityPermission('delete')).toBe(false);
  });

  it('full 模式允许所有操作', async () => {
    vi.stubEnv('APIPOST_SECURITY_MODE', 'full');
    const { checkSecurityPermission } = await loadConfig();
    expect(checkSecurityPermission('read')).toBe(true);
    expect(checkSecurityPermission('write')).toBe(true);
    expect(checkSecurityPermission('delete')).toBe(true);
  });

  it('未知模式回退为只读', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('APIPOST_SECURITY_MODE', 'weird');
    const { checkSecurityPermission } = await loadConfig();
    expect(checkSecurityPermission('read')).toBe(true);
    expect(checkSecurityPermission('write')).toBe(false);
    expect(checkSecurityPermission('delete')).toBe(false);
  });
});

describe('applyUrlPrefix', () => {
  it('无前缀时原样返回', async () => {
    vi.stubEnv('APIPOST_URL_PREFIX', '');
    const { applyUrlPrefix } = await loadConfig();
    expect(applyUrlPrefix('/api/x')).toBe('/api/x');
  });

  it('拼接前缀并处理斜杠', async () => {
    vi.stubEnv('APIPOST_URL_PREFIX', '{{host}}/');
    const { applyUrlPrefix } = await loadConfig();
    expect(applyUrlPrefix('/api/x')).toBe('{{host}}/api/x');
    expect(applyUrlPrefix('api/y')).toBe('{{host}}/api/y');
  });

  it('已包含前缀时不重复添加', async () => {
    vi.stubEnv('APIPOST_URL_PREFIX', '{{host}}');
    const { applyUrlPrefix } = await loadConfig();
    expect(applyUrlPrefix('{{host}}/api/x')).toBe('{{host}}/api/x');
  });
});

describe('validateEnv', () => {
  it('无 token 时调用 process.exit(1)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('APIPOST_TOKEN', '');
    const { validateEnv } = await loadConfig();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    validateEnv();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('有 token 时不退出', async () => {
    vi.stubEnv('APIPOST_TOKEN', 'abc123');
    const { validateEnv } = await loadConfig();
    const exitSpy = vi.spyOn(process, 'exit');

    validateEnv();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});