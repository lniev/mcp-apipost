# MCP-ApiPost

基于 MCP 协议和 [ApiPost 官方 OpenAPI](https://docs.apipost.net/docs/detail/2a37986cbc64000?target_id=23796913b176e1) 实现的 API 文档管理工具，支持 Claude Code、Codex、Cursor、Windsurf、Trae、Qoder 等主流 AI 编辑器一键接入。

## 功能

- **连接测试** - 验证 MCP 服务器状态和配置
- **工作空间管理** - 查看、切换团队和项目工作空间
- **API 接口管理** - 创建、查看、修改、删除接口文档
- **增量更新** - 支持字段级别的精确更新和删除
- **层级搜索** - 强化的目录层级搜索和父子关系定位
- **递归浏览** - 递归搜索子目录，支持深度限制
- **多维筛选** - 多维度搜索和批量操作
- **结构化显示** - 树形结构和分组显示
- **路径导航** - 完整路径显示，快速定位
- **权限管理** - 多种安全模式，灵活的操作权限控制
- **Schema 转类型** - 将接口 JSON Schema 转换为 TypeScript 类型定义和 JSDoc 注释
- **前端友好** - 一键获取接口定义并生成 TypeScript 类型，直接复用到项目请求代码中


## 前端快速开始

> 面向前端开发者的极简工作流：**浏览接口 → 生成 TS 类型 → 直接写请求代码**。

### 1. 浏览并定位接口

在 AI 编辑器中直接询问：

```
帮我列出 /user 相关的接口
```

MCP 会返回类似如下结果：

```text
[GET]    /api/v1/users/:id      - 获取用户详情   (api_abc123)
[POST]   /api/v1/users          - 创建用户       (api_def456)
[PUT]    /api/v1/users/:id      - 更新用户信息   (api_ghi789)
```

继续追问，查看具体接口详情：

```
查看 /api/v1/users/:id 这个接口的详情
```

### 2. 生成接口请求 TypeScript 代码

直接让 AI 根据接口生成请求函数：

```
为 /api/v1/users/:id 生成前端请求代码
```

通过 `apipost_schema_to_types` 工具，AI 会先拉取接口 Schema，然后生成完整的请求类型和调用代码：

```typescript
// types/user.ts
export interface GetUserParams {
  id: number;
}

export interface GetUserResponse {
  code: number;
  data: {
    id: number;
    name: string;
    email: string;
    createdAt: string;
  };
  message: string;
}

// api/user.ts
import request from '@/utils/request';

export function getUserById(params: GetUserParams) {
  return request.get<GetUserResponse>(`/api/v1/users/${params.id}`);
}
```

### 3. 在项目中直接使用

复制生成的代码到项目，无需再手动维护类型：

```typescript
import { getUserById } from '@/api/user';

async function init() {
  const { data } = await getUserById({ id: 1 });
  console.log(data.name); // 类型安全，有自动补全
}
```

无需手动对照接口文档维护类型，**一次生成，全程复用**，减少前后端沟通成本，提升开发效率。

## 使用流程

### 1. 下载

```bash
git clone https://github.com/lniev/apipost-mcp.git
cd apipost-mcp
```

### 2. 安装

#### 环境要求

| 环境 | 版本要求 | 说明 |
|------|---------|------|
| **Node.js** | >= 18.0.0 | JavaScript 运行环境（MCP SDK 官方最低要求） |
| **npm** | >= 8.0.0 | Node.js 包管理器（通常随 Node.js 一起安装） |

#### 环境安装指南

**Node.js 安装：**
- 访问 [Node.js 官网](https://nodejs.org/) 下载 LTS 版本
- 或使用包管理器：
  ```bash
  # macOS (使用 Homebrew)
  brew install node

  # Ubuntu/Debian
  sudo apt update && sudo apt install nodejs npm

  # CentOS/RHEL
  sudo yum install nodejs npm
  ```

**验证安装：**
```bash
node --version   # 应显示 v18.0.0 或更高版本
npm --version    # 应显示 8.0.0 或更高版本
```

#### 安装依赖并构建

```bash
npm install && npm run build
```

### 3. 配置环境变量

在项目根目录创建 `.env` 文件（已包含在 `.gitignore` 中，不会被提交到 Git）：

```bash
touch .env
```

编辑 `.env` 文件，添加所需的环境变量：

```env
APIPOST_TOKEN=your_access_token_here   // 这里换成自己的 token，如何获取token见下面说明
APIPOST_HOST=https://open.apipost.net  // 这里 如果私有化部署 换成私有的域名，不知道是啥的，分享一个接口的链接，填写链接host
APIPOST_SECURITY_MODE=limited
APIPOST_DEFAULT_TEAM_NAME=你的团队名称
APIPOST_DEFAULT_PROJECT_NAME=你的项目名称
APIPOST_URL_PREFIX={{host}}
APIPOST_INLINE_COMMENTS=true
```

**环境变量说明：**

| 变量名 | 是否必需 | 说明 |
|--------|------|------|
| `APIPOST_TOKEN` | 是 | API 访问令牌 |
| `APIPOST_SECURITY_MODE` | 否 | 安全模式：`readonly`, `limited`, `full` |
| `APIPOST_DEFAULT_TEAM_NAME` | 否 | 默认团队名称 |
| `APIPOST_DEFAULT_PROJECT_NAME` | 否 | 默认项目名称 |
| `APIPOST_URL_PREFIX` | 否 | 接口 URL 前缀，自动拼接到所有新建/修改的接口路径，如 `{{host}}` |
| `APIPOST_INLINE_COMMENTS` | 否 | 是否开启行内注释，设置为 `true` 时 raw 会按 `desc` 生成行内注释 |

#### 安全模式说明

| 模式 | 权限 | 说明 |
|------|------|------|
| `readonly` | 只读 | 仅允许查看接口列表和详情，禁止创建、修改、删除 |
| `limited` | 读写 | 允许查看、创建、修改接口，禁止删除操作 |
| `full` | 完全访问 | 允许所有操作，包括查看、创建、修改、删除 |

#### 获取 Token

1. [ApiPost OpenApi 官方文档查看](https://docs.apipost.net/docs/detail/2a37986cbc64000?target_id=0)
2. 用户 api_token。获取方式：Apipost 客户端 > 工作台 > 项目设置 > 对外能力 > open API

### 4. 启动本地服务

```bash
# 启动服务（自动加载 .env）
npm run start
```

**其他可用脚本：**

| 脚本 | 说明 |
|------|------|
| `npm run build` | 编译 TypeScript |
| `npm run start` | 启动服务（自动加载 `.env`） |
| `npm run dev` | 开发模式运行 |
| `npm run watch` | 开发模式热更新 |
| `npm run debugger` | 使用 MCP Inspector 调试 |

### 5. 快捷命令配置 MCP

本项目提供快捷脚本，可将 `mcp.json` 中的 apipost 配置一键同步到主流 AI 编辑器的 MCP 配置中。

#### Claude Code

```bash
npm run setup:claude-code
```

将配置写入 `~/.claude.json`（全局生效，所有项目可用）。

#### Codex (OpenAI)

```bash
npm run setup:codex
```

将配置写入 `~/.codex/config.toml`（TOML 格式，全局生效）。

#### Cursor

```bash
npm run setup:cursor
```

将配置写入 `~/.cursor/mcp.json`（JSON 格式，全局生效）。

#### Windsurf

```bash
npm run setup:windsurf
```

将配置写入 `~/.windsurf/mcp.json`（JSON 格式，全局生效）。

#### Trae

```bash
npm run setup:trae
```

将配置写入 `~/.trae/mcp.json`（JSON 格式，全局生效）。

#### Qoder

```bash
npm run setup:qoder
```

将配置写入 `~/.qoder/mcp.json`（JSON 格式，全局生效）。

**注意：** 运行前请确保 `mcp.json` 中的环境变量已填写真实值。

### 6. 其他Agent客户端手动配置 mcp.json

在 MCP 配置文件中添加：

```json
{
  "mcpServers": {
    "apipost": {
      "command": "node",
      "args": ["/absolute/path/to/apipost-mcp/dist/index.js"],
      "env": {
        "APIPOST_TOKEN": "your_access_token_here", // 换成自己的token
        "APIPOST_HOST": "https://open.apipost.net", // 私有化部署 换成 私有化域名，不知道是啥的，分享一个接口的链接，填写链接host
        "APIPOST_SECURITY_MODE": "limited",
        "APIPOST_DEFAULT_TEAM_NAME": "你的团队名称",
        "APIPOST_DEFAULT_PROJECT_NAME": "你的项目名称",
        "APIPOST_URL_PREFIX": "接口前缀可定义常量比如{{host}}",
        "APIPOST_INLINE_COMMENTS": "true"
      }
    }
  }
}
```

**优先级说明：** 系统环境变量 > `.env` 文件中的变量。如果 MCP 配置文件中也配置了相同的环境变量，MCP 配置的值会覆盖 `.env` 文件中的值。

## 项目结构

```
apipost-mcp/
├── src/
│   ├── index.ts              # MCP 服务器入口，注册工具和启动服务
│   ├── config/               # 环境变量、安全模式、URL 前缀处理
│   ├── workspace/            # 工作空间管理（团队/项目初始化与切换）
│   ├── api-client/           # ApiPost OpenAPI 封装（axios 客户端）
│   ├── tools/                # MCP 工具定义与处理器
│   │   ├── definitions.ts    # 工具 schema 定义
│   │   └── handlers.ts       # 工具业务逻辑
│   ├── schema/               # JSON Schema 处理、Body 构建、响应标准化、TS/JSDoc 生成
│   ├── types/                # TypeScript 类型定义
│   └── utils/                # 通用工具函数（参数转换、字段扩展、JSON 构建等）
├── package.json
├── tsconfig.json
└── README.md
```

## 可用工具

| 工具 | 功能 | 主要参数 |
|------|------|---------|
| `apipost_test_connection` | 连接测试 | `random_string` |
| `apipost_workspace` | 工作空间管理 | `action` (必需) |
| `apipost_create_folder` | 创建目录 | `name`, `parent_id` |
| `apipost_smart_create` | 创建接口 | `method`, `url`, `name` |
| `apipost_list` | 强化列表搜索 | `search`, `parent_id`, `target_type`, `show_structure`, `recursive`, `group_by_folder` |
| `apipost_detail` | 查看详情 | `target_id` |
| `apipost_update` | 修改接口 | `target_id`, 其他可选 |
| `apipost_delete` | 删除接口 | `api_ids` |
| `apipost_schema_to_types` | Schema 转 TS/JSDoc | `target_id`, `output_ts`, `output_jsdoc` |

### apipost_test_connection 说明

**快速诊断工具**，适合首次使用或故障排查：
- 验证 MCP 服务器连接状态
- 检查环境变量配置
- 显示当前工作空间信息
- 检查操作权限和安全模式
- 提供系统环境详情

### apipost_workspace 说明

**统一的工作空间管理工具**，支持以下操作：

| Action | 功能 | 主要参数 | 说明 |
|--------|------|---------|------|
| `current` | 查看当前工作空间 | `show_all` | 显示当前团队、项目信息，可选显示所有可用选项 |
| `list_teams` | 列出团队 | `show_details` | 显示所有可用团队，标识当前团队 |
| `list_projects` | 列出项目 | `team_id`, `show_details` | 显示指定团队的项目列表 |
| `switch` | 切换工作空间 | `team_id`, `project_id` 或 `team_name`, `project_name` | 切换到指定的团队和项目 |

**使用示例：**
```
# 查看当前工作空间
apipost_workspace action: "current"

# 列出所有团队
apipost_workspace action: "list_teams" show_details: true

# 列出项目
apipost_workspace action: "list_projects" team_id: "your_team_id"

# 切换工作空间（支持按名称或ID）
apipost_workspace action: "switch" team_name: "团队名" project_name: "项目名"
```

### apipost_list 参数说明

| 参数 | 类型 | 说明 |
|------|------|------|
| `search` | string | 搜索关键词（接口名称、URL、方法、ID、描述） |
| `parent_id` | string | 父目录 ID，精确查找子项目。"0"为根目录 |
| `target_type` | string | 类型筛选：`api`(仅接口)、`folder`(仅目录)、`all`(全部) |
| `show_structure` | boolean | 显示树形结构，默认 false 为列表模式 |
| `show_path` | boolean | 显示完整路径，默认 false |
| `recursive` | boolean | 递归搜索子目录，默认 false |
| `depth` | number | 深度限制（配合 recursive），默认无限制 |
| `group_by_folder` | boolean | 按目录分组显示，默认 false |
| `limit` | number | 显示数量限制（默认 50，最大 200） |
| `show_all` | boolean | 显示全部（忽略 limit 限制） |

### apipost_smart_create 说明（字段列表驱动）

规则（强制）：
- `responses` 只传 `fields`，不要传 `data`；所有字段（含父级）必须带 `desc`。
- headers/query/body/cookies 用字段列表字符串，嵌套用 `.`，数组用 `[]`（如 `meta.flags.debug`、`items[].id`），example 填真实值，不要放 JSON 字符串。
- 父级需显式声明并写 `desc`，示例：`{"key":"data","type":"object","desc":"返回体"},{"key":"data.user","type":"object","desc":"用户"},{"key":"data.user.id","type":"integer","example":1,"desc":"用户ID"}`。
- 可选 `APIPOST_INLINE_COMMENTS=true` 时，raw 会按 `desc` 生成行内注释（mock 始终为纯 JSON）。
- 可选 `APIPOST_URL_PREFIX={{host}}` 时，创建或更新接口时会将前缀自动拼接到 URL（避免手动重复填写路由常量）。

必填：`method`、`url`、`name`。其他字段（均为字符串化 JSON 数组/对象）：
- headers/query/body/cookies：`[{"key":"X-Request-ID","type":"string","required":true,"example":"req-1","desc":"说明"}]`
- responses：`[{"name":"成功","status":200,"fields":[{"key":"code","type":"integer","example":0,"desc":"状态码"},{"key":"data.items[].id","type":"string","example":"1","desc":"商品ID"}]}]`
- auth：`{"type":"bearer","bearer":{"key":"your_token"}}`

字段类型：`string`/`integer`/`number`/`boolean`/`object`/`array`/`null`

示例（嵌套）：
```json
"body": "[{\"key\":\"user.id\",\"type\":\"integer\",\"required\":true,\"example\":9001,\"desc\":\"用户ID\"},{\"key\":\"user.profile.tags[]\",\"type\":\"string\",\"example\":\"vip\",\"desc\":\"标签\"}]",
"responses": "[{\"name\":\"成功\",\"status\":200,\"fields\":[{\"key\":\"code\",\"type\":\"integer\",\"example\":0,\"desc\":\"状态码\"},{\"key\":\"data.user.profile.tags[]\",\"type\":\"string\",\"example\":\"vip\",\"desc\":\"标签\"}]}]"
```

### apipost_schema_to_types 说明

**将接口的 JSON Schema 转换为 TypeScript 类型定义和 JSDoc 注释**，方便前端/后端对接口类型进行复用。尤其适合前端快速落地请求代码：拿到接口类型后，直接复制到项目即可配合 `axios`、`fetch` 等库使用。

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `target_id` | string | 是 | 接口 ID |
| `output_ts` | boolean | 否 | 是否输出 TypeScript 类型定义，默认 `true` |
| `output_jsdoc` | boolean | 否 | 是否输出 JSDoc 注释，默认 `false` |

**使用示例：**
```
# 仅输出 TypeScript 类型
apipost_schema_to_types target_id: "api_123"

# 同时输出 TypeScript 和 JSDoc
apipost_schema_to_types target_id: "api_123" output_ts: true output_jsdoc: true
```

**输出结构：**
```json
{
  "url": "/api/users",
  "target_id": "api_123",
  "method": "GET",
  "request": {
    "body": { "ts": "export interface RequestBody { ... }", "jsdoc": "", "mode": "json" },
    "query": { "ts": "export interface Query { ... }", "jsdoc": "" }
  },
  "response": { "ts": "export interface Response { ... }", "jsdoc": "" }
}
```

---

**提示**：这是一个专注于 API 接口管理的 MCP 工具，简化了接口创建和管理流程，提高团队协作效率。

## 联系方式
- 邮箱: LnievV@outlook.com


## 相关链接

- [ApiPost OpenAPI 文档](https://docs.apipost.net/docs/detail/2a37986cbc64000?target_id=23796913b176e1)
- [MCP 协议说明](https://github.com/modelcontextprotocol/specification)
