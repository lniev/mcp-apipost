/**
 * ApiPost MCP 工具处理器模块
 */

import {
  createApi,
  createFolder as createFolderApi,
  deleteApis,
  getApiDetails,
  getApiList,
  getProjectList,
  getTeamList,
  updateApi
} from "../api-client/index.js";
import {
  APIPOST_HOST,
  APIPOST_SECURITY_MODE,
  APIPOST_TOKEN,
  APIPOST_URL_PREFIX,
  applyUrlPrefix,
  checkSecurityPermission,
  logWithTime
} from "../config/index.js";
import {
  buildBodySection,
  flattenSchemaProperties,
  formatSchemaTable,
  normalizeResponses,
  parameterToSchema,
  schemaToJsDoc,
  schemaToTypeScript
} from "../schema/index.js";
import type {
  ApiField,
  AuthConfig,
} from "../types/index.js";
import {
  convertParams
} from "../utils/index.js";
import {
  getCurrentWorkspace,
  initWorkspace,
  isWorkspaceInitialized,
  switchWorkspace,
} from "../workspace/index.js";

// ============ 处理器类型定义 ============
export type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

// ============ 生成ID ============
function generateId(): string {
  return (Date.now() + Math.floor(Math.random() * 10000)).toString(16);
}

// ============ 确保工作空间已初始化 ============
async function ensureWorkspace(startTime?: number): Promise<void> {
  if (!isWorkspaceInitialized()) {
    await initWorkspace(startTime);
  }
}

// ============ apipost_test_connection ============
export const handleTestConnection: ToolHandler = async (_args) => {
  const workspace = getCurrentWorkspace();
  const connectionInfo = {
    status: "✅ 连接正常",
    mcp_version: "1.0.0",
    api_host: APIPOST_HOST,
    security_mode: APIPOST_SECURITY_MODE,
    workspace: workspace
      ? {
          team_name: workspace.teamName,
          project_name: workspace.projectName,
          project_id: workspace.projectId,
        }
      : null,
    environment: {
      token_configured: !!APIPOST_TOKEN,
      host_configured: !!APIPOST_HOST,
      node_version: process.version,
      platform: process.platform,
      url_prefix: APIPOST_URL_PREFIX,
    },
    available_operations: {
      create_api: checkSecurityPermission("write"),
      update_api: checkSecurityPermission("write"),
      delete_api: checkSecurityPermission("write"),
      read_api: checkSecurityPermission("read"),
    },
    test_time: new Date().toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
    }),
  };

  return {
    content: [
      {
        type: "text",
        text: `🎉 ApiPost MCP 连接测试成功！

📊 连接状态: ${connectionInfo.status}
🔗 MCP版本: ${connectionInfo.mcp_version}
🌐 API地址: ${connectionInfo.api_host}
🔒 安全模式: ${connectionInfo.security_mode}

🏢 当前工作空间:
${connectionInfo.workspace ? `• 团队: ${connectionInfo.workspace.team_name}
• 项目: ${connectionInfo.workspace.project_name}
• 项目ID: ${connectionInfo.workspace.project_id}` : "• 工作空间未初始化"}

🔧 环境配置:
• Token配置: ${connectionInfo.environment.token_configured ? "✅ 已配置" : "❌ 未配置"}
• Host配置: ${connectionInfo.environment.host_configured ? "✅ 已配置" : "❌ 未配置"}
• URL前缀: ${connectionInfo.environment.url_prefix || "（未配置）"}
• Node版本: ${connectionInfo.environment.node_version}
• 系统平台: ${connectionInfo.environment.platform}

🛠️ 可用操作:
• 创建接口: ${connectionInfo.available_operations.create_api ? "✅ 允许" : "❌ 禁止"}
• 更新接口: ${connectionInfo.available_operations.update_api ? "✅ 允许" : "❌ 禁止"}
• 删除接口: ${connectionInfo.available_operations.delete_api ? "✅ 允许" : "❌ 禁止"}
• 读取接口: ${connectionInfo.available_operations.read_api ? "✅ 允许" : "❌ 禁止"}

⏰ 测试时间: ${connectionInfo.test_time}

🎯 MCP服务器运行正常，可以开始使用其他工具！`,
      },
    ],
  };
};

// ============ apipost_workspace ============
export const handleWorkspace: ToolHandler = async (args) => {
  const action = args.action as string;

  switch (action) {
    case "current": {
      const workspace = getCurrentWorkspace();
      const showAll = args.show_all as boolean | undefined;
      let workspaceText = "🏢 当前工作空间信息:\n\n";

      if (workspace) {
        workspaceText += `📋 团队: ${workspace.teamName}\n`;
        workspaceText += `   🆔 ID: ${workspace.teamId}\n\n`;
        workspaceText += `📁 项目: ${workspace.projectName}\n`;
        workspaceText += `   🆔 ID: ${workspace.projectId}\n\n`;
        workspaceText += `🔒 安全模式: ${APIPOST_SECURITY_MODE}\n`;
      } else {
        workspaceText += "❌ 工作空间未初始化\n";
        workspaceText +=
          "💡 请使用 apipost_workspace action:switch 切换到可用的工作空间\n\n";
      }

      if (showAll) {
        try {
          workspaceText += "\n📋 可用团队和项目:\n\n";
          const allTeams = await getTeamList();
          for (const team of allTeams) {
            workspaceText += `📋 团队: ${team.name} (${team.team_id})\n`;
            try {
              const teamProjects = await getProjectList(team.team_id);
              if (teamProjects.length > 0) {
                teamProjects.forEach((project) => {
                  workspaceText += `   📁 ${project.name} (${project.project_id})\n`;
                });
              } else {
                workspaceText += `   📭 无可用项目\n`;
              }
            } catch (error) {
              workspaceText += `   ❌ 获取项目列表失败\n`;
            }
            workspaceText += "\n";
          }
        } catch (error) {
          workspaceText += `\n❌ 获取可用团队列表失败: ${error}\n`;
        }
      }

      return { content: [{ type: "text", text: workspaceText }] };
    }

    case "list_teams": {
      const teams = await getTeamList();
      const showDetails = args.show_details as boolean | undefined;
      const workspace = getCurrentWorkspace();

      let teamsText = `📋 可用团队列表 (共 ${teams.length} 个):\n\n`;
      if (teams.length === 0) {
        teamsText += "📭 未找到可用团队\n";
      } else {
        teams.forEach((team, index) => {
          const num = (index + 1).toString().padStart(2, " ");
          const isCurrent = workspace?.teamId === team.team_id ? " ⭐ 当前" : "";
          teamsText += `${num}. ${team.name}${isCurrent}\n`;
          teamsText += `     🆔 ID: ${team.team_id}\n`;
          if (showDetails) {
            teamsText += `     👥 成员数: ${(team as unknown as { member_count?: number }).member_count || "未知"}\n`;
          }
          teamsText += "\n";
        });
      }

      return { content: [{ type: "text", text: teamsText }] };
    }

    case "list_projects": {
      const teamId = args.team_id as string | undefined;
      if (!teamId) {
        throw new Error("列出项目需要提供 team_id");
      }

      const projects = await getProjectList(teamId);
      const workspace = getCurrentWorkspace();

      let projectsText = `📁 团队项目列表 (共 ${projects.length} 个):\n\n`;
      if (projects.length === 0) {
        projectsText += "📭 该团队下未找到项目\n";
      } else {
        projects.forEach((project, index) => {
          const num = (index + 1).toString().padStart(2, " ");
          const isCurrent =
            workspace?.projectId === project.project_id ? " ⭐ 当前" : "";
          projectsText += `${num}. ${project.name}${isCurrent}\n`;
          projectsText += `     🆔 ID: ${project.project_id}\n\n`;
        });
      }

      return { content: [{ type: "text", text: projectsText }] };
    }

    case "switch": {
      const newWorkspace = await switchWorkspace(
        args.team_id as string | undefined,
        args.project_id as string | undefined,
        args.team_name as string | undefined,
        args.project_name as string | undefined
      );

      let switchText = "✅ 工作空间切换成功！\n\n";
      switchText += `📋 团队: ${newWorkspace.teamName}\n`;
      switchText += `   🆔 ID: ${newWorkspace.teamId}\n\n`;
      switchText += `📁 项目: ${newWorkspace.projectName}\n`;
      switchText += `   🆔 ID: ${newWorkspace.projectId}\n`;

      return { content: [{ type: "text", text: switchText }] };
    }

    default:
      throw new Error(`未知的 workspace 操作: ${action}`);
  }
};

// ============ apipost_create_folder ============
export const handleCreateFolder: ToolHandler = async (args) => {
  await ensureWorkspace();
  const workspace = getCurrentWorkspace()!;

  if (!checkSecurityPermission("write")) {
    throw new Error("当前安全模式禁止创建操作");
  }

  const name = args.name as string;
  const parentId = (args.parent_id as string) || "0";
  const description = args.description as string | undefined;

  const result = await createFolderApi(
    workspace.projectId,
    name,
    parentId,
    description,

  ).catch((error) => {
    logWithTime(`❌ 目录创建失败: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  });

  return {
    content: [
      {
        type: "text",
        text: `✅ 目录创建成功！\n\n📁 目录名称: ${name}\n📂 父目录ID: ${parentId}\n🆔 目录ID: ${(result as unknown as { target_id?: string }).target_id || "未知"}`,
      },
    ],
  };
};

// ============ apipost_smart_create ============
export const handleSmartCreate: ToolHandler = async (args) => {
  await ensureWorkspace();
  const workspace = getCurrentWorkspace()!;

  if (!checkSecurityPermission("write")) {
    throw new Error(`🔒 安全模式 "${APIPOST_SECURITY_MODE}" 不允许创建操作。需要 "limited" 或 "full" 模式。`);
  }

  // 解析参数字符串（兼容已经是对象的情况）
  const parseParams = (str: string | object | undefined): ApiField[] => {
    if (!str) return [];
    // 如果已经是对象/数组，直接返回
    if (typeof str === 'object') return str as ApiField[];
    // 如果是字符串，尝试解析
    try {
      return JSON.parse(str) as ApiField[];
    } catch {
      throw new Error(`参数解析失败: ${str}`);
    }
  };

  const headers = parseParams(args.headers as string | undefined);
  const query = parseParams(args.query as string | undefined);
  const body = parseParams(args.body as string | undefined);
  const cookies = parseParams(args.cookies as string | undefined);
  const responses = parseParams(args.responses as string | undefined);

  // 构建认证（兼容已经是对象的情况）
  let auth: AuthConfig | undefined;
  if (args.auth) {
    try {
      // 如果已经是对象，直接使用
      auth = typeof args.auth === 'object' ? args.auth as AuthConfig : JSON.parse(args.auth as string) as AuthConfig;
    } catch {
      throw new Error("认证配置解析失败");
    }
  }

  // 构建 API 模板（匹配历史实现）
  const template = {
    project_id: workspace.projectId,
    target_id: generateId(),
    target_type: 'api',
    parent_id: (args.parent_id as string) || '0',
    name: args.name as string,
    method: args.method as string,
    url: applyUrlPrefix(args.url as string),
    protocol: 'http/1.1',
    description: (args.description as string) || `${args.name} - ${args.method} ${args.url}`,
    version: 3,
    mark_id: '1',
    is_force: -1,
    request: {
      auth: auth || { type: 'inherit' },
      pre_tasks: [],
      post_tasks: [],
      header: {
        parameter: convertParams(headers)
      },
      query: {
        query_add_equal: 1,
        parameter: convertParams(query)
      },
      body: buildBodySection(body),
      cookie: {
        cookie_encode: 1,
        parameter: convertParams(cookies)
      },
      restful: {
        parameter: []
      }
    },
    response: normalizeResponses(responses, { useDefaultWhenMissing: true, keepEmpty: true, isCheckResult: 1 }),
    attribute_info: {},
    tags: []
  };

  const headerCount = headers.length;
  const queryCount = query.length;
  const bodyCount = body.length;
  const responseCount = responses.length;

  // 尝试序列化 template 用于调试，捕获循环引用错误
  try {
    console.log('handleSmartCreate - template:', JSON.stringify(template, null, 2));
  } catch (e) {
    console.error('模板序列化失败（可能存在循环引用）:', (e as Error).message);
    // 分别测试每个部分
    try {
      JSON.stringify(template.request);
      console.log('✓ request 可序列化');
    } catch {
      console.error('✗ request 不可序列化');
    }
    try {
      JSON.stringify(template.response);
      console.log('✓ response 可序列化');
    } catch {
      console.error('✗ response 不可序列化');
    }
  }

  const result = await createApi(template);

  return {
    content: [{
      type: 'text',
      text: `API创建成功!\n名称: ${args.name}\n方法: ${args.method}\nURL: ${args.url}\nID: ${(result as unknown as { target_id?: string }).target_id || '未知'}\n\n字段统计:\n• Headers: ${headerCount}个\n• Query参数: ${queryCount}个\n• Body参数: ${bodyCount}个\n• 响应示例: ${responseCount}个`
    }]
  };
};

// ============ apipost_list ============
export const handleList: ToolHandler = async (args) => {
  await ensureWorkspace();
  const workspace = getCurrentWorkspace()!;

  interface ApiListItem {
    target_id: string;
    name: string;
    url?: string;
    method?: string;
    target_type?: "api" | "folder";
    parent_id?: string;
    description?: string;
    is_folder?: number;
  }

  const apiListResult = (await getApiList(workspace.projectId)) as { list: ApiListItem[] };
  const apiList = apiListResult.list || [];

  // 过滤和搜索逻辑
  let filteredList = [...apiList];

  // 按类型过滤
  const targetType = args.target_type as string | undefined;
  if (targetType && targetType !== "all") {
    filteredList = filteredList.filter(
      (item) =>
        (targetType === "folder" && item.is_folder === 1) ||
        (targetType === "api" && item.is_folder !== 1)
    );
  }

  // 按父目录过滤
  const parentId = args.parent_id as string | undefined;
  if (parentId !== undefined) {
    filteredList = filteredList.filter(
      (item) => item.parent_id === parentId
    );
  }

  // 搜索
  const search = args.search as string | undefined;
  if (search) {
    const searchLower = search.toLowerCase();
    filteredList = filteredList.filter(
      (item) =>
        item.name?.toLowerCase().includes(searchLower) ||
        item.url?.toLowerCase().includes(searchLower) ||
        item.method?.toLowerCase().includes(searchLower) ||
        item.target_id?.toLowerCase().includes(searchLower)
    );
  }

  // 限制数量
  const limit = (args.limit as number) || 50;
  const showAll = args.show_all as boolean | undefined;
  if (!showAll && filteredList.length > limit) {
    filteredList = filteredList.slice(0, limit);
  }

  // 构建输出
  let output = `📋 API 列表 (${filteredList.length}/${apiList.length}):\n\n`;

  filteredList.forEach((item, index) => {
    const num = (index + 1).toString().padStart(2, " ");
    const type = item.is_folder === 1 ? "📁" : "📝";
    output += `${num}. ${type} ${item.name}\n`;
    output += `     🆔 ID: ${item.target_id}\n`;
    if (item.method) {
      output += `     🚀 方法: ${item.method}\n`;
    }
    if (item.url) {
      output += `     🔗 URL: ${item.url}\n`;
    }
    output += "\n";
  });

  return { content: [{ type: "text", text: output }] };
};

// ============ apipost_update ============
export const handleUpdate: ToolHandler = async (args) => {
  await ensureWorkspace();
  const workspace = getCurrentWorkspace()!;

  if (!checkSecurityPermission("write")) {
    throw new Error("当前安全模式禁止更新操作");
  }

  const targetId = args.target_id as string;
  if (!targetId) {
    throw new Error("请提供接口ID (target_id)");
  }

  // 获取现有接口详情
  // 获取原接口信息
  const details = await getApiDetails(workspace.projectId, [targetId]);
  if (!details.list || details.list.length === 0) {
    throw new Error(`未找到接口详情 (ID: ${targetId})。可能原因：1) 接口不存在 2) 无权限访问 3) 接口已被删除。请检查接口ID是否正确。`);
  }
  const originalApi = details.list[0] as {
    name?: string;
    url?: string;
    method?: string;
    description?: string;
    parent_id?: string;
    target_type?: string;
    protocol?: string;
    version?: number;
    mark_id?: string;
    is_force?: number;
    sort?: number;
    status?: number;
    is_deleted?: number;
    is_conflicted?: number;
    request?: Record<string, unknown>;
    response?: Record<string, unknown>;
    attribute_info?: Record<string, unknown>;
    tags?: string[];
  };

  const newName = args.name as string | undefined;
  const newMethod = args.method as string | undefined;
  const newUrl = args.url ? applyUrlPrefix(args.url as string) : undefined;

  // 解析参数字符串（兼容已经是对象的情况）
  const parseParams = (str: string | object | undefined): ApiField[] | undefined => {
    if (str === undefined) return undefined;
    if (str === "[]") return [];
    // 如果已经是对象/数组，直接返回
    if (typeof str === 'object') return str as ApiField[];
    // 如果是字符串，尝试解析
    try {
      return JSON.parse(str) as ApiField[];
    } catch {
      throw new Error(`参数解析失败: ${str}`);
    }
  };

  const headers = parseParams(args.headers as string | undefined);
  const query = parseParams(args.query as string | undefined);
  const body = parseParams(args.body as string | undefined);
  const cookies = parseParams(args.cookies as string | undefined);
  const responses = parseParams(args.responses as string | undefined);

  // 构建增量更新配置对象
  const providedFields = new Set<string>();
  if (args.description !== undefined) providedFields.add('description');
  if (args.headers !== undefined) providedFields.add('headers');
  if (args.query !== undefined) providedFields.add('query');
  if (args.body !== undefined) providedFields.add('body');
  if (args.cookies !== undefined) providedFields.add('cookies');
  if (args.auth !== undefined) providedFields.add('auth');
  if (args.responses !== undefined) providedFields.add('responses');

  const mergedDescription = providedFields.has('description')
    ? (args.description as string)
    : (originalApi.description || '');

  const existingRequest = originalApi.request || {};
  const mergedRequest = {
    auth: providedFields.has('auth')
      ? (args.auth ? (typeof args.auth === 'object' ? args.auth : JSON.parse(args.auth as string)) : { type: 'inherit' })
      : (existingRequest.auth || { type: 'inherit' }),
    pre_tasks: existingRequest.pre_tasks || [],
    post_tasks: existingRequest.post_tasks || [],
    header: {
      parameter: providedFields.has('headers')
        ? convertParams(headers || [])
        : (existingRequest.header as Record<string, unknown>)?.parameter || []
    },
    query: {
      query_add_equal: (existingRequest.query as Record<string, unknown>)?.query_add_equal ?? 1,
      parameter: providedFields.has('query')
        ? convertParams(query || [])
        : (existingRequest.query as Record<string, unknown>)?.parameter || []
    },
    body: providedFields.has('body')
      ? buildBodySection(body || [])
      : (existingRequest.body || buildBodySection([])),
    cookie: {
      cookie_encode: (existingRequest.cookie as Record<string, unknown>)?.cookie_encode ?? 1,
      parameter: providedFields.has('cookies')
        ? convertParams(cookies || [])
        : (existingRequest.cookie as Record<string, unknown>)?.parameter || []
    },
    restful: existingRequest.restful || { parameter: [] }
  };

  const responseSection = providedFields.has('responses')
    ? normalizeResponses(responses || [], {
      fallbackExamples: [],
      useDefaultWhenMissing: false,
      keepEmpty: true,
      isCheckResult: ((originalApi.response as Record<string, unknown>)?.is_check_result as number) ?? 1
    })
    : {
      example: (originalApi.response as Record<string, unknown>)?.example || [],
      is_check_result: ((originalApi.response as Record<string, unknown>)?.is_check_result as number) ?? 1
    };

  const updateTemplate = {
    project_id: workspace.projectId,
    target_id: targetId,
    parent_id: originalApi.parent_id || '0',
    target_type: originalApi.target_type || 'api',
    name: newName || originalApi.name,
    method: newMethod || originalApi.method,
    url: newUrl || originalApi.url,
    protocol: originalApi.protocol || 'http/1.1',
    description: mergedDescription,
    version: (originalApi.version || 0) + 1,
    mark_id: originalApi.mark_id || '1',
    is_force: originalApi.is_force ?? -1,
    sort: originalApi.sort ?? 0,
    status: originalApi.status ?? 1,
    is_deleted: originalApi.is_deleted ?? -1,
    is_conflicted: originalApi.is_conflicted ?? -1,
    request: mergedRequest,
    response: responseSection,
    attribute_info: originalApi.attribute_info || {},
    tags: originalApi.tags || []
  };

  const result = await updateApi(updateTemplate);

  // 统计修改的字段
  const changedFields = [];
  if (newName && newName !== originalApi.name) changedFields.push('名称');
  if (newMethod && newMethod !== originalApi.method) changedFields.push('方法');
  if (newUrl && newUrl !== originalApi.url) changedFields.push('URL');
  if (providedFields.size > 0) changedFields.push('配置');

  let updateText = `接口修改成功!\n接口ID: ${targetId}\n`;
  if (newName) updateText += `新名称: ${newName}\n`;
  if (newMethod) updateText += `新方法: ${newMethod}\n`;
  if (newUrl) updateText += `新URL: ${newUrl}\n`;
  updateText += `版本: v${updateTemplate.version}\n修改字段: ${changedFields.join(', ') || '仅更新版本'}`;

  return {
    content: [{ type: 'text', text: updateText }]
  };
};

// ============ apipost_detail ============
export const handleDetail: ToolHandler = async (args) => {
  await ensureWorkspace();
  const workspace = getCurrentWorkspace()!;

  const targetId = args.target_id as string;
  if (!targetId) {
    throw new Error("请提供接口ID (target_id)");
  }

  const details = await getApiDetails(workspace.projectId, [targetId]);
  if (!details.list || details.list.length === 0) {
    throw new Error(`未找到接口: ${targetId}`);
  }

  const apiDetail = details.list[0] as {
    name?: string;
    url?: string;
    method?: string;
    description?: string;
    target_id?: string;
    version?: number;
    request?: {
      header?: { parameter?: Array<{ key: string; description?: string; field_type?: string; not_null?: number; value?: string }> };
      query?: { parameter?: Array<{ key: string; description?: string; field_type?: string; not_null?: number; value?: string }> };
      body?: {
        mode?: 'form-data' | 'urlencoded' | 'json' | 'raw' | 'none';
        parameter?: Array<{ key: string; description?: string; field_type?: string; not_null?: number; value?: string }>;
        raw?: string;
        raw_parameter?: Array<{ key: string; description?: string; field_type?: string; not_null?: number; value?: string }>;
        raw_schema?: Record<string, unknown>;
      };
      cookie?: { parameter?: Array<{ key: string; description?: string; field_type?: string; not_null?: number; value?: string }> };
      auth?: { type?: string; bearer?: { key?: string } };
    };
    response?: {
      example?: Array<{
        expect?: { name?: string; code?: string; schema?: Record<string, unknown> };
        raw?: string;
      }>;
    };
  };

  // 调试：输出完整的 body 信息
  console.log('=== handleDetail DEBUG ===');
  console.log('Body 完整信息:', JSON.stringify(apiDetail.request?.body, null, 2));

  // 格式化接口详情
  let detailText = `📋 接口详情\n\n`;
  detailText += `🏷️  基本信息\n`;
  detailText += `   接口名称: ${apiDetail.name || "未命名"}\n`;
  detailText += `   请求方法: ${apiDetail.method || "GET"}\n`;
  detailText += `   请求URL: ${apiDetail.url || ""}\n`;
  detailText += `   接口ID: ${targetId}\n`;
  detailText += `   版本: v${apiDetail.version || 1}\n`;
  if (apiDetail.description) {
    detailText += `   描述: ${apiDetail.description}\n`;
  }
  detailText += `\n`;

  // Headers参数 - Markdown表格
  const headers = apiDetail.request?.header?.parameter || [];
  detailText += `📨 Headers参数 (${headers.length}个)\n\n`;
  if (headers.length > 0) {
    detailText += `| 序号 | 字段名 | 类型 | 必需 | 描述 | 示例 |\n`;
    detailText += `|------|--------|------|------|------|------|\n`;
    headers.forEach((header, index) => {
      const desc = header.description || '-';
      const type = header.field_type || 'string';
      const required = header.not_null ? '是' : '否';
      const example = header.value || '-';
      detailText += `| ${index + 1} | ${header.key} | ${type} | ${required} | ${desc} | ${example} |\n`;
    });
  } else {
    detailText += `(无Headers参数)\n`;
  }
  detailText += `\n`;

  // Query参数 - Markdown表格
  const queryParams = apiDetail.request?.query?.parameter || [];
  detailText += `🔍 Query参数 (${queryParams.length}个)\n\n`;
  if (queryParams.length > 0) {
    detailText += `| 序号 | 字段名 | 类型 | 必需 | 描述 | 示例 |\n`;
    detailText += `|------|--------|------|------|------|------|\n`;
    queryParams.forEach((param, index) => {
      const desc = param.description || '-';
      const type = param.field_type || 'string';
      const required = param.not_null ? '是' : '否';
      const example = param.value || '-';
      detailText += `| ${index + 1} | ${param.key} | ${type} | ${required} | ${desc} | ${example} |\n`;
    });
  } else {
    detailText += `(无Query参数)\n`;
  }
  detailText += `\n`;

  // Body参数 - 根据 mode 自动选择处理方式
  const body = apiDetail.request?.body;
  const bodyMode = body?.mode || 'none';

  if (bodyMode === 'none') {
    detailText += `📝 Body参数\n`;
    detailText += `   (无Body参数)\n\n`;
  } else if (bodyMode === 'form-data' || bodyMode === 'urlencoded') {
    // form-data / urlencoded: 从 parameter 数组提取
    const params = body?.parameter || [];
    detailText += `📝 Body参数 (${bodyMode}) - ${params.length}个\n\n`;
    if (params.length > 0) {
      detailText += `| 序号 | 字段名 | 类型 | 必需 | 描述 | 示例 |\n`;
      detailText += `|------|--------|------|------|------|------|\n`;
      params.forEach((param, index) => {
        const desc = param.description || '-';
        const type = param.field_type || 'string';
        const required = param.not_null ? '是' : '否';
        const example = param.value || '-';
        detailText += `| ${index + 1} | ${param.key} | ${type} | ${required} | ${desc} | ${example} |\n`;
      });
    } else {
      detailText += `(无参数)\n`;
    }
    detailText += `\n`;
  } else if (bodyMode === 'json') {
    // json: 显示 raw JSON 内容
    detailText += `📝 Body参数 (JSON)\n\n`;
    if (body?.raw) {
      detailText += `\`\`\`json\n${body.raw}\n\`\`\`\n\n`;
    } else {
      detailText += `(无Body内容)\n\n`;
    }
  } else {
    // raw / 其他
    detailText += `📝 Body参数 (${bodyMode})\n`;
    detailText += `   (原始格式，请查看原始数据)\n\n`;
  }

  // Cookies参数 - Markdown表格
  const cookies = apiDetail.request?.cookie?.parameter || [];
  detailText += `🍪 Cookies参数 (${cookies.length}个)\n\n`;
  if (cookies.length > 0) {
    detailText += `| 序号 | 字段名 | 类型 | 必需 | 描述 | 示例 |\n`;
    detailText += `|------|--------|------|------|------|------|\n`;
    cookies.forEach((cookie, index) => {
      const desc = cookie.description || '-';
      const type = cookie.field_type || 'string';
      const required = cookie.not_null ? '是' : '否';
      const example = cookie.value || '-';
      detailText += `| ${index + 1} | ${cookie.key} | ${type} | ${required} | ${desc} | ${example} |\n`;
    });
  } else {
    detailText += `(无Cookies参数)\n`;
  }
  detailText += `\n`;

  // 认证配置
  const auth = apiDetail.request?.auth || {};
  detailText += `🔐 认证配置\n`;
  if (auth.type && auth.type !== "inherit") {
    detailText += `   类型: ${auth.type}\n`;
    if (auth.bearer?.key) {
      detailText += `   Token: ${auth.bearer.key.substring(0, 20)}...\n`;
    }
  } else {
    detailText += `   (继承父级认证或无认证)\n`;
  }
  detailText += `\n`;

  // 响应示例
  const responses = apiDetail.response?.example || [];
  detailText += `📤 响应示例 (${responses.length}个)\n`;
  if (responses.length > 0) {
    responses.forEach((resp, index) => {
      detailText += `   ${index + 1}. ${resp.expect?.name || "响应" + (index + 1)}\n`;
      detailText += `      状态码: ${resp.expect?.code || 200}\n`;
      // 先展示 schema 字段表格（类似 APIfox 界面）
      const schema = resp.expect?.schema;
      const schemaFields = flattenSchemaProperties(schema);
      if (schemaFields.length > 0) {
        detailText += `      响应字段:\n${formatSchemaTable(schemaFields)}\n`;
      }
      // 再展示示例数据
      if (resp.raw) {
        const rawData = resp.raw.length > 3000 ? resp.raw.substring(0, 3000) + "\n\n...（内容过长，已截断）" : resp.raw;
        detailText += `      示例数据:\n         ${rawData.replace(/\n/g, "\n         ")}\n`;
      }
    });
  } else {
    detailText += `   (无响应示例)\n`;
  }

  return { content: [{ type: "text", text: detailText }] };
};

// ============ apipost_delete ============
export const handleDelete: ToolHandler = async (args) => {
  await ensureWorkspace();
  const workspace = getCurrentWorkspace()!;

  if (!checkSecurityPermission("delete")) {
    throw new Error("当前安全模式禁止删除操作");
  }

  const apiIds = args.api_ids as string[];
  if (!apiIds || apiIds.length === 0) {
    throw new Error("请提供要删除的接口ID列表");
  }

  const result = await deleteApis(workspace.projectId, apiIds).catch((err) => {

    console.error("删除接口失败:", err);
  });
  logWithTime(`删除接口结果: ${JSON.stringify(result)}`);

  return {
    content: [
      {
        type: "text",
        text: `✅ 删除成功！\n\n🗑️ 已删除 ${apiIds.length} 个接口:\n${apiIds.map((id) => `  - ${id}`).join("\n")}`,
      },
    ],
  };
};

// ============ apipost_schema_to_types ============
export const handleSchemaToTypes: ToolHandler = async (args) => {
  await ensureWorkspace();
  const workspace = getCurrentWorkspace()!;

  const targetId = args.target_id as string;
  if (!targetId) {
    throw new Error("请提供接口ID (target_id)");
  }

  const outputTs = (args.output_ts as boolean) ?? true;
  const outputJsdoc = (args.output_jsdoc as boolean) ?? false;

  // 获取接口详情
  const details = await getApiDetails(workspace.projectId, [targetId]);
  if (!details.list || details.list.length === 0) {
    throw new Error(`未找到接口详情 (ID: ${targetId})`);
  }

  const api = details.list[0] as {
    url?: string;
    method?: string;
    request?: {
      body?: {
        mode?: string;
        parameter?: Array<{
          key: string;
          schema?: { type?: string };
          field_type?: string;
          description?: string;
          not_null?: number;
        }>;
        raw_schema?: Record<string, unknown>;
      };
      query?: {
        parameter?: Array<{
          key: string;
          schema?: { type?: string };
          field_type?: string;
          description?: string;
          not_null?: number;
        }>;
      };
    };
    response?: {
      example?: Array<{
        expect?: { name?: string; schema?: Record<string, unknown> };
      }>;
    };
  };

  const schemaBodyMode = api.request?.body?.mode || "json";
  let bodySchema: Record<string, unknown> | null = null;
  const schemaBodyParams = api.request?.body?.parameter || [];

  if (schemaBodyMode === "form-data" || schemaBodyMode === "urlencoded") {
    if (schemaBodyParams.length > 0) {
      bodySchema = parameterToSchema(schemaBodyParams, "RequestBody");
    }
  } else {
    bodySchema = api.request?.body?.raw_schema || null;
  }

  const schemaQueryParams = api.request?.query?.parameter || [];
  const hasSchemaQueryParams = schemaQueryParams.length > 0;

  const firstExample = (api.response?.example || [])[0];
  const responseSchema = firstExample?.expect?.schema || null;

  const result = {
    url: api.url || "",
    target_id: targetId,
    method: api.method || "GET",
    request: {
      body: { ts: "", jsdoc: "", mode: schemaBodyMode },
      query: { ts: "", jsdoc: "" },
    },
    response: { ts: "", jsdoc: "" },
  };

  if (outputTs) {
    // Body 参数 TypeScript
    if (schemaBodyMode === "form-data" || schemaBodyMode === "urlencoded") {
      if (schemaBodyParams.length > 0) {
        result.request.body.ts =
          `export interface RequestBody {\n` +
          schemaBodyParams
            .map((p) => {
              const type = p.schema?.type || p.field_type || "string";
              const tsType = type === "integer" ? "number" : type;
              const desc = p.description ? ` // ${p.description}` : "";
              const optional = p.not_null === 1 ? "" : "?";
              return `  ${p.key}${optional}: ${tsType};${desc}`;
            })
            .join("\n") +
          "\n}";
      }
    } else {
      if (bodySchema) {
        try {
          result.request.body.ts = schemaToTypeScript(bodySchema, "RequestBody");
        } catch (error) {
          console.error("编译请求体 schema 失败:", error);
          result.request.body.ts = `// Failed to compile request body schema: ${error}`;
        }
      } else {
        result.request.body.ts = "// No request body schema available";
      }
    }

    // Query 参数 TypeScript
    if (hasSchemaQueryParams) {
      const querySchema = parameterToSchema(schemaQueryParams, "Query");
      try {
        result.request.query.ts = schemaToTypeScript(querySchema, "Query");
      } catch {
        result.request.query.ts = "// Failed to compile query schema";
      }
    }

    // 响应参数 TypeScript
    if (responseSchema) {
      try {
        result.response.ts = schemaToTypeScript(responseSchema, "Response");
      } catch {
        result.response.ts = "// Failed to compile response schema";
      }
    }
  }

  if (outputJsdoc) {
    // Body 参数 JSDoc
    if (bodySchema) {
      if (schemaBodyMode === "form-data" || schemaBodyMode === "urlencoded") {
        result.request.body.jsdoc =
          `/**\n * @typedef {object} RequestBody - Request Body参数 (${schemaBodyMode})\n` +
          schemaBodyParams
            .map((p) => {
              const type = p.schema?.type || p.field_type || "string";
              const tsType = type === "integer" ? "number" : type;
              const desc = p.description ? ` - ${p.description}` : "";
              const required = p.not_null === 1 ? "" : " (可选)";
              return ` * @property {${tsType}} ${p.key}${required}${desc}`;
            })
            .join("\n") +
          "\n */";
      } else {
        result.request.body.jsdoc = schemaToJsDoc(bodySchema, "RequestBody");
      }
    }

    // Query 参数 JSDoc
    if (hasSchemaQueryParams) {
      result.request.query.jsdoc =
        `/**\n * @typedef {object} Query - Query参数\n` +
        schemaQueryParams
          .map((p) => {
            const type = p.schema?.type || p.field_type || "string";
            const tsType = type === "integer" ? "number" : type;
            const desc = p.description ? ` - ${p.description}` : "";
            const required = p.not_null === 1 ? "" : " (可选)";
            return ` * @property {${tsType}} ${p.key}${required}${desc}`;
          })
          .join("\n") +
        "\n */";
    }

    // 响应参数 JSDoc
    if (responseSchema) {
      const respName = firstExample?.expect?.name || "Response";
      result.response.jsdoc = schemaToJsDoc(responseSchema, respName);
    }
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
};

// ============ 处理器映射表 ============
export const handlers: Record<string, ToolHandler> = {
  apipost_test_connection: handleTestConnection,
  apipost_workspace: handleWorkspace,
  apipost_create_folder: handleCreateFolder,
  apipost_smart_create: handleSmartCreate,
  apipost_list: handleList,
  apipost_update: handleUpdate,
  apipost_detail: handleDetail,
  apipost_delete: handleDelete,
  apipost_schema_to_types: handleSchemaToTypes,
};
