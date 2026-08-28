/**
 * Schema 修复测试 - 验证响应参数列表生成功能
 * 测试目标: 确保 buildJsonSchema 正确从字段列表生成 JSON Schema
 */

import { describe, expect, it } from 'vitest';
import { buildJsonSchema, normalizeResponses } from './index.js';
import type { ApiField } from '../types/index.js';

describe('Schema 修复测试', () => {
  describe('buildJsonSchema - 基础功能', () => {
    it('空字段返回空 object schema', () => {
      const schema = buildJsonSchema([]);
      expect(schema).toEqual({ type: 'object' });
    });

    it('undefined 返回空 object schema', () => {
      const schema = buildJsonSchema(undefined);
      expect(schema).toEqual({ type: 'object' });
    });

    it('单个基础字段生成正确 schema', () => {
      const fields: ApiField[] = [
        { key: 'code', type: 'integer', example: 0, desc: '状态码' }
      ];

      const schema = buildJsonSchema(fields);

      expect(schema).toMatchObject({
        type: 'object',
        properties: {
          code: {
            type: 'integer',
            description: '状态码'
          }
        }
      });
    });

    it('多个基础字段生成正确 schema', () => {
      const fields: ApiField[] = [
        { key: 'code', type: 'integer', example: 0, desc: '状态码' },
        { key: 'msg', type: 'string', example: 'success', desc: '消息' }
      ];

      const schema = buildJsonSchema(fields);

      expect(schema).toMatchObject({
        type: 'object',
        properties: {
          code: { type: 'integer', description: '状态码' },
          msg: { type: 'string', description: '消息' }
        }
      });
    });
  });

  describe('buildJsonSchema - 测试1: 单层嵌套对象', () => {
    it('正确处理 data.userId 和 data.username 嵌套字段', () => {
      const fields: ApiField[] = [
        { key: 'code', type: 'integer', example: 0, desc: '状态码' },
        { key: 'msg', type: 'string', example: 'success', desc: '消息' },
        { key: 'data', type: 'object', desc: '返回数据' },
        { key: 'data.userId', type: 'string', example: 'user_123', desc: '用户ID' },
        { key: 'data.username', type: 'string', example: '张三', desc: '用户名' }
      ];

      const schema = buildJsonSchema(fields);

      // 验证根级字段
      expect(schema.type).toBe('object');
      expect(schema).toHaveProperty('properties');
      const props = schema.properties as Record<string, any>;

      // 验证 code 字段
      expect(props.code).toMatchObject({
        type: 'integer',
        description: '状态码'
      });

      // 验证 msg 字段
      expect(props.msg).toMatchObject({
        type: 'string',
        description: '消息'
      });

      // 验证 data 是 object 类型
      expect(props.data).toMatchObject({
        type: 'object',
        description: '返回数据'
      });
      expect(props.data).toHaveProperty('properties');

      // 验证 data 的子字段
      const dataProps = props.data.properties as Record<string, any>;
      expect(dataProps.userId).toMatchObject({
        type: 'string',
        description: '用户ID'
      });
      expect(dataProps.username).toMatchObject({
        type: 'string',
        description: '用户名'
      });
    });
  });

  describe('buildJsonSchema - 测试2: 数组嵌套', () => {
    it('正确处理 data.list[].id 和 data.list[].name', () => {
      const fields: ApiField[] = [
        { key: 'code', type: 'integer', example: 0, desc: '状态码' },
        { key: 'data', type: 'object', desc: '数据' },
        { key: 'data.list', type: 'array', desc: '数据列表' },
        { key: 'data.list[].id', type: 'string', example: 'item_001', desc: '项目ID' },
        { key: 'data.list[].name', type: 'string', example: '测试项目', desc: '项目名称' }
      ];

      const schema = buildJsonSchema(fields);
      const props = schema.properties as Record<string, any>;

      // 验证 data 对象
      expect(props.data).toMatchObject({
        type: 'object',
        description: '数据'
      });

      const dataProps = props.data.properties as Record<string, any>;

      // 验证 list 是数组类型
      expect(dataProps.list).toMatchObject({
        type: 'array',
        description: '数据列表'
      });
      expect(dataProps.list).toHaveProperty('items');

      // 验证数组元素的结构
      const listItems = dataProps.list.items as Record<string, any>;
      expect(listItems.type).toBe('object');
      expect(listItems).toHaveProperty('properties');

      const listItemProps = listItems.properties as Record<string, any>;
      expect(listItemProps.id).toMatchObject({
        type: 'string',
        description: '项目ID'
      });
      expect(listItemProps.name).toMatchObject({
        type: 'string',
        description: '项目名称'
      });
    });
  });

  describe('buildJsonSchema - 测试3: 复杂多层嵌套', () => {
    it('正确处理深层嵌套: data.list[].meta.createdAt', () => {
      const fields: ApiField[] = [
        { key: 'code', type: 'integer', example: 0, desc: '状态码' },
        { key: 'data', type: 'object', desc: '数据' },
        { key: 'data.list', type: 'array', desc: '数据列表' },
        { key: 'data.list[].id', type: 'string', example: 'item_001', desc: '项目ID' },
        { key: 'data.list[].meta', type: 'object', desc: '元数据' },
        { key: 'data.list[].meta.createdAt', type: 'string', example: '2026-08-28T10:30:00Z', desc: '创建时间' },
        { key: 'data.pagination', type: 'object', desc: '分页信息' },
        { key: 'data.pagination.page', type: 'integer', example: 1, desc: '当前页' }
      ];

      const schema = buildJsonSchema(fields);
      const props = schema.properties as Record<string, any>;
      const dataProps = props.data.properties as Record<string, any>;
      const listItems = dataProps.list.items as Record<string, any>;
      const listItemProps = listItems.properties as Record<string, any>;

      // 验证数组元素的 meta 对象
      expect(listItemProps.meta).toMatchObject({
        type: 'object',
        description: '元数据'
      });

      const metaProps = listItemProps.meta.properties as Record<string, any>;
      expect(metaProps.createdAt).toMatchObject({
        type: 'string',
        description: '创建时间'
      });

      // 验证 pagination 对象
      expect(dataProps.pagination).toMatchObject({
        type: 'object',
        description: '分页信息'
      });

      const paginationProps = dataProps.pagination.properties as Record<string, any>;
      expect(paginationProps.page).toMatchObject({
        type: 'integer',
        description: '当前页'
      });
    });
  });

  describe('normalizeResponses - 集成测试', () => {
    it('测试1: 单层嵌套对象响应正确生成 schema', () => {
      const result = normalizeResponses([
        {
          name: '成功',
          status: 200,
          fields: [
            { key: 'code', type: 'integer', example: 0, desc: '状态码' },
            { key: 'msg', type: 'string', example: 'success', desc: '消息' },
            { key: 'data', type: 'object', desc: '返回数据' },
            { key: 'data.userId', type: 'string', example: 'user_123', desc: '用户ID' },
            { key: 'data.username', type: 'string', example: '张三', desc: '用户名' }
          ]
        }
      ]);

      expect(result.example).toHaveLength(1);
      const example = result.example[0];

      // 验证响应基本信息
      expect(example.expect.code).toBe('200');
      expect(example.expect.name).toBe('成功');

      // 验证 schema 字段存在且不为空
      expect(example.expect.schema).toBeDefined();
      expect(example.expect.schema).not.toEqual({ type: 'object', properties: {} });

      // 验证 schema 结构
      const schema = example.expect.schema as Record<string, any>;
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();

      const props = schema.properties as Record<string, any>;
      expect(props.code).toBeDefined();
      expect(props.data).toBeDefined();
      expect(props.data.properties).toBeDefined();
      expect(props.data.properties.userId).toBeDefined();
      expect(props.data.properties.username).toBeDefined();
    });

    it('测试2: 数组嵌套响应正确生成 schema', () => {
      const result = normalizeResponses([
        {
          name: '成功',
          status: 200,
          fields: [
            { key: 'code', type: 'integer', example: 0, desc: '状态码' },
            { key: 'data', type: 'object', desc: '数据' },
            { key: 'data.list', type: 'array', desc: '数据列表' },
            { key: 'data.list[].id', type: 'string', example: 'item_001', desc: '项目ID' },
            { key: 'data.list[].name', type: 'string', example: '测试项目', desc: '项目名称' }
          ]
        }
      ]);

      const schema = result.example[0].expect.schema as Record<string, any>;
      const dataProps = schema.properties.data.properties as Record<string, any>;

      expect(dataProps.list.type).toBe('array');
      expect(dataProps.list.items).toBeDefined();
      expect(dataProps.list.items.properties).toBeDefined();
      expect(dataProps.list.items.properties.id).toBeDefined();
      expect(dataProps.list.items.properties.name).toBeDefined();
    });

    it('测试3: 复杂多层嵌套响应正确生成 schema', () => {
      const result = normalizeResponses([
        {
          name: '成功',
          status: 200,
          fields: [
            { key: 'code', type: 'integer', example: 0, desc: '状态码' },
            { key: 'data', type: 'object', desc: '数据' },
            { key: 'data.list', type: 'array', desc: '数据列表' },
            { key: 'data.list[].id', type: 'string', example: 'item_001', desc: '项目ID' },
            { key: 'data.list[].meta', type: 'object', desc: '元数据' },
            { key: 'data.list[].meta.createdAt', type: 'string', example: '2026-08-28T10:30:00Z', desc: '创建时间' },
            { key: 'data.pagination', type: 'object', desc: '分页信息' },
            { key: 'data.pagination.page', type: 'integer', example: 1, desc: '当前页' }
          ]
        }
      ]);

      const schema = result.example[0].expect.schema as Record<string, any>;
      const dataProps = schema.properties.data.properties as Record<string, any>;
      const listItemProps = dataProps.list.items.properties as Record<string, any>;

      // 验证深层嵌套
      expect(listItemProps.meta).toBeDefined();
      expect(listItemProps.meta.properties).toBeDefined();
      expect(listItemProps.meta.properties.createdAt).toBeDefined();

      // 验证并列对象
      expect(dataProps.pagination).toBeDefined();
      expect(dataProps.pagination.properties).toBeDefined();
      expect(dataProps.pagination.properties.page).toBeDefined();
    });

    it('测试4: 多状态码响应每个响应都有正确的 schema', () => {
      const result = normalizeResponses([
        {
          name: '成功',
          status: 200,
          fields: [
            { key: 'code', type: 'integer', example: 0, desc: '状态码' },
            { key: 'data', type: 'object', desc: '数据' },
            { key: 'data.result', type: 'boolean', example: true, desc: '操作结果' }
          ]
        },
        {
          name: '参数错误',
          status: 400,
          fields: [
            { key: 'code', type: 'integer', example: 400, desc: '错误码' },
            { key: 'msg', type: 'string', example: '参数错误', desc: '错误消息' },
            { key: 'error', type: 'object', desc: '错误详情' },
            { key: 'error.field', type: 'string', example: 'userId', desc: '错误字段' }
          ]
        }
      ]);

      expect(result.example).toHaveLength(2);

      // 验证 200 响应
      const response200 = result.example[0];
      const schema200 = response200.expect.schema as Record<string, any>;
      expect(schema200.properties.data).toBeDefined();
      expect(schema200.properties.data.properties.result).toBeDefined();

      // 验证 400 响应
      const response400 = result.example[1];
      const schema400 = response400.expect.schema as Record<string, any>;
      expect(schema400.properties.error).toBeDefined();
      expect(schema400.properties.error.properties.field).toBeDefined();
    });
  });

  describe('Schema 非空验证', () => {
    it('修复前的问题: 确保 schema 不是空对象', () => {
      const result = normalizeResponses([
        {
          name: '成功',
          status: 200,
          fields: [
            { key: 'code', type: 'integer', example: 0, desc: '状态码' }
          ]
        }
      ]);

      const schema = result.example[0].expect.schema as Record<string, any>;

      // 这是修复的关键: schema 不应该是空的 properties
      expect(Object.keys(schema.properties || {}).length).toBeGreaterThan(0);
      expect(schema.properties.code).toBeDefined();
    });
  });
});
