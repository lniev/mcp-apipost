import { describe, expect, it } from 'vitest';
import {
  buildDescMap,
  buildJsonFromFieldList,
  convertParams,
  defaultValueByType,
  expandFieldListWithParents,
  fixIllegalTypeNames,
  formatError,
  formatValidationResult,
  stringifyWithComments,
  toValidIdentifier,
  validateApiFields,
  validateSmartCreatePayload
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

describe('validateApiFields', () => {
  it('合格字段列表通过校验', () => {
    const r = validateApiFields([
      { key: 'data', desc: '返回体', type: 'object' },
      { key: 'data.id', desc: 'ID', type: 'integer', example: 1 }
    ], 'body');

    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('非数组输入报错', () => {
    const r = validateApiFields({ key: 'a' }, 'body');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toContain('必须是数组');
  });

  it('缺少 key 或 key 为空报错', () => {
    const r = validateApiFields([{ desc: 'x' }, { key: '' }], 'query');
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0].message).toContain('缺少 key');
  });

  it('key 格式非法报错（空段 / [] 不在段尾）', () => {
    const r = validateApiFields([
      { key: 'a..b', desc: '空段' },
      { key: 'a[]b.c', desc: '中括号位置错误' },
      { key: '.a', desc: '点开头' }
    ], 'body');
    expect(r.errors).toHaveLength(3);
    expect(r.errors.every(e => e.message.includes('key 格式非法'))).toBe(true);
  });

  it('重复 key 报错', () => {
    const r = validateApiFields([
      { key: 'id', desc: 'a', type: 'string' },
      { key: 'id', desc: 'b', type: 'string' }
    ], 'body');
    expect(r.errors.some(e => e.message.includes('重复'))).toBe(true);
  });

  it('非法 type 报错', () => {
    const r = validateApiFields([{ key: 'id', desc: 'x', type: 'str' }], 'body');
    expect(r.errors[0].message).toContain('type "str" 非法');
  });

  it('缺少 desc 产生警告', () => {
    const r = validateApiFields([{ key: 'id', type: 'integer', example: 1 }], 'body');
    expect(r.errors).toEqual([]);
    expect(r.warnings.some(w => w.message.includes('缺少 desc'))).toBe(true);
  });

  it('example 为字符串化 JSON 报错', () => {
    const r = validateApiFields([
      { key: 'data', desc: 'x', type: 'object', example: '{"a":1}' },
      { key: 'tags', desc: 'y', type: 'array', example: '["a","b"]' }
    ], 'body');
    expect(r.errors).toHaveLength(2);
    expect(r.errors.every(e => e.message.includes('字符串化的 JSON'))).toBe(true);
  });

  it('example 类型与声明 type 不匹配报错', () => {
    const r = validateApiFields([
      { key: 'count', desc: '数量', type: 'integer', example: 'abc' },
      { key: 'rate', desc: '评分', type: 'number', example: 4.5 },
      { key: 'flag', desc: '标志', type: 'boolean', example: true }
    ], 'body');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].key).toBe('count');
    expect(r.errors[0].message).toContain('不匹配');
  });

  it('example 为对象/数组真实值时通过', () => {
    const r = validateApiFields([
      { key: 'data', desc: '对象', type: 'object', example: { a: 1 } },
      { key: 'tags', desc: '数组', type: 'array', example: ['a'] }
    ], 'body');
    expect(r.errors).toEqual([]);
  });

  it('路径类型冲突报错（父级被声明为基本类型）', () => {
    const r = validateApiFields([
      { key: 'data.user', desc: '用户', type: 'string' },
      { key: 'data.user.id', desc: 'ID', type: 'integer', example: 1 }
    ], 'body');
    expect(r.errors.some(e => e.message.includes('路径类型冲突'))).toBe(true);
  });

  it('父级未显式声明产生警告', () => {
    const r = validateApiFields([
      { key: 'data.user.id', desc: 'ID', type: 'integer', example: 1 }
    ], 'body');
    expect(r.errors).toEqual([]);
    const parentWarnings = r.warnings.filter(w => w.message.includes('父级节点未显式声明'));
    expect(parentWarnings.map(w => w.key).sort()).toEqual(['data', 'data.user']);
  });

  it('object/array 叶子无子字段产生警告', () => {
    const r = validateApiFields([
      { key: 'meta', desc: '空对象', type: 'object' }
    ], 'body');
    expect(r.warnings.some(w => w.key === 'meta' && w.message.includes('没有任何子字段'))).toBe(true);
  });
});

describe('validateSmartCreatePayload', () => {
  it('合格完整入参通过校验', () => {
    const r = validateSmartCreatePayload({
      name: '获取用户',
      method: 'GET',
      url: '/api/user',
      query: [{ key: 'id', desc: '用户ID', type: 'integer', example: 1 }],
      responses: [{ name: '成功', status: 200, fields: [{ key: 'code', desc: '状态码', type: 'integer', example: 0 }] }]
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('缺少必填参数报错', () => {
    const r = validateSmartCreatePayload({});
    expect(r.errors.some(e => e.message.includes('name 必填'))).toBe(true);
    expect(r.errors.some(e => e.message.includes('method 必填'))).toBe(true);
    expect(r.errors.some(e => e.message.includes('url 必填'))).toBe(true);
  });

  it('method 非法报错，小写产生警告', () => {
    const bad = validateSmartCreatePayload({ name: 'x', method: 'PATCH', url: '/x' });
    expect(bad.errors.some(e => e.message.includes('method 必填'))).toBe(true);

    const lower = validateSmartCreatePayload({ name: 'x', method: 'get', url: '/x' });
    expect(lower.errors).toEqual([]);
    expect(lower.warnings.some(w => w.message.includes('建议大写'))).toBe(true);
  });

  it('responses 传 data 报错', () => {
    const r = validateSmartCreatePayload({
      name: 'x', method: 'GET', url: '/x',
      responses: [{ name: '成功', status: 200, data: { code: 0 }, fields: [{ key: 'code', desc: 'c', type: 'integer' }] }]
    });
    expect(r.errors.some(e => e.message.includes('禁止传 data'))).toBe(true);
  });

  it('responses.fields 为空报错（防止文档无展示）', () => {
    const r = validateSmartCreatePayload({
      name: 'x', method: 'GET', url: '/x',
      responses: [{ name: '成功', status: 200, fields: [] }]
    });
    expect(r.errors.some(e => e.message.includes('fields 必填且不能为空'))).toBe(true);
  });

  it('responses 为 ApiPost 原生结构时跳过 fields 检查', () => {
    const r = validateSmartCreatePayload({
      name: 'x', method: 'GET', url: '/x',
      responses: [{ example_id: '1', raw: '{}', expect: { code: '200' } }]
    });
    expect(r.errors).toEqual([]);
  });

  it('responses 内部字段会递归校验', () => {
    const r = validateSmartCreatePayload({
      name: 'x', method: 'GET', url: '/x',
      responses: [{ name: '成功', status: 200, fields: [{ key: 'code', type: 'int' }] }]
    });
    expect(r.errors.some(e => e.section === 'responses[0].fields' && e.message.includes('非法'))).toBe(true);
  });

  it('auth 结构非法报错', () => {
    const r = validateSmartCreatePayload({ name: 'x', method: 'GET', url: '/x', auth: 'not-object' });
    expect(r.errors.some(e => e.message.includes('auth 必须是对象'))).toBe(true);
  });

  it('url 非路径非完整 URL 产生警告', () => {
    const r = validateSmartCreatePayload({ name: 'x', method: 'GET', url: 'api/user' });
    expect(r.errors).toEqual([]);
    expect(r.warnings.some(w => w.message.includes('url'))).toBe(true);
  });
});

describe('formatValidationResult', () => {
  it('格式化错误与警告', () => {
    const output = formatValidationResult({
      errors: [{ section: 'body', key: 'id', message: '出错了' }],
      warnings: [{ section: 'query', message: '注意了' }]
    });
    expect(output).toContain('❌ 错误（1 项');
    expect(output).toContain('[body → id] 出错了');
    expect(output).toContain('⚠️ 警告（1 项');
    expect(output).toContain('[query] 注意了');
  });
});