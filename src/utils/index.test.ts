import { describe, expect, it } from 'vitest';
import {
  buildDescMap,
  buildJsonFromFieldList,
  convertParams,
  defaultValueByType,
  expandFieldListWithParents,
  fixIllegalTypeNames,
  formatError,
  stringifyWithComments,
  toValidIdentifier
} from './index.js';
import type { ApiField } from '../types/index.js';

describe('defaultValueByType', () => {
  it('按类型返回默认值', () => {
    expect(defaultValueByType('integer')).toBe(0);
    expect(defaultValueByType('number')).toBe(0);
    expect(defaultValueByType('boolean')).toBe(false);
    expect(defaultValueByType('array')).toEqual([]);
    expect(defaultValueByType('object')).toEqual({});
    expect(defaultValueByType('null')).toBeNull();
    expect(defaultValueByType('string')).toBe('');
  });

  it('未知类型或空类型回退为字符串', () => {
    expect(defaultValueByType(undefined)).toBe('');
    expect(defaultValueByType('custom-type')).toBe('');
  });
});

describe('expandFieldListWithParents', () => {
  it('为嵌套字段补充父级', () => {
    const fields: ApiField[] = [
      { key: 'data.user.id', desc: '用户ID', type: 'integer' },
      { key: 'data.user.name', desc: '用户名', type: 'string' }
    ];

    const result = expandFieldListWithParents(fields);

    expect(result.map(f => f.key)).toEqual([
      'data',
      'data.user',
      'data.user.id',
      'data.user.name'
    ]);
    expect(result.filter(f => f.autoParent)).toHaveLength(2);
    expect(result.filter(f => f.autoParent).map(f => f.type)).toEqual(['object', 'object']);
  });

  it('数组父级标记为 array 类型', () => {
    const result = expandFieldListWithParents([{ key: 'items[].id', type: 'integer', desc: 'ID' }]);
    const parent = result.find(f => f.autoParent);
    expect(parent?.key).toBe('items');
    expect(parent?.type).toBe('array');
  });

  it('空数组返回空', () => {
    expect(expandFieldListWithParents([])).toEqual([]);
    expect(expandFieldListWithParents(undefined)).toEqual([]);
  });
});

describe('buildJsonFromFieldList', () => {
  it('构建嵌套对象', () => {
    const fields: ApiField[] = [
      { key: 'data.user.id', type: 'integer', example: 1 },
      { key: 'data.user.name', type: 'string', example: '张三' }
    ];

    expect(buildJsonFromFieldList(fields)).toEqual({
      data: { user: { id: 1, name: '张三' } }
    });
  });

  it('构建数组结构', () => {
    const fields: ApiField[] = [
      { key: 'items[].id', type: 'integer', example: 5 },
      { key: 'items[].name', type: 'string', example: 'a' }
    ];

    expect(buildJsonFromFieldList(fields)).toEqual({
      items: [{ id: 5, name: 'a' }]
    });
  });

  it('无示例值时使用类型默认值', () => {
    const fields: ApiField[] = [{ key: 'count', type: 'integer' }];
    expect(buildJsonFromFieldList(fields)).toEqual({ count: 0 });
  });

  it('跳过自动补充的父级字段', () => {
    const fields: ApiField[] = [
      { key: 'data', autoParent: true, type: 'object' },
      { key: 'data.id', type: 'integer', example: 1 }
    ];
    expect(buildJsonFromFieldList(fields)).toEqual({ data: { id: 1 } });
  });
});

describe('buildDescMap / stringifyWithComments', () => {
  it('生成带行内注释的 JSON', () => {
    const fields: ApiField[] = [
      { key: 'data.user.id', desc: '用户ID', type: 'integer', example: 1 }
    ];
    const expanded = expandFieldListWithParents(fields);
    const descMap = buildDescMap(expanded);
    const raw = buildJsonFromFieldList(expanded);

    const output = stringifyWithComments(raw, descMap);

    expect(output).toContain('// 用户ID');
    expect(output).toContain('"id"');
  });

  it('数组 key 中的 [] 会归一化为 [0]', () => {
    const fields: ApiField[] = [{ key: 'items[].id', desc: '条目ID', type: 'integer', example: 1 }];
    const descMap = buildDescMap(fields);
    expect(descMap.get('items[0].id')).toBe('条目ID');
  });
});

describe('convertParams', () => {
  it('字段列表转为参数结构', () => {
    const params = convertParams([
      { key: 'name', desc: '名称', type: 'string', example: 'x', required: true }
    ]);

    expect(params).toHaveLength(1);
    expect(params[0].key).toBe('name');
    expect(params[0].description).toBe('名称');
    expect(params[0].field_type).toBe('string');
    expect(params[0].value).toBe('x');
    expect(params[0].not_null).toBe(1);
    expect(params[0].param_id).toBeTruthy();
  });

  it('忽略非法字段', () => {
    expect(convertParams([{ key: '' } as ApiField])).toEqual([]);
  });
});

describe('toValidIdentifier / fixIllegalTypeNames', () => {
  it('合法标识符原样返回', () => {
    expect(toValidIdentifier('validName')).toBe('validName');
  });

  it('非法字符替换为下划线', () => {
    expect(toValidIdentifier('foo-bar')).toBe('foo_bar');
  });

  it('数字开头加前缀', () => {
    expect(toValidIdentifier('3foo')).toBe('Type_3foo');
  });

  it('修复纯数字类型名', () => {
    expect(fixIllegalTypeNames('export type 123 = { a: string };'))
      .toBe('export type Type_123 = { a: string };');
  });
});

describe('formatError', () => {
  it('包装 Error 对象', () => {
    const output = formatError(new Error('boom'), 'myTool');
    expect(output).toContain("工具 'myTool' 执行失败");
    expect(output).toContain('boom');
  });

  it('包装非 Error 值', () => {
    const output = formatError('原始错误', 'myTool');
    expect(output).toContain('原始错误');
  });
});