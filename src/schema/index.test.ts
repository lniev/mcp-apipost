import { describe, expect, it } from 'vitest';
import {
  buildBodySection,
  flattenSchemaProperties,
  formatSchemaTable,
  generateRequestBodyFromParams,
  generateResponseData,
  normalizeResponses,
  parameterToSchema,
  schemaToJsDoc,
  schemaToTypeScript
} from './index.js';
import type { ApiField, ApiParameter } from '../types/index.js';

describe('generateRequestBodyFromParams', () => {
  it('空参数返回空对象', () => {
    expect(generateRequestBodyFromParams(undefined)).toEqual({});
    expect(generateRequestBodyFromParams([])).toEqual({});
  });

  it('字段列表转为请求体对象', () => {
    const fields: ApiField[] = [{ key: 'a', type: 'integer', example: 1 }];
    expect(generateRequestBodyFromParams(fields)).toEqual({ a: 1 });
  });
});

describe('buildBodySection', () => {
  it('无 body 时 mode 为 none', () => {
    const section = buildBodySection([]);
    expect(section.mode).toBe('none');
    expect(section.raw).toBe('');
  });

  it('有 body 时 mode 为 json', () => {
    const section = buildBodySection([{ key: 'a', type: 'integer', example: 1 }]);
    expect(section.mode).toBe('json');
    expect(section.raw).toContain('"a"');
  });
});

describe('generateResponseData', () => {
  it('无配置返回默认成功结构', () => {
    expect(generateResponseData(undefined)).toEqual({ code: 0, message: '操作成功', data: {} });
  });

  it('解析 JSON 字符串', () => {
    expect(generateResponseData('{"code":200,"data":{"id":1}}')).toEqual({
      code: 200,
      data: { id: 1 }
    });
  });

  it('非法 JSON 字符串回退为 data', () => {
    expect(generateResponseData('plain text')).toEqual({ code: 0, message: '操作成功', data: 'plain text' });
  });

  it('对象原样返回', () => {
    const obj = { code: 200, data: [1, 2] };
    expect(generateResponseData(obj)).toBe(obj);
  });
});

describe('normalizeResponses', () => {
  it('未提供响应时生成默认成功响应', () => {
    const result = normalizeResponses(undefined);
    expect(result.is_check_result).toBe(1);
    expect(result.example).toHaveLength(1);
    expect(result.example[0].expect.name).toBe('成功响应');
    expect(result.example[0].expect.code).toBe('200');
  });

  it('显式空数组保留为空响应', () => {
    const result = normalizeResponses([]);
    expect(result.example).toEqual([]);
  });

  it('简化字段格式转为 ApiPost 结构', () => {
    const result = normalizeResponses([
      {
        name: '成功',
        status: 201,
        fields: [{ key: 'data.id', desc: 'ID', type: 'integer', example: 1 }]
      }
    ]);

    expect(result.example).toHaveLength(1);
    const example = result.example[0];
    expect(example.expect.code).toBe('201');
    expect(example.expect.name).toBe('成功');
    expect(JSON.parse(example.raw)).toEqual({ data: { id: 1 } });
  });

  it('空 fields 抛错', () => {
    expect(() => normalizeResponses([{ fields: [] }]))
      .toThrow('responses.fields 必填且不能为空');
  });

  it('已是 ApiPost 响应结构则透传', () => {
    const raw = {
      example_id: '1',
      raw: '{}',
      raw_parameter: [],
      headers: [],
      expect: {
        code: '200',
        content_type: 'application/json',
        is_default: 1,
        mock: '{}',
        name: '成功',
        schema: { type: 'object' },
        verify_type: 'schema',
        sleep: 0
      }
    };
    const result = normalizeResponses([raw]);
    expect(result.example[0]).toBe(raw);
  });
});

describe('flattenSchemaProperties', () => {
  it('扁平化对象属性并保留 required', () => {
    const result = flattenSchemaProperties({
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'integer', description: 'ID' },
        name: { type: 'string', description: '名称' }
      }
    });

    expect(result).toContainEqual({ field: 'id', type: 'integer', desc: 'ID', required: true });
    expect(result).toContainEqual({ field: 'name', type: 'string', desc: '名称', required: false });
  });

  it('数组内对象使用 [] 标记', () => {
    const result = flattenSchemaProperties({
      type: 'object',
      properties: {
        list: {
          type: 'array',
          items: { type: 'object', properties: { id: { type: 'integer', description: 'ID' } } }
        }
      }
    });

    expect(result.some(f => f.field === 'list[].id')).toBe(true);
  });
});

describe('formatSchemaTable', () => {
  it('输出含表头与字段名的表格', () => {
    const output = formatSchemaTable([
      { field: 'id', type: 'integer', desc: 'ID' },
      { field: 'name', type: 'string', desc: '名称' }
    ]);

    expect(output).toContain('Field');
    expect(output).toContain('Type');
    expect(output).toContain('id');
    expect(output).toContain('name');
  });

  it('空字段输出空串', () => {
    expect(formatSchemaTable([])).toBe('');
  });
});

describe('parameterToSchema', () => {
  it('转换参数并标记必填', () => {
    const params: ApiParameter[] = [
      { key: 'id', not_null: 1, field_type: 'integer' },
      { key: 'name', field_type: 'string', description: '名称' }
    ];

    const schema = parameterToSchema(params, 'User');
    expect(schema.title).toBe('User');
    expect(schema.properties).toMatchObject({
      id: { type: 'integer' },
      name: { type: 'string', description: '名称' }
    });
    expect(schema.required).toEqual(['id']);
  });
});

describe('schemaToJsDoc', () => {
  it('生成 typedef 与属性注释', () => {
    const output = schemaToJsDoc({
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'integer', description: 'ID' },
        name: { type: 'string', description: '名称' }
      }
    }, 'User');

    expect(output).toContain('@typedef {object} User - User参数');
    expect(output).toContain('@property {number} id - ID');
    expect(output).toContain('@property {string} [name] - 名称');
  });
});

describe('schemaToTypeScript', () => {
  it('生成 interface 与基本类型', () => {
    const output = schemaToTypeScript({
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'integer', description: 'ID' },
        name: { type: 'string', description: '名称' },
        tags: { type: 'array', items: { type: 'string', description: '标签' } }
      }
    }, 'User');

    expect(output).toContain('export interface User');
    expect(output).toContain('id: number');
    expect(output).toContain('name?: string');
    expect(output).toContain('tags?: string[]');
    expect(output).toContain('// ID');
  });
});