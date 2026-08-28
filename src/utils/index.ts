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
 * 使用类型安全的实现，完全避免循环引用
 *
 * 核心改进：
 * 1. 使用深拷贝策略，确保每次修改都不会产生对象引用
 * 2. 采用"构建-合并"模式，而非直接修改引用
 * 3. 对数组类型特别处理，避免共享元素引用
 */
export function buildJsonFromFieldList(fields: ApiField[] | undefined): Record<string, unknown> {
    const root: Record<string, unknown> = {};
    if (!Array.isArray(fields)) return root;

    // 深拷贝辅助函数
    function deepClone<T>(obj: T): T {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(item => deepClone(item)) as T;

        const cloned: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            cloned[key] = deepClone(value);
        }
        return cloned as T;
    }

    // 深度合并两个对象，处理数组特殊情况
    function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
        const result = deepClone(target);

        for (const [key, value] of Object.entries(source)) {
            if (value === null || value === undefined) {
                result[key] = value;
                continue;
            }

            const existingValue = result[key];

            // 如果是数组，需要特殊合并
            if (Array.isArray(value)) {
                if (!Array.isArray(existingValue)) {
                    result[key] = deepClone(value);
                } else {
                    // 合并数组元素（只合并第一个元素，因为它是示例）
                    if (value.length > 0 && existingValue.length > 0) {
                        const valueItem = value[0];
                        const existingItem = existingValue[0];

                        if (typeof valueItem === 'object' && valueItem !== null &&
                            typeof existingItem === 'object' && existingItem !== null &&
                            !Array.isArray(valueItem) && !Array.isArray(existingItem)) {
                            result[key] = [deepMerge(existingItem as Record<string, unknown>, valueItem as Record<string, unknown>)];
                        } else {
                            result[key] = deepClone(value);
                        }
                    } else {
                        result[key] = deepClone(value);
                    }
                }
            }
            // 如果是对象，递归合并
            else if (typeof value === 'object' && !Array.isArray(value)) {
                if (typeof existingValue === 'object' && existingValue !== null && !Array.isArray(existingValue)) {
                    result[key] = deepMerge(existingValue as Record<string, unknown>, value as Record<string, unknown>);
                } else {
                    result[key] = deepClone(value);
                }
            }
            // 基本类型直接覆盖
            else {
                result[key] = value;
            }
        }

        return result;
    }

    // 根据路径构建嵌套对象
    function buildNestedObject(segments: PathSegment[], value: unknown): Record<string, unknown> {
        if (segments.length === 0) return {};

        const seg = segments[0];
        const isLast = segments.length === 1;

        if (seg.isArray) {
            // 数组类型
            if (isLast) {
                // 叶子节点：数组本身
                return { [seg.key]: value };
            } else {
                // 非叶子节点：数组包含对象
                const nested = buildNestedObject(segments.slice(1), value);
                return { [seg.key]: [nested] };
            }
        } else {
            // 对象类型
            if (isLast) {
                // 叶子节点：直接值
                return { [seg.key]: value };
            } else {
                // 非叶子节点：嵌套对象
                const nested = buildNestedObject(segments.slice(1), value);
                return { [seg.key]: nested };
            }
        }
    }

    // 遍历所有字段，逐个构建并合并
    for (const field of fields) {
        // 跳过自动补充的父级节点
        if (!isValidApiField(field) || field.autoParent) continue;

        const path = field.key;
        const segments = path.split('.').map(parsePathSegment);
        const value = field.example ?? field.value ?? defaultValueByType(field.type);

        // 构建当前字段的嵌套对象
        const nested = buildNestedObject(segments, value);

        // 深度合并到root中
        Object.assign(root, deepMerge(root, nested));
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
