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

// ============ 字段列表预校验 ============

const VALID_FIELD_TYPES = new Set(['string', 'integer', 'number', 'boolean', 'object', 'array', 'null']);

export interface FieldValidationIssue {
    section: string;
    key?: string;
    message: string;
}

export interface FieldValidationResult {
    errors: FieldValidationIssue[];
    warnings: FieldValidationIssue[];
}

function looksLikeStringifiedJson(value: string): boolean {
    const trimmed = value.trim();
    if (trimmed.length < 2) return false;
    const isWrapped =
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'));
    if (!isWrapped) return false;
    try {
        JSON.parse(trimmed);
        return true;
    } catch {
        return false;
    }
}

function exampleMatchesType(example: unknown, type: string): boolean {
    switch (type) {
        case 'string': return typeof example === 'string';
        case 'integer': return typeof example === 'number' && Number.isInteger(example);
        case 'number': return typeof example === 'number';
        case 'boolean': return typeof example === 'boolean';
        case 'object': return example !== null && typeof example === 'object' && !Array.isArray(example);
        case 'array': return Array.isArray(example);
        case 'null': return example === null;
        default: return true;
    }
}

interface ParsedKeySegment {
    raw: string;
    name: string;
    isArray: boolean;
}

function parseKeySegments(key: string): ParsedKeySegment[] | null {
    const segments = key.split('.');
    const result: ParsedKeySegment[] = [];
    for (const seg of segments) {
        if (seg.length === 0) return null;
        if (seg.endsWith('[]')) {
            const name = seg.slice(0, -2);
            if (name.length === 0 || name.includes('[') || name.includes(']')) return null;
            result.push({ raw: seg, name, isArray: true });
        } else {
            if (seg.includes('[') || seg.includes(']')) return null;
            result.push({ raw: seg, name: seg, isArray: false });
        }
    }
    return result;
}

/**
 * 校验字段列表（headers/query/body/cookies/responses.fields 通用）
 *
 * error：保存后文档必然异常，必须阻断
 * warning：不影响保存，但可能导致展示不完整
 */
export function validateApiFields(fields: unknown, section: string): FieldValidationResult {
    const errors: FieldValidationIssue[] = [];
    const warnings: FieldValidationIssue[] = [];

    if (fields === undefined || fields === null) return { errors, warnings };

    if (!Array.isArray(fields)) {
        errors.push({ section, message: '字段列表必须是数组' });
        return { errors, warnings };
    }

    const seenKeys = new Map<string, number>();
    const keyInfo = new Map<string, { type?: string; hasChildren: boolean; userDefined: boolean }>();

    fields.forEach((field, index) => {
        const loc = `${section}[${index}]`;

        if (!field || typeof field !== 'object' || Array.isArray(field)) {
            errors.push({ section, key: loc, message: '字段必须是对象' });
            return;
        }

        const f = field as Record<string, unknown>;

        // key 必填且合法
        if (typeof f.key !== 'string' || f.key.length === 0) {
            errors.push({ section, key: loc, message: '缺少 key 或 key 为空' });
            return;
        }
        const key = f.key;

        const segments = parseKeySegments(key);
        if (!segments) {
            errors.push({
                section,
                key,
                message: `key 格式非法：嵌套用 . 分隔，数组标记 [] 只能出现在段尾（如 items[].id），不允许空段或 a[]b 形式`
            });
            return;
        }

        if (key.trim() !== key || segments.some(s => s.name.trim() !== s.name)) {
            warnings.push({ section, key, message: 'key 包含首尾空格，可能导致匹配异常' });
        }

        // 重复 key
        if (seenKeys.has(key)) {
            errors.push({ section, key, message: `key 重复（第 ${seenKeys.get(key)} 与 ${index} 项），后一个会覆盖前一个` });
        } else {
            seenKeys.set(key, index);
        }

        // type 合法性
        const type = typeof f.type === 'string' && f.type.length > 0 ? f.type : undefined;
        if (f.type !== undefined && (!type || !VALID_FIELD_TYPES.has(type))) {
            errors.push({
                section,
                key,
                message: `type "${String(f.type)}" 非法，允许值：${[...VALID_FIELD_TYPES].join(' / ')}`
            });
        }

        // desc 检查
        const desc = f.desc ?? f.description;
        if (typeof desc !== 'string' || desc.length === 0) {
            warnings.push({ section, key, message: '缺少 desc，文档中该字段描述将展示为空' });
        }

        // example 检查
        if (f.example !== undefined) {
            if (typeof f.example === 'string' && looksLikeStringifiedJson(f.example)) {
                errors.push({
                    section,
                    key,
                    message: 'example 是字符串化的 JSON，违反约定：example 必须填真实值（对象/数组直接写，不要 JSON.stringify）'
                });
            } else if (type && VALID_FIELD_TYPES.has(type) && !exampleMatchesType(f.example, type)) {
                errors.push({
                    section,
                    key,
                    message: `example 类型与声明的 type "${type}" 不匹配（实际为 ${Array.isArray(f.example) ? 'array' : typeof f.example}）`
                });
            }
        }

        // 记录路径信息用于父级/冲突检查
        let prefix = '';
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            prefix = prefix ? `${prefix}.${seg.name}` : seg.name;
            const isLast = i === segments.length - 1;
            const existing = keyInfo.get(prefix);

            if (isLast) {
                if (existing?.hasChildren && type !== 'object' && type !== 'array') {
                    errors.push({
                        section,
                        key,
                        message: `路径类型冲突："${prefix}" 已作为父级节点使用，不能同时声明为基本类型 "${type ?? 'string'}"`
                    });
                }
                keyInfo.set(prefix, {
                    type: seg.isArray ? 'array' : type,
                    hasChildren: existing?.hasChildren ?? false,
                    userDefined: true
                });
            } else {
                const expectedType = seg.isArray ? 'array' : 'object';
                if (existing && existing.userDefined && existing.type && existing.type !== expectedType) {
                    errors.push({
                        section,
                        key,
                        message: `路径类型冲突："${prefix}" 被声明为 "${existing.type}"，但子字段要求它是 "${expectedType}"`
                    });
                }
                keyInfo.set(prefix, {
                    type: existing?.type ?? expectedType,
                    hasChildren: true,
                    userDefined: existing?.userDefined ?? false
                });
            }
        }
    });

    // 父级显式声明 & 容器叶子检查
    for (const [prefix, info] of keyInfo) {
        if (info.hasChildren && !info.userDefined) {
            warnings.push({
                section,
                key: prefix,
                message: '父级节点未显式声明，将被自动补充为空 desc（按约定所有父级都应显式写出并填 desc）'
            });
        }
        if (info.userDefined && !info.hasChildren && (info.type === 'object' || info.type === 'array')) {
            warnings.push({
                section,
                key: prefix,
                message: `声明为 "${info.type}" 但没有任何子字段，raw 中将展示为空的 ${info.type === 'object' ? '{}' : '[]'}`
            });
        }
    }

    return { errors, warnings };
}

// ============ smart_create 入参整体预校验 ============

export interface SmartCreateValidationInput {
    name?: unknown;
    method?: unknown;
    url?: unknown;
    headers?: unknown[];
    query?: unknown[];
    body?: unknown[];
    cookies?: unknown[];
    responses?: unknown[];
    auth?: unknown;
}

const VALID_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);

export function validateSmartCreatePayload(input: SmartCreateValidationInput): FieldValidationResult {
    const errors: FieldValidationIssue[] = [];
    const warnings: FieldValidationIssue[] = [];
    const section = 'api';

    // 基础必填
    if (typeof input.name !== 'string' || input.name.trim().length === 0) {
        errors.push({ section, message: 'name 必填且不能为空' });
    }
    if (typeof input.method !== 'string' || !VALID_METHODS.has(input.method.toUpperCase())) {
        errors.push({ section, message: `method 必填且必须是 ${[...VALID_METHODS].join(' / ')} 之一` });
    } else if (input.method !== input.method.toUpperCase()) {
        warnings.push({ section, message: `method "${input.method}" 建议大写（如 "${input.method.toUpperCase()}"）` });
    }
    if (typeof input.url !== 'string' || input.url.trim().length === 0) {
        errors.push({ section, message: 'url 必填且不能为空' });
    } else if (!input.url.startsWith('/') && !/^https?:\/\//i.test(input.url) && !input.url.startsWith('{{')) {
        warnings.push({ section, message: `url "${input.url}" 既不是以 / 开头的路径，也不是完整 URL 或 {{变量}} 前缀` });
    }

    // auth 结构
    if (input.auth !== undefined) {
        const auth = input.auth as Record<string, unknown>;
        if (!auth || typeof auth !== 'object' || Array.isArray(auth)) {
            errors.push({ section: 'auth', message: 'auth 必须是对象，如 {"type":"bearer","bearer":{"key":"token"}}' });
        } else if (auth.type !== undefined && typeof auth.type !== 'string') {
            errors.push({ section: 'auth', message: 'auth.type 必须是字符串' });
        }
    }

    // 各字段列表
    const sections: Array<[string, unknown[] | undefined]> = [
        ['headers', input.headers],
        ['query', input.query],
        ['body', input.body],
        ['cookies', input.cookies]
    ];
    for (const [name, list] of sections) {
        const r = validateApiFields(list, name);
        errors.push(...r.errors);
        warnings.push(...r.warnings);
    }

    // responses 结构 + 内部字段
    if (input.responses !== undefined) {
        if (!Array.isArray(input.responses)) {
            errors.push({ section: 'responses', message: 'responses 必须是数组' });
        } else {
            input.responses.forEach((resp, index) => {
                const loc = `responses[${index}]`;
                if (!resp || typeof resp !== 'object' || Array.isArray(resp)) {
                    errors.push({ section: 'responses', key: loc, message: '响应项必须是对象' });
                    return;
                }
                const r = resp as Record<string, unknown>;

                // 已是 ApiPost 原生结构的透传项，跳过 fields 检查
                if (r.example_id !== undefined || r.expect !== undefined || r.raw !== undefined) {
                    return;
                }

                if (r.data !== undefined) {
                    errors.push({
                        section: 'responses',
                        key: loc,
                        message: '禁止传 data，请改用 fields 字段列表（data 已禁用）'
                    });
                }
                if (!Array.isArray(r.fields) || r.fields.length === 0) {
                    errors.push({
                        section: 'responses',
                        key: loc,
                        message: 'fields 必填且不能为空，否则保存后响应示例为空，文档无任何展示'
                    });
                } else {
                    const r2 = validateApiFields(r.fields, `${loc}.fields`);
                    errors.push(...r2.errors);
                    warnings.push(...r2.warnings);
                }
                if (r.status !== undefined && (typeof r.status !== 'number' || r.status < 100 || r.status > 599)) {
                    warnings.push({ section: 'responses', key: loc, message: `status "${String(r.status)}" 不是合法的 HTTP 状态码` });
                }
            });
        }
    }

    return { errors, warnings };
}

/**
 * 格式化校验结果为可读文本
 */
export function formatValidationResult(result: FieldValidationResult): string {
    const lines: string[] = [];
    if (result.errors.length > 0) {
        lines.push(`❌ 错误（${result.errors.length} 项，阻断保存）:`);
        result.errors.forEach((e, i) => {
            const loc = e.key ? `${e.section} → ${e.key}` : e.section;
            lines.push(`  ${i + 1}. [${loc}] ${e.message}`);
        });
    }
    if (result.warnings.length > 0) {
        lines.push(`⚠️ 警告（${result.warnings.length} 项，不阻断）:`);
        result.warnings.forEach((w, i) => {
            const loc = w.key ? `${w.section} → ${w.key}` : w.section;
            lines.push(`  ${i + 1}. [${loc}] ${w.message}`);
        });
    }
    return lines.join('\n');
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
