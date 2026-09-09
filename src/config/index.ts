/**
 * ApiPost MCP 配置模块
 */

import { applyGlobalConfig, loadGlobalConfig } from '../setup/global-config.js';

// 加载全局配置文件（~/.apipost-mcp/config.json），优先级低于系统环境变量
// Vitest 环境下跳过，避免真实全局配置污染测试（测试用 vi.stubEnv 控制环境变量）
if (!process.env.VITEST) {
  applyGlobalConfig(await loadGlobalConfig());
}

// ============ 环境变量配置 ============
export const APIPOST_TOKEN = process.env.APIPOST_TOKEN || '';
export const APIPOST_HOST = process.env.APIPOST_HOST || 'https://open.apipost.net';
export const APIPOST_SECURITY_MODE = process.env.APIPOST_SECURITY_MODE || 'limited'; // readonly, limited, full
export const APIPOST_DEFAULT_TEAM_NAME = process.env.APIPOST_DEFAULT_TEAM_NAME;
export const APIPOST_DEFAULT_PROJECT_NAME = process.env.APIPOST_DEFAULT_PROJECT_NAME;
export const APIPOST_INLINE_COMMENTS = (process.env.APIPOST_INLINE_COMMENTS || 'false').toLowerCase() === 'true';
export const APIPOST_URL_PREFIX = process.env.APIPOST_URL_PREFIX || ''; // URL前缀，如 {{host}}

// ============ 安全模式检查 ============
export type SecurityOperation = 'read' | 'write' | 'delete';

export function checkSecurityPermission(operation: SecurityOperation): boolean {
    switch (APIPOST_SECURITY_MODE.toLowerCase()) {
        case 'readonly':
            return operation === 'read';
        case 'limited':
            return operation === 'read' || operation === 'write';
        case 'full':
            return true;
        default:
            console.error(`⚠️ 未知的安全模式: ${APIPOST_SECURITY_MODE}, 默认为只读模式`);
            return operation === 'read';
    }
}

// ============ URL 前缀处理 ============
export function applyUrlPrefix(url: string): string {
    if (!url || !APIPOST_URL_PREFIX) return url;
    // 如果url已经包含了前缀，则不重复添加
    if (url.startsWith(APIPOST_URL_PREFIX)) return url;
    // 确保拼接时斜杠正确处理
    const prefix = APIPOST_URL_PREFIX.endsWith('/') ? APIPOST_URL_PREFIX.slice(0, -1) : APIPOST_URL_PREFIX;
    const path = url.startsWith('/') ? url : '/' + url;
    return prefix + path;
}

// ============ 环境变量验证 ============
export function validateEnv(): void {
    if (!APIPOST_TOKEN) {
        console.error('错误: 请设置 APIPOST_TOKEN 环境变量');
        process.exit(1);
    }
}

// ============ 日志输出 ============
export function logWithTime(message: string, startTime?: number): void {
    console.error(message);
}
