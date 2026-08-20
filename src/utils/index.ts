/**
 * ApiPost MCP 通用工具函数模块
 */

import { randomUUID } from 'crypto';
import type { ApiField, ApiParameter } from '../types/index.js';

// ============ ID 生成 ============
/**
 * 生成唯一ID
 * 使用 crypto.randomUUID 确保高并发下的唯一性
 */
export function generateId(): string {
    return randomUUID().replace(/-/g, '').substring(0, 16);
}

// ============ 按类型提供默认示例值 ============
const DEFAULT_VALUES: Record<string, unknown> = {
    integer: 0,
    number: 0,
    boolean: false,
    array: [],
    object: {},
    null: null,
    string: ''
};

export function defaultValueByType(type: string | undefined): unknown {
    if (!type) return '';
    const value = DEFAULT_VALUES[type.toLowerCase()];
    return value === undefined ? '' : value;
}

// ============ 输入验证辅助函数 ============
function isValidApiField(field: unknown): field is ApiField {
    if (!field || typeof field !== 'object') return false;
    const f = field as Record<string, unknown>;
    return typeof f.key === 'string' && f.key.length > 0;
}

// ============ 参数转换 ============
export function convertParams(paramsList: ApiField[] | undefined): ApiParameter[] {
    if (!Array.isArray(paramsList)) return [];

    return paramsList
        .filter(isValidApiField)
        .map(param => {
            const isAutoParent = param.autoParent === true;
            const isRequired = param.required === true;

            return {
                param_id: generateId(),
                description: param.desc || param.description || '',
                field_type: param.type || 'string',
                is_checked: isAutoParent ? 0 : (isRequired ? 1 : 0),
                key: param.key,
                not_null: isAutoParent ? 0 : (isRequired ? 1 : (param.not_null ?? 0)),
                value: isAutoParent ? '' : (param.example ?? param.value ?? ''),
                schema: param.schema || { type: param.type || 'string' }
            };
        });
}

// ============ 字段列表扩展（补充父级字段） ============
/**
 * 优化后的算法：使用单次遍历，减少重复计算
 * 时间复杂度从 O(n * m) 优化到 O(n)，其中 m 是路径深度
 */
export function expandFieldListWithParents(fields: ApiField[] | undefined): ApiField[] {
    if (!Array.isArray(fields) || fields.length === 0) return [];

    const userKeys = new Set<string>();
    const result: ApiField[] = [];
    const seenKeys = new Set<string>();

    // 第一遍：收集所有用户定义的 key
    for (const field of fields) {
        if (isValidApiField(field)) {
            userKeys.add(field.key);
        }
    }

    // 第二遍：处理每个字段，补充父级
    for (const field of fields) {
        if (!isValidApiField(field)) continue;

        const keyPath = field.key;
        const segments = keyPath.split('.');
        let currentPath = '';

        // 为每个路径段创建父级字段
        for (let i = 0; i < segments.length - 1; i++) {
            const seg = segments[i];
            const isArray = seg.endsWith('[]');
            const cleanSeg = isArray ? seg.slice(0, -2) : seg;
            currentPath = currentPath ? `${currentPath}.${cleanSeg}` : cleanSeg;

            // 如果用户已显式提供该父级，则不创建自动父级
            if (userKeys.has(currentPath)) continue;

            if (!seenKeys.has(currentPath)) {
                seenKeys.add(currentPath);
                result.push({
                    key: currentPath,
                    type: isArray ? 'array' : 'object',
                    required: false,
                    desc: '',
                    autoParent: true
                });
            }
        }

        // 添加原字段
        if (!seenKeys.has(keyPath)) {
            seenKeys.add(keyPath);
            result.push(field);
        } else {
            // 如果父级已占位，再追加原字段
            result.push(field);
        }
    }

    return result;
}

// ============ 构建描述映射 ============
export function buildDescMap(fields: ApiField[] | undefined): Map<string, string> {
    const map = new Map<string, string>();
    if (!Array.isArray(fields)) return map;

    for (const field of fields) {
        if (!isValidApiField(field)) continue;

        const path = field.key.replace(/\[\]/g, '[0]');
        const desc = field.desc || field.description;
        if (desc) {
            map.set(path, desc);
        }
    }

    return map;
}

// ============ 带行内注释的 JSON 字符串化 ============
/**
 * 最大递归深度，防止栈溢出
 */
const MAX_RECURSION_DEPTH = 100;

export function stringifyWithComments(
    value: unknown,
    descMap: Map<string, string>,
    path = '',
    indent = 4,
    level = 0
): string {
    // 防止递归过深
    if (level > MAX_RECURSION_DEPTH) {
        return JSON.stringify(value);
    }

    const pad = (lvl: number) => ' '.repeat(lvl * indent);

    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';

        const items: string[] = [];
        for (let index = 0; index < value.length; index++) {
            const childPath = `${path}[${index}]`;
            const childStr = stringifyWithComments(value[index], descMap, childPath, indent, level + 1);
            const comment = descMap.get(childPath) ? ` // ${descMap.get(childPath)}` : '';
            items.push(`${pad(level + 1)}${childStr}${comment}`);
        }
        return `[\n${items.join(',\n')}\n${pad(level)}]`;
    }

    if (value !== null && typeof value === 'object') {
        const entries: string[] = [];
        for (const [key, val] of Object.entries(value)) {
            const childPath = path ? `${path}.${key}` : key;
            const childStr = stringifyWithComments(val, descMap, childPath, indent, level + 1);
            const comment = descMap.get(childPath) ? ` // ${descMap.get(childPath)}` : '';
            entries.push(`${pad(level + 1)}"${key}": ${childStr}${comment}`);
        }

        if (entries.length === 0) return '{}';
        return `{\n${entries.join(',\n')}\n${pad(level)}}`;
    }

    // 基本类型
    return JSON.stringify(value);
}

// ============ 路径段解析结果类型 ============
interface PathSegment {
    key: string;
    isArray: boolean;
}

function parsePathSegment(seg: string): PathSegment {
    if (seg.endsWith('[]')) {
        return { key: seg.slice(0, -2), isArray: true };
    }
    return { key: seg, isArray: false };
}

// ============ 从字段列表构建 JSON 对象 ============
/**
 * 使用类型安全的实现，避免 any 类型
 */
export function buildJsonFromFieldList(fields: ApiField[] | undefined): Record<string, unknown> {
    const root: Record<string, unknown> = {};
    if (!Array.isArray(fields)) return root;

    for (const field of fields) {
        // 跳过自动补充的父级节点
        if (!isValidApiField(field) || field.autoParent) continue;

        const path = field.key;
        const segments = path.split('.').map(parsePathSegment);

        // 使用栈来跟踪当前路径
        type Container = Record<string, unknown> | unknown[];
        let current: Container = root;
        const stack: { container: Container; key: string | number; isArray: boolean }[] = [];

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const isLeaf = i === segments.length - 1;

            if (seg.isArray) {
                // 处理数组
                const arr = (current as Record<string, unknown>)[seg.key];
                let arrayContainer: unknown[];

                if (!Array.isArray(arr)) {
                    arrayContainer = [];
                    (current as Record<string, unknown>)[seg.key] = arrayContainer;
                } else {
                    arrayContainer = arr;
                }

                if (arrayContainer.length === 0) {
                    arrayContainer.push({});
                }

                if (isLeaf) {
                    arrayContainer[0] = field.example ?? field.value ?? defaultValueByType(field.type);
                } else {
                    const next = arrayContainer[0];
                    if (typeof next !== 'object' || next === null) {
                        const newObj: Record<string, unknown> = {};
                        arrayContainer[0] = newObj;
                        current = newObj;
                    } else {
                        current = next as Record<string, unknown>;
                    }
                }
            } else {
                // 处理对象
                if (isLeaf) {
                    (current as Record<string, unknown>)[seg.key] = field.example ?? field.value ?? defaultValueByType(field.type);
                } else {
                    const next = (current as Record<string, unknown>)[seg.key];
                    if (typeof next !== 'object' || next === null) {
                        const newObj: Record<string, unknown> = {};
                        (current as Record<string, unknown>)[seg.key] = newObj;
                        current = newObj;
                    } else {
                        current = next as Record<string, unknown>;
                    }
                }
            }
        }
    }

    return root;
}

// ============ TypeScript 标识符处理 ============
// 缓存正则表达式，避免重复编译
const VALID_IDENTIFIER_REGEX = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const ILLEGAL_CHARS_REGEX = /[^a-zA-Z0-9_$]/g;
const LEADING_DIGIT_REGEX = /^(\d)/;
const UNDERSCORE_DIGIT_REGEX = /^_?\d/;

export function isValidIdentifier(name: string): boolean {
    return VALID_IDENTIFIER_REGEX.test(name);
}

export function toValidIdentifier(name: string): string {
    // 替换非法字符
    let result = name
        .replace(ILLEGAL_CHARS_REGEX, '_')
        .replace(LEADING_DIGIT_REGEX, '_$1');

    // 处理特殊情况
    if (!result || UNDERSCORE_DIGIT_REGEX.test(result)) {
        result = 'Type_' + result.replace(/^_/, '');
    }

    return result;
}

// ============ 修复 TypeScript 中的非法类型名 ============
// 预编译正则表达式
const PURE_NUMBER_TYPE_REGEX = /export\s+type\s+(\d+)\s*=/g;
const TYPE_NAME_REGEX = /export\s+type\s+([^\s=]+)\s*=/g;

export function fixIllegalTypeNames(tsCode: string): string {
    // 处理纯数字类型名
    let result = tsCode.replace(PURE_NUMBER_TYPE_REGEX, (_match, num) => `export type Type_${num} =`);

    // 处理包含中文字符或特殊字符的类型名
    result = result.replace(TYPE_NAME_REGEX, (match, typeName) => {
        if (!isValidIdentifier(typeName)) {
            const safeName = toValidIdentifier(typeName);
            return `export type ${safeName} =`;
        }
        return match;
    });

    return result;
}

// ============ 错误处理 ============
export function formatError(error: unknown, toolName: string): string {
    let detailedError = '';

    if (error instanceof Error) {
        detailedError = error.message;

        // 提取堆栈信息中的关键位置
        if (error.stack) {
            const stackLines = error.stack.split('\n');
            const relevantLines = stackLines
                .filter(line => line.includes('.ts') || line.includes('apipost-mcp'))
                .slice(0, 3);

            if (relevantLines.length > 0) {
                detailedError += `\n\n📍 错误位置:\n${relevantLines.join('\n')}`;
            }
        }
    } else {
        detailedError = String(error);
    }

    return `工具 '${toolName}' 执行失败:\n${detailedError}`;
}
