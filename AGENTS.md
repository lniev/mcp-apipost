# Agent Context: apipost-mcp

> 本文件用于向大模型提供项目上下文，帮助其快速理解项目结构、技术栈、关键约定和开发规范。

---

## 1. 项目概述

**apipost-mcp** 是一个基于 [MCP (Model Context Protocol)](https://github.com/modelcontextprotocol/specification) 协议实现的 API 文档管理工具。它通过 MCP 工具暴露能力，让 AI Agent（如 Claude、Cursor 等）能够直接操作 [ApiPost](https://www.apipost.cn/) 平台上的接口文档。

**核心能力：**
- 连接测试、工作空间管理（团队/项目切换）
- API 接口的创建、查看、修改、删除
- 目录层级搜索与递归浏览
- 字段列表驱动的智能接口创建（无需手写复杂 JSON）
- JSON Schema 自动转换为 TypeScript 类型定义和 JSDoc 注释
- 三级安全模式控制（readonly / limited / full）

**技术栈：**
- **运行时：** Node.js >= 18.0.0
- **语言：** TypeScript 5.9+ (ES2022 / ESNext Module)
- **核心依赖：** `@modelcontextprotocol/sdk` ^0.4.0, `axios` ^1.6.0, `zod` ^3.22.0
- **构建：** `tsc` 编译到 `dist/`，使用 `tsx` 进行开发调试

---

## 2. 项目结构

```
apipost-mcp/
├── src/
│   ├── index.ts              # 启动入口：validateEnv + 工作空间预热 + 连接 stdio
│   ├── server.ts             # Server 组装：createServer() + handleCallTool()（无副作用，可测）
│   ├── config/               # 环境变量读取、安全模式校验、URL 前缀处理
│   ├── workspace/            # 工作空间状态管理（团队/项目初始化与切换）
│   ├── api-client/           # Axios 封装，对接 ApiPost OpenAPI
│   ├── tools/
│   │   ├── definitions.ts    # 9 个 MCP 工具的 JSON Schema 定义
│   │   └── handlers.ts       # 各工具的业务逻辑实现
│   ├── schema/               # Body 构建、响应标准化、Schema 扁平化、TS/JSDoc 生成
│   ├── types/                # 全项目 TypeScript 类型定义
│   └── utils/                # 通用工具：字段扩展、JSON 构建、行内注释、错误格式化
├── dist/                     # tsc 编译输出（.gitignore）
├── package.json
├── tsconfig.json
└── .env                      # 本地环境变量（.gitignore）
```

**模块职责边界：**
| 模块 | 职责 | 禁止行为 |
|------|------|----------|
| `config` | 纯配置读取与校验，无副作用 | 不发起 HTTP 请求 |
| `workspace` | 维护当前 team/project 状态 | 不直接调用 ApiPost API（通过 `api-client`） |
| `api-client` | 唯一 HTTP 出口，统一错误处理 | 不处理业务逻辑 |
| `tools/*` | 参数解析 + 调用下游模块 + 格式化输出 | 不直接操作 axios |
| `schema` | 数据结构转换与代码生成 | 不依赖环境变量 |
| `utils` | 纯函数工具集 | 不依赖其他业务模块 |

---

## 3. 关键约定与规范

### 3.1 环境变量

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `APIPOST_TOKEN` | **是** | ApiPost OpenAPI 访问令牌 |
| `APIPOST_HOST` | 否 | 默认 `https://open.apipost.net` |
| `APIPOST_SECURITY_MODE` | 否 | `readonly` / `limited` / `full`，默认 `limited` |
| `APIPOST_DEFAULT_TEAM_NAME` | 否 | 启动时自动切换到的团队 |
| `APIPOST_DEFAULT_PROJECT_NAME` | 否 | 启动时自动切换到的项目 |
| `APIPOST_URL_PREFIX` | 否 | URL 前缀常量（如 `{{host}}`），创建/更新时自动拼接 |
| `APIPOST_INLINE_COMMENTS` | 否 | `true` 时 raw JSON 中按 `desc` 生成行内注释 |

### 3.2 安全模式

所有写操作（create/update/delete）必须先调用 `checkSecurityPermission(operation)`：
- `readonly`：仅允许 read
- `limited`：允许 read + write，禁止 delete
- `full`：允许所有操作

### 3.3 字段列表驱动（核心约定）

创建/更新接口时，`headers` / `query` / `body` / `cookies` / `responses` 均使用**字符串化的 JSON 数组**传递，而非直接传对象。

**字段格式：**
```json
[
  {"key":"data","desc":"返回体","type":"object"},
  {"key":"data.user","desc":"用户","type":"object"},
  {"key":"data.user.id","desc":"用户ID","type":"integer","example":1}
]
```

**关键规则：**
1. **嵌套用 `.`，数组用 `[]`**：`items[].id`、`meta.flags.debug`
2. **父级必须显式声明**：每个中间节点都要有独立的字段对象并写 `desc`
3. **`responses` 只传 `fields`，禁止传 `data`**
4. **`example` 填真实值**，不要放 JSON 字符串
5. 所有字段（含父级）**必须包含 `desc`**

### 3.4 增量更新语义

`apipost_update` 支持字段级增量更新：
- 传入的字段会**覆盖**原有值
- 传 `"[]"` 表示**清空**该部分（如 headers）
- 未传的字段**保持原值不变**
- 内部实现：先获取原接口详情，再合并变更字段

### 3.5 响应标准化

`schema/index.ts` 中的 `normalizeResponses()` 将简化字段列表转换为 ApiPost 原生响应结构：
- 自动生成 `example_id`、`expect.mock`、`expect.schema`
- 支持 `APIPOST_INLINE_COMMENTS` 在 raw 中注入行内注释
- 未提供响应时自动生成默认成功响应

---

## 4. 工具清单

| 工具名 | 功能 | 安全要求 |
|--------|------|----------|
| `apipost_test_connection` | 连接诊断，显示配置与权限 | - |
| `apipost_workspace` | 工作空间查询与切换 | - |
| `apipost_create_folder` | 创建 API 目录（当前官方未开放） | write |
| `apipost_smart_create` | 字段列表驱动创建接口 | write |
| `apipost_list` | 搜索/过滤/递归浏览接口列表 | read |
| `apipost_detail` | 查看接口完整详情 | read |
| `apipost_update` | 增量修改接口 | write |
| `apipost_delete` | 批量删除接口 | delete |
| `apipost_schema_to_types` | Schema 转 TS / JSDoc | read |

---

## 5. 开发指南

### 5.1 本地运行

```bash
# 安装依赖
npm install

# 创建环境变量文件
cp .env.example .env  # 手动编辑填入 APIPOST_TOKEN

# 开发模式（热更新）
npm run watch

# 使用 MCP Inspector 调试
npm run debugger

# 构建
npm run build

# 启动（生产）
npm run start
```

### 5.2 添加新工具

1. 在 `src/types/index.ts` 添加参数类型
2. 在 `src/tools/definitions.ts` 添加 `Tool` 定义（`inputSchema`）
3. 在 `src/tools/handlers.ts` 实现 `ToolHandler` 并注册到 `handlers` 映射表
4. 如果涉及新 API，在 `src/api-client/index.ts` 添加封装函数
5. 遵循现有错误处理模式：抛出 Error → 被顶层 `try/catch` 捕获 → 返回 `isError: true` 的文本内容

### 5.3 代码风格

- **无注释要求**：除非必要，不添加冗余注释
- **严格类型**：`strict: true`，避免 `any`
- **纯函数优先**：utils / schema 模块保持纯函数
- **错误处理**：业务错误使用 `throw new Error()`，统一在 handler 层格式化

### 5.4 测试

使用 [Vitest](https://vitest.dev/)（零配置支持 ESM + TS）。

```bash
npm test            # 单次运行全部测试
npm run test:watch  # 监听模式
```

**约定：**
- 测试文件与被测模块同目录，命名为 `*.test.ts`（已被 `tsconfig.json` exclude，不会编入 `dist`）。
- 按依赖层级选择 mock 策略：

| 被测模块 | 策略 |
|----------|------|
| `utils` / `schema`（纯函数） | 直接断言，无 mock |
| `config` | `vi.stubEnv` + `vi.resetModules()` + 动态 `import()` 控制环境变量 |
| `api-client` | `vi.mock('axios')`，用 `vi.hoisted` 持有 mock 实例 |
| `workspace` / `tools` | `vi.mock('../api-client/index.js')` 打桩 HTTP 层 |
| MCP 协议层 | `src/server.test.ts`，用自实现的 `InMemoryTransport` 让 `Client`/`Server` 进程内握手 |

**MCP 集成测试要点：**
- SDK 0.4.0 无内置内存 transport，`src/server.test.ts` 里自实现了 `InMemoryTransport`（约 20 行，实现 `Transport` 接口，两端互连）。
- 集成测试 `vi.mock` 掉 `api-client` 但保留真实 `workspace`，验证「协议 → handler → workspace 初始化」三层链路，仅屏蔽纯网络 IO。
- `validateEnv()` 的 `process.exit(1)` 副作用只留在 `index.ts`，测试通过 `createServer()` 拿到无副作用的 server 实例。

**新增代码测试约定：**
- 新增纯函数必须补 `*.test.ts`。
- 新增 handler 在 `src/tools/handlers.test.ts` 补参数解析与错误分支用例。

---

## 6. 常见问题

**Q: 为什么字段列表要传字符串而不是对象？**
A: MCP 工具参数目前只支持 JSON Schema 原生类型，复杂数组结构通过字符串化 JSON 传递，在 handler 层解析。

**Q: 工作空间未初始化怎么办？**
A: 每个 handler 开头调用 `ensureWorkspace()`，若未初始化会自动调用 `initWorkspace()`。也可手动调用 `apipost_workspace action:switch` 切换。

**Q: 如何调试 API 调用？**
A: 使用 `npm run debugger` 启动 MCP Inspector，或在 `api-client/index.ts` 的 `apiRequest` 中添加 `console.log`。

---

## 7. 外部依赖

- [ApiPost OpenAPI 文档](https://docs.apipost.net/docs/detail/2a37986cbc64000?target_id=23796913b176e1)
- [MCP Protocol Specification](https://github.com/modelcontextprotocol/specification)

---

*版本：1.2.0 | 作者：lniev | 协议：MIT*
