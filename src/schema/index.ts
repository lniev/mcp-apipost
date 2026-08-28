/**
 * ApiPost MCP Schema 处理模块
 * 负责参数转换、Body 构建、响应处理等
 */

import { APIPOST_INLINE_COMMENTS } from '../config/index.js';
import type {
    ApiField,
    ApiParameter,
    ApiPostResponseExample,
    BodySection,
    ResponseConfig,
    ResponseField
} from '../types/index.js';
import {
    buildDescMap,
    buildJsonFromFieldList,
    convertParams,
    expandFieldListWithParents,
    stringifyWithComments
} from '../utils/index.js';

// ============ 生成请求体 ============
export function generateRequestBodyFromParams(bodyParams: ApiField[] | undefined): Record<string, unknown> {
    if (!Array.isArray(bodyParams) || bodyParams.length === 0)
        return {};
    return buildJsonFromFieldList(bodyParams);
}

// ============ 从字段列表构建 JSON Schema ============
export function buildJsonSchema(fields: ApiField[] | undefined): Record<string, unknown> {
    if (!Array.isArray(fields) || fields.length === 0) {
        return { type: 'object' };
    }

    const schema: Record<string, unknown> = {
        type: 'object',
        properties: {},
        required: []
    };

    // 按字段路径构建嵌套的 schema 结构
    for (const field of fields) {
        if (!field.key) continue;

        const pathSegments = field.key.split('.');
        let currentSchema = schema;  // 每个字段从根开始

        for (let i = 0; i < pathSegments.length; i++) {
            const segment = pathSegments[i];
            const isLast = i === pathSegments.length - 1;
            const isArray = segment.endsWith('[]');
            const cleanKey = isArray ? segment.slice(0, -2) : segment;

            if (isLast) {
                // 最后一个段，设置字段类型和描述
                // 确保 properties 存在
                if (!currentSchema.properties) {
                    currentSchema.properties = {};
                }
                const props = currentSchema.properties as Record<string, unknown>;

                // 如果字段类型是 object 或 array，需要包含嵌套结构
                if (field.type === 'object') {
                    props[cleanKey] = {
                        type: 'object',
                        properties: {},
                        required: [],
                        description: field.desc || field.description || ''
                    };
                } else if (field.type === 'array') {
                    props[cleanKey] = {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {},
                            required: []
                        },
                        description: field.desc || field.description || ''
                    };
                } else {
                    props[cleanKey] = {
                        type: field.type || 'string',
                        description: field.desc || field.description || ''
                    };
                }

                // 处理必填字段
                if (field.required && !field.autoParent) {
                    const req = currentSchema.required as string[];
                    if (!req.includes(cleanKey)) {
                        req.push(cleanKey);
                    }
                }
            } else {
                // 中间段，创建嵌套对象或数组
                // 确保 properties 存在
                if (!currentSchema.properties) {
                    currentSchema.properties = {};
                }
                const props = currentSchema.properties as Record<string, unknown>;

                if (!props[cleanKey]) {
                    if (isArray) {
                        // 创建数组类型
                        props[cleanKey] = {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {},
                                required: []
                            }
                        };
                    } else {
                        // 创建对象类型
                        props[cleanKey] = {
                            type: 'object',
                            properties: {},
                            required: []
                        };
                    }
                }

                // 移动到下一层
                if (isArray) {
                    const arraySchema = props[cleanKey] as Record<string, unknown>;
                    const items = arraySchema.items as Record<string, unknown>;
                    // 确保 items 有 properties
                    if (!items.properties) {
                        items.properties = {};
                    }
                    if (!items.required) {
                        items.required = [];
                    }
                    currentSchema = items;
                } else {
                    currentSchema = props[cleanKey] as Record<string, unknown>;
                }
            }
        }
    }

    return schema;
}

// ============ 构建 Body 区块 ============
export function buildBodySection(bodyParams: ApiField[] | undefined): BodySection {
    const hasBody = Array.isArray(bodyParams) && bodyParams.length > 0;
    const expandedFields = expandFieldListWithParents(bodyParams || []);
    const rawBody = generateRequestBodyFromParams(expandedFields);
    const descMap = buildDescMap(expandedFields);
    const rawString = hasBody
        ? (APIPOST_INLINE_COMMENTS
            ? stringifyWithComments(rawBody, descMap)
            : JSON.stringify(rawBody, null, 4))
        : '';

    // 构建 JSON Schema，包含 properties 和 required
    const schema = buildJsonSchema(expandedFields);

    // 调试日志
    console.log('buildBodySection - bodyParams:', JSON.stringify(bodyParams));
    console.log('buildBodySection - expandedFields:', JSON.stringify(expandedFields));
    console.log('buildBodySection - schema:', JSON.stringify(schema, null, 2));

    return {
        mode: hasBody ? 'json' : 'none',
        parameter: [],
        raw: rawString,
        raw_parameter: convertParams(expandedFields),
        raw_schema: schema,
        binary: null
    };
}

// ============ 生成响应数据 ============
export function generateResponseData(responseConfig: unknown): { code: number; message: string; data: unknown } {
    if (!responseConfig)
        return { code: 0, message: '操作成功', data: {} };
    if (typeof responseConfig === 'string') {
        try {
            return JSON.parse(responseConfig);
        }
        catch {
            return { code: 0, message: '操作成功', data: responseConfig };
        }
    }
    return responseConfig as { code: number; message: string; data: unknown };
}

// ============ 检查是否为 ApiPost 响应示例格式 ============
function isApiPostResponseExample(resp: unknown): resp is ApiPostResponseExample {
    const r = resp as ApiPostResponseExample;
    return !!r && (r.example_id !== undefined || r.expect !== undefined || r.raw !== undefined);
}

// ============ 标准化响应配置 ============
export function normalizeResponses(
    responses: ResponseField[] | undefined,
    options: {
        fallbackExamples?: ApiPostResponseExample[];
        useDefaultWhenMissing?: boolean;
        keepEmpty?: boolean;
        isCheckResult?: number;
    } = {}
): ResponseConfig {
    const {
        fallbackExamples = [],
        useDefaultWhenMissing = true,
        keepEmpty = true,
        isCheckResult = 1
    } = options;

    const hasInput = Array.isArray(responses);
    const inputLength = hasInput ? responses.length : 0;

    // 用户显式提供了空数组并且允许保留空响应
    if (hasInput && inputLength === 0) {
        return { example: keepEmpty ? [] : fallbackExamples, is_check_result: isCheckResult };
    }

    // 未提供响应，使用回退或默认
    if (!hasInput) {
        if (fallbackExamples.length > 0) {
            return { example: fallbackExamples, is_check_result: isCheckResult };
        }
        if (!useDefaultWhenMissing) {
            return { example: [], is_check_result: isCheckResult };
        }
        const defaultData = generateResponseData(undefined);
        return {
            example: [{
                example_id: '1',
                raw: JSON.stringify(defaultData, null, 4),
                raw_parameter: [],
                headers: [],
                expect: {
                    code: '200',
                    content_type: 'application/json',
                    is_default: 1,
                    mock: JSON.stringify(defaultData),
                    name: '成功响应',
                    schema: { type: 'object', properties: {} },
                    verify_type: 'schema',
                    sleep: 0
                }
            }],
            is_check_result: isCheckResult
        };
    }

    // 已经是 ApiPost 的响应结构，直接透传
    if (responses.some(isApiPostResponseExample)) {
        return { example: responses as ApiPostResponseExample[], is_check_result: isCheckResult };
    }

    // 简化格式 -> ApiPost 兼容格式
    const converted = responses.map((resp, index) => {
        const fields = Array.isArray(resp.fields) ? resp.fields : [];
        if (fields.length === 0) {
            throw new Error('responses.fields 必填且不能为空，data 字段已禁用，请提供字段列表');
        }

        // 只调用一次 expandFieldListWithParents，避免重复计算和潜在的循环引用
        const expandedFields = expandFieldListWithParents(fields);
        const descMap = buildDescMap(expandedFields);
        const rawData = buildJsonFromFieldList(expandedFields);

        // 提前生成所有需要的数据，避免在对象构造中重复调用
        const rawString = APIPOST_INLINE_COMMENTS && expandedFields.length > 0
            ? stringifyWithComments(rawData, descMap)
            : JSON.stringify(rawData, null, 4);

        // 重要：深拷贝 rawData 避免循环引用
        let mockData: string;
        try {
            mockData = JSON.stringify(JSON.parse(JSON.stringify(rawData)));
        } catch (e) {
            console.error('Failed to stringify rawData:', e);
            mockData = '{}';
        }

        const rawParameters = convertParams(expandedFields);

        // 从字段列表生成 JSON Schema
        const schema = buildJsonSchema(expandedFields);

        return {
            example_id: String(index + 1),
            raw: rawString,
            raw_parameter: rawParameters,
            headers: [],
            expect: {
                code: String(resp.status ?? 200),
                content_type: 'application/json',
                is_default: index === 0 ? 1 : -1,
                mock: mockData,
                name: resp.name || (index === 0 ? '成功响应' : `响应${index + 1}`),
                schema: schema,
                verify_type: 'schema',
                sleep: 0
            }
        };
    });

    return { example: converted, is_check_result: isCheckResult };
}

// ============ 递归扁平化 JSON Schema properties ============
export function flattenSchemaProperties(
    schema: Record<string, unknown> | null | undefined,
    prefix = '',
    requiredSet: Set<string> = new Set(),
    result: { field: string; type: string; desc: string; required: boolean }[] = []
): { field: string; type: string; desc: string; required: boolean }[] {
    if (!schema || typeof schema !== 'object') return result;

    // 获取当前层级的 required 字段
    const currentRequired = new Set(Array.isArray(schema.required) ? schema.required as string[] : []);

    // 处理数组类型
    if (schema.type === 'array' && schema.items) {
        const itemSchema = schema.items as Record<string, unknown>;
        if (itemSchema.properties) {
            Object.entries(itemSchema.properties).forEach(([key, prop]) => {
                const p = prop as Record<string, unknown>;
                const fieldPath = prefix ? `${prefix}[].${key}` : `${key}[]`;
                const type = (p.type as string) || 'any';
                const desc = (p.description as string) || '';
                const isRequired = currentRequired.has(key);
                result.push({ field: fieldPath, type, desc, required: isRequired });
                if (p.type === 'object' && p.properties) {
                    flattenSchemaProperties(p, fieldPath, currentRequired, result);
                } else if (p.type === 'array' && p.items) {
                    flattenSchemaProperties(p, fieldPath, currentRequired, result);
                }
            });
        } else {
            const itemType = (itemSchema.type as string) || 'any';
            const arrPath = prefix || 'items[]';
            result.push({
                field: arrPath,
                type: `array<${itemType}>`,
                desc: (schema.description as string) || (itemSchema.description as string) || '',
                required: false
            });
            if (itemSchema.type === 'object' && itemSchema.properties) {
                flattenSchemaProperties(itemSchema, arrPath, currentRequired, result);
            }
        }
        return result;
    }

    // 处理对象类型
    if (schema.properties) {
        Object.entries(schema.properties).forEach(([key, prop]) => {
            const p = prop as Record<string, unknown>;
            const fieldPath = prefix ? `${prefix}.${key}` : key;
            const type = (p.type as string) || 'any';
            const desc = (p.description as string) || '';
            const isRequired = currentRequired.has(key);
            result.push({ field: fieldPath, type, desc, required: isRequired });
            if (p.type === 'object' && p.properties) {
                flattenSchemaProperties(p, fieldPath, currentRequired, result);
            } else if (p.type === 'array' && p.items) {
                flattenSchemaProperties(p, fieldPath, currentRequired, result);
            }
        });
    }

    return result;
}

// ============ 将扁平化的 schema 字段格式化为 ASCII 表格 ============
export function formatSchemaTable(
    fields: { field: string; type: string; desc: string }[],
    indent = 6
): string {
    if (!fields || fields.length === 0) return '';

    const indentStr = ' '.repeat(indent);
    const maxFieldLen = Math.max(...fields.map(f => f.field.length), 5);
    const maxTypeLen = Math.max(...fields.map(f => f.type.length), 4);

    const lines: string[] = [];
    // 表头
    lines.push(`${indentStr}+${'-'.repeat(maxFieldLen + 2)}+${'-'.repeat(maxTypeLen + 2)}+${'-'.repeat(20)}+`);
    lines.push(`${indentStr}| ${'Field'.padEnd(maxFieldLen)} | ${'Type'.padEnd(maxTypeLen)} | Description          |`);
    lines.push(`${indentStr}+${'-'.repeat(maxFieldLen + 2)}+${'-'.repeat(maxTypeLen + 2)}+${'-'.repeat(20)}+`);

    // 数据行
    for (const f of fields) {
        const desc = f.desc.length > 18 ? f.desc.substring(0, 18) + '..' : f.desc.padEnd(18);
        lines.push(`${indentStr}| ${f.field.padEnd(maxFieldLen)} | ${f.type.padEnd(maxTypeLen)} | ${desc} |`);
    }

    lines.push(`${indentStr}+${'-'.repeat(maxFieldLen + 2)}+${'-'.repeat(maxTypeLen + 2)}+${'-'.repeat(20)}+`);
    return lines.join('\n');
}

// ============ 将 parameter 数组转换为 JSON Schema ============
export function parameterToSchema(params: ApiParameter[], name: string): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const p of params) {
        const key = p.key;
        if (!key) continue;

        // 优先使用 schema 字段，否则使用 field_type
        const paramSchema = p.schema || {};
        const fieldType = (paramSchema.type as string) || p.field_type || 'string';

        properties[key] = {
            type: fieldType,
            description: p.description || ''
        };

        // 如果有 format，添加到 schema
        if (paramSchema.format) {
            (properties[key] as Record<string, unknown>).format = paramSchema.format;
        }

        // not_null === 1 表示必填
        if (p.not_null === 1) {
            required.push(key);
        }
    }

    return {
        type: 'object',
        title: name,
        description: `${name}参数`,
        properties,
        required
    };
}

// ============ 将 JSON Schema 转为 JSDoc 注释 ============
export function schemaToJsDoc(schema: Record<string, unknown>, name: string, depth = 0): string {
    const parts: string[] = [];

    function typeToJsDoc(s: Record<string, unknown> | undefined): string {
        if (!s) return '*';
        if (s.type === 'array' && s.items) {
            return `Array<${typeToJsDoc(s.items as Record<string, unknown>)}>`;
        }
        if (s.type === 'integer') return 'number';
        if (s.type === 'object') return 'Object';
        return (s.type as string) || '*';
    }

    function processObject(
        obj: Record<string, unknown>,
        prefix: string,
        required: string[] | undefined
    ) {
        const reqSet = new Set(Array.isArray(required) ? required : []);
        const props = (obj.properties || {}) as Record<string, Record<string, unknown>>;
        for (const [key, prop] of Object.entries(props)) {
            const p = prop || {};
            const fullKey = prefix ? `${prefix}.${key}` : key;
            const isReq = reqSet.has(key);
            const desc = p.description ? ` - ${p.description}` : '';

            if (p.type === 'object' && p.properties && Object.keys(p.properties).length > 0) {
                parts.push(` * @property {Object} ${isReq ? fullKey : `[${fullKey}]`}${desc}`);
                processObject(p, fullKey, p.required as string[]);
            } else if (p.type === 'array' && p.items) {
                const items = p.items as Record<string, unknown>;
                if (items.type === 'object' && items.properties && Object.keys(items.properties).length > 0) {
                    parts.push(` * @property {Array<Object>} ${isReq ? fullKey : `[${fullKey}]`}${desc}`);
                    processObject(items, fullKey, items.required as string[]);
                } else {
                    const itemType = typeToJsDoc(items);
                    parts.push(` * @property {Array<${itemType}>} ${isReq ? fullKey : `[${fullKey}]`}${desc}`);
                }
            } else {
                const propType = typeToJsDoc(p);
                parts.push(` * @property {${propType}} ${isReq ? fullKey : `[${fullKey}]`}${desc}`);
            }
        }
    }

    parts.push(`/**`);
    parts.push(` * @typedef {object} ${name} - ${name}参数`);
    processObject(schema, '', schema.required as string[]);
    parts.push(` */`);

    return parts.join('\n');
}

// ============ JSON Schema 转 TypeScript Interface ============
interface SchemaProperty {
    type?: string;
    description?: string;
    properties?: Record<string, SchemaProperty>;
    items?: SchemaProperty;
    title?: string;
    required?: string[];
    'x-schema-orders'?: string[];
}

/**
 * 将 JSON Schema 转换为 TypeScript Interface
 * @param schema - JSON Schema 对象
 * @param rootInterfaceName - 根 interface 名称
 * @returns 生成的 TypeScript 代码
 */
export function schemaToTypeScript(schema: Record<string, unknown>, rootInterfaceName: string): string {
    // 存储生成的 interface
    const generatedInterfaces = new Map<string, string>();

    // 将字符串转换为合法的 TypeScript 标识符
    function toValidIdentifier(name: string): string {
        if (!name) return 'Unnamed';

        let result = name
            .replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')
            .replace(/^(\d)/, '_$1');

        if (!result || /^_?\d/.test(result)) {
            result = 'Type_' + result.replace(/^_/, '');
        }

        return result;
    }

    // 生成单行注释
    function generateComment(schemaObj: SchemaProperty, indent = '  '): string {
        if (schemaObj.description) {
            return `${indent}// ${schemaObj.description}\n`;
        }
        return '';
    }

    // 映射基本类型
    function mapBasicType(type: string | undefined): string {
        switch (type) {
            case 'string': return 'string';
            case 'integer':
            case 'number': return 'number';
            case 'boolean': return 'boolean';
            default: return 'any';
        }
    }

    // 生成 interface 字符串（递归处理嵌套对象）
    function generateInterface(
        schemaObj: SchemaProperty,
        interfaceName: string,
        isTopLevel = true
    ): string {
        if (!schemaObj.properties) {
            return `export interface ${interfaceName} {}`;
        }

        const properties = schemaObj.properties;
        const required = schemaObj.required || [];
        const order = schemaObj['x-schema-orders'] || Object.keys(properties);

        let result = `export interface ${interfaceName} {\n`;

        for (const key of order) {
            const prop = properties[key];
            if (!prop) continue;

            const comment = generateComment(prop, '  ');
            const optional = required.includes(key) ? '' : '?';

            // 处理嵌套对象
            if (prop.type === 'object' && prop.properties) {
                const nestedInterfaceName = toValidIdentifier(prop.title || key);

                // 递归生成嵌套 interface
                if (!generatedInterfaces.has(nestedInterfaceName)) {
                    const nestedInterface = generateInterface(prop, nestedInterfaceName, false);
                    generatedInterfaces.set(nestedInterfaceName, nestedInterface);
                }

                if (comment) {
                    result += `${comment}  ${key}${optional}: ${nestedInterfaceName};\n`;
                } else {
                    result += `  ${key}${optional}: ${nestedInterfaceName};\n`;
                }
            }
            // 处理数组
            else if (prop.type === 'array' && prop.items) {
                if (prop.items.type === 'object' && prop.items.properties) {
                    // 数组中的对象类型
                    const itemInterfaceName = toValidIdentifier(prop.items.title || `${key}_item`);

                    if (!generatedInterfaces.has(itemInterfaceName)) {
                        const itemInterface = generateInterface(prop.items, itemInterfaceName, false);
                        generatedInterfaces.set(itemInterfaceName, itemInterface);
                    }

                    if (comment) {
                        result += `${comment}  ${key}${optional}: ${itemInterfaceName}[];\n`;
                    } else {
                        result += `  ${key}${optional}: ${itemInterfaceName}[];\n`;
                    }
                } else {
                    // 基本类型的数组
                    const itemType = mapBasicType(prop.items.type);
                    if (comment) {
                        result += `${comment}  ${key}${optional}: ${itemType}[];\n`;
                    } else {
                        result += `  ${key}${optional}: ${itemType}[];\n`;
                    }
                }
            }
            // 基本类型
            else {
                const tsType = mapBasicType(prop.type);
                if (comment) {
                    result += `${comment}  ${key}${optional}: ${tsType};\n`;
                } else {
                    result += `  ${key}${optional}: ${tsType};\n`;
                }
            }
        }

        result += '}';

        if (isTopLevel) {
            generatedInterfaces.set(interfaceName, result);
        }

        return result;
    }

    // 先生成根 interface，这会递归生成所有嵌套的 interface
    generateInterface(schema as SchemaProperty, rootInterfaceName, true);

    // 按顺序组合所有 interface
    return Array.from(generatedInterfaces.values()).join('\n\n');
}
