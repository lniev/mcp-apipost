/**
 * ApiPost MCP 工具定义模块
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const tools: Tool[] = [
    {
        name: 'apipost_test_connection',
        description: '测试ApiPost MCP连接状态和配置信息，验证服务可用性',
        inputSchema: {
            type: 'object',
            properties: {
                random_string: { type: 'string', description: 'Dummy parameter for no-parameter tools' }
            },
            required: ['random_string']
        }
    },
    {
        name: 'apipost_workspace',
        description: '工作空间管理：查看当前工作空间、列出团队和项目、切换工作空间',
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['current', 'list_teams', 'list_projects', 'switch'],
                    description: '操作类型：current(查看当前)、list_teams(列出团队)、list_projects(列出项目)、switch(切换工作空间)'
                },
                team_id: { type: 'string', description: '团队ID（用于list_projects或switch）' },
                project_id: { type: 'string', description: '项目ID（用于switch）' },
                team_name: { type: 'string', description: '团队名称（用于按名称切换）' },
                project_name: { type: 'string', description: '项目名称（用于按名称切换）' },
                show_details: { type: 'boolean', description: '是否显示详细信息，默认false' },
                show_all: { type: 'boolean', description: '是否显示所有可用的团队和项目，默认false' }
            },
            required: ['action']
        }
    },
    {
        name: 'apipost_create_folder',
        description: '创建API文档目录，支持在指定父目录下创建新的文件夹，暂时不可用，官方未开放创建目录接口',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: '目录名称' },
                parent_id: { type: 'string', description: '父目录ID，使用"0"表示根目录，默认为"0"' },
                description: { type: 'string', description: '目录描述（可选）' }
            },
            required: ['name'],
            additionalProperties: false
        }
    },
    {
        name: 'apipost_smart_create',
        description: 'API接口文档生成器（字段列表驱动）。内置预校验：保存前自动检查字段格式（key/type/example/desc/父级声明），错误会阻断保存并返回修复清单。规则：responses 只传 fields，不传 data；headers/query/body/cookies 统一用字段列表，嵌套用 .，数组用 []；example 填真实值（不要 JSON 字符串）；所有字段含父级都必须写 desc，父级需显式声明。例如：{"key":"data","desc":"返回体","type":"object"},{"key":"data.user","desc":"用户","type":"object"},{"key":"data.user.id","desc":"用户ID","type":"integer","example":1}',
        inputSchema: {
            type: 'object',
            properties: {
                method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: 'HTTP方法' },
                url: { type: 'string', description: '接口URL路径' },
                name: { type: 'string', description: '接口名称' },
                parent_id: { type: 'string', description: '父目录ID，使用"0"表示根目录，默认为"0"' },
                description: { type: 'string', description: '接口详细描述（可选）' },
                headers: { type: 'string', description: 'Headers字段列表字符串，格式：[{"key":"X-Request-ID","type":"string","required":false,"example":"req-1","desc":"说明"}]' },
                query: { type: 'string', description: 'Query字段列表字符串，格式同上。嵌套用 .，数组用 []（如 meta.flags.debug 或 items[].id）。' },
                body: { type: 'string', description: 'Body字段列表字符串，仅用字段列表生成 raw/参数描述，example 用真实值，不要放 JSON 字符串。' },
                cookies: { type: 'string', description: 'Cookies字段列表字符串，格式同上。' },
                auth: { type: 'string', description: '认证配置JSON字符串（可选）。格式：{"type":"bearer","bearer":{"key":"your_token"}}' },
                responses: { type: 'string', description: '响应字段列表字符串（必填 fields），格式：[{"name":"成功","status":200,"fields":[{"key":"code","type":"integer","example":0,"desc":"状态码"},{"key":"data.items[].id","type":"string","example":"1"}]}]' },
                validate_only: { type: 'boolean', description: '仅执行预校验不保存，返回校验报告（可选，默认false）。建议先用此模式检查数据格式' },
                skip_validation: { type: 'boolean', description: '跳过预校验强制保存（可选，默认false）。数据有错误时默认会阻断保存' }
            },
            required: ['method', 'url', 'name'],
            additionalProperties: false
        }
    },
    {
        name: 'apipost_list',
        description: '查看项目API列表，支持强化的目录层级搜索和父子关系定位',
        inputSchema: {
            type: 'object',
            properties: {
                search: { type: 'string', description: '搜索关键词（接口名称、URL、方法、ID、描述）' },
                parent_id: { type: 'string', description: '父目录ID，精确查找某个目录下的子项目。使用"0"查看根目录，使用具体ID查看子目录' },
                target_type: { type: 'string', enum: ['api', 'folder', 'all'], description: '项目类型筛选：api(仅接口)、folder(仅目录)、all(全部)，默认all' },
                show_structure: { type: 'boolean', description: '是否显示层级结构（树形展示），默认false为列表模式' },
                show_path: { type: 'boolean', description: '是否显示完整路径（从根目录到当前项目的完整路径），默认false' },
                recursive: { type: 'boolean', description: '是否递归搜索子目录（搜索指定目录及其所有子目录），默认false仅搜索当前层级' },
                depth: { type: 'number', description: '层级深度限制（配合recursive使用，限制搜索深度），默认无限制' },
                group_by_folder: { type: 'boolean', description: '是否按目录分组显示结果，默认false' },
                limit: { type: 'number', description: '显示数量限制（默认50，最大200）' },
                show_all: { type: 'boolean', description: '显示全部项目（忽略limit限制）' }
            }
        }
    },
    {
        name: 'apipost_update',
        description: '修改API接口文档。规则同创建：responses 只用 fields（必填），不要传 data；headers/query/body/cookies 统一用字段列表，嵌套用 .，数组用 []，example 填真实值；所有字段含父级必须写 desc，父级需显式声明。例如：{"key":"data","desc":"返回体","type":"object"},{"key":"data.user","desc":"用户","type":"object"},{"key":"data.user.id","desc":"用户ID","type":"integer","example":1}',
        inputSchema: {
            type: 'object',
            properties: {
                target_id: { type: 'string', description: '要修改的接口ID' },
                name: { type: 'string', description: '新的接口名称（可选）' },
                method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: '新的HTTP方法（可选）' },
                url: { type: 'string', description: '新的接口URL（可选）' },
                description: { type: 'string', description: '接口详细描述（可选）。提供空字符串""可清空描述' },
                headers: { type: 'string', description: 'Headers参数JSON数组字符串（可选）。提供"[]"可删除所有headers。格式：[{"key":"Content-Type","desc":"内容类型","type":"string","required":true,"example":"application/json"}]' },
                query: { type: 'string', description: 'Query参数JSON数组字符串（可选）。提供"[]"可删除所有query参数。格式：[{"key":"page","desc":"页码","type":"integer","required":false,"example":"1"}]' },
                body: { type: 'string', description: 'Body参数JSON数组字符串（可选）。提供"[]"可删除所有body参数。格式：[{"key":"name","desc":"用户名","type":"string","required":true,"example":"张三"}]' },
                cookies: { type: 'string', description: 'Cookies参数JSON数组字符串（可选）。提供"[]"可删除所有cookies。格式：[{"key":"session_id","desc":"会话ID","type":"string","required":false,"example":"abc123"}]' },
                auth: { type: 'string', description: '认证配置JSON字符串（可选）。提供"{}"可删除认证配置。格式：{"type":"bearer","bearer":{"key":"your_token"}}' },
                responses: { type: 'string', description: '响应示例JSON数组字符串（可选）。提供"[]"可删除所有响应示例。格式：[{"name":"成功响应","status":200,"fields":[{"key":"code","desc":"状态码","type":"integer","example":"0"}]}]' },
                skip_validation: { type: 'boolean', description: '跳过预校验强制更新（可选，默认false）。本次提供的字段有错误时默认会阻断更新' }
            },
            required: ['target_id'],
            additionalProperties: false
        }
    },
    {
        name: 'apipost_detail',
        description: '查看API接口的详细配置信息，包括完整的请求参数、响应格式、认证设置等。',
        inputSchema: {
            type: 'object',
            properties: {
                target_id: { type: 'string', description: '要查看的接口ID' }
            },
            required: ['target_id'],
            additionalProperties: false
        }
    },
    {
        name: 'apipost_delete',
        description: '批量删除API接口文档，支持单个或多个接口删除。删除前先用apipost_list查看接口列表获取ID',
        inputSchema: {
            type: 'object',
            properties: {
                api_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'API接口ID数组（可从列表中获取target_id）- 支持单个["id1"]或多个["id1","id2","id3"]'
                }
            },
            required: ['api_ids']
        }
    },
    {
        name: 'apipost_schema_to_types',
        description: '根据接口ID获取API详情，将响应的JSON Schema转换为TypeScript类型定义和JSDoc注释',
        inputSchema: {
            type: 'object',
            properties: {
                target_id: { type: 'string', description: '接口ID' },
                output_ts: { type: 'boolean', description: '是否输出TypeScript类型定义，默认true' },
                output_jsdoc: { type: 'boolean', description: '是否输出JSDoc注释，默认false' }
            },
            required: ['target_id'],
            additionalProperties: false
        }
    }
];
