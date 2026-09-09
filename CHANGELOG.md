# Changelog

## [1.5.2] - 2026-09-09

### 🐛 问题修复

- **`setup` 未安装编辑器报错**：未安装的编辑器（如 trae，配置目录 `~/.trae` 不存在）写入配置时 ENOENT 报错，现先检测配置目录，未安装时提示「⏭️ 未检测到 XX，已跳过」并继续配置其余编辑器；`setup:<editor>` 单编辑器模式同步该行为（提示后退出码 1）
- **`setup` 结束时 readline 崩溃**：`runInteractiveSetup()` 提前关闭共享 readline，后续「是否启动 MCP Server 测试连接」提问抛出 `ERR_USE_AFTER_CLOSE`，现改为所有交互结束后统一关闭
- 新增 `src/setup/editors.test.ts`（8 个用例：findEditor / isEditorInstalled / writeEditorConfig）

## [1.5.0] - 2026-09-09

### ✨ 新增功能

- **新增工具 `apipost_list_all`**：跨团队全局接口盘点，遍历所有团队 → 所有项目 → 接口列表，按「团队 → 项目 → 接口」层级分组返回接口名称、方法、URL、描述等基本信息
  - 复用现有 `getTeamList` / `getProjectList` / `getApiList` API 封装，无需新增 HTTP 接口
  - 全局扁平分页：接口按「团队 → 项目」顺序全局编号，`limit` 每页条数（默认 1000，最大 10000）、`page` 页码（默认 1），输出提示下一页页码
  - 单个团队/项目拉取失败不中断整体遍历，标记错误后继续
  - 参数：`include_folders`（是否含目录，默认 false）、`show_description`（是否显示描述，默认 true）
- 新增 10 个测试用例（9 个 handler 分支用例 + 1 个 MCP 协议集成用例）

### ⬆️ 依赖升级

- **`@modelcontextprotocol/sdk` 0.4.0 → 1.30.0**：`Server` 构造参数拆分为实现信息 + 选项两段（`capabilities` 移入第二个参数），适配 SDK 1.x breaking change
- **`zod` 3.25.76 → 4.5.4**：仅作为 SDK 传递依赖使用（项目源码无直接 import），SDK 1.30.0 兼容范围 `^3.25 || ^4.0` 满足
- **统一使用 pnpm 管理依赖**：移除 npm 生成的 `package-lock.json`，新增 `pnpm-workspace.yaml` 声明 esbuild 构建脚本白名单

## [1.4.0] - 2026-09-09

### ✨ 新增功能

- **接口数据预校验**：`apipost_smart_create` / `apipost_update` 保存前自动校验字段格式，不合格数据阻断保存并返回完整问题清单，防止「保存成功但文档什么也没展示」
  - 新增纯函数 `validateApiFields()`：通用字段列表校验（headers/query/body/cookies/responses.fields 复用）
  - 新增纯函数 `validateSmartCreatePayload()`：整体入参校验（name/method/url/auth/responses 结构）
  - 新增纯函数 `formatValidationResult()`：格式化校验报告
- **新增参数 `validate_only`**（仅 `apipost_smart_create`）：为 `true` 时只执行预校验并返回报告，不实际保存
- **新增参数 `skip_validation`**（`apipost_smart_create` / `apipost_update`）：为 `true` 时跳过预校验强制保存（逃生门）

### 🛡️ 校验规则

**错误（阻断保存）：**
- name/method/url 缺失或 method 非法
- 字段缺 `key`、key 格式非法（空段 `a..b`、`a[]b` 等）、key 重复
- `type` 非法值（仅允许 string/integer/number/boolean/object/array/null）
- `example` 为字符串化的 JSON（违反「example 填真实值」约定）
- `example` 类型与声明 `type` 不匹配（如 integer 配 `"abc"`）
- 路径类型冲突（同一前缀既作基本类型又有子字段）
- responses 传了 `data` 或 `fields` 为空（文档无响应展示的直接原因）

**警告（不阻断，日志提示）：**
- 字段缺 `desc`、父级未显式声明、object/array 无子字段、method 小写、url 格式可疑

### ♻️ 其他调整

- `apipost_update` 提前解析 `auth`（复用校验与合并逻辑），解析失败时给出明确错误
- 修正 `apipost_update` 工具描述中 responses 示例误含 `data` 字段的问题
- 新增 30 个测试用例（22 个校验器纯函数用例 + 8 个 handler 分支用例）

## [1.3.0] - 2026-05-20

### ✨ 新增与改进

- **dotenv 支持**：集成 `dotenv`，支持通过 `.env` 文件管理环境变量
  - `npm run start` 自动加载 `.env`
  - 新增 `npm run debugger` 脚本，调试时自动加载 `.env`
- **`apipost_detail` 响应展示增强**：先展示结构化的 Schema 字段表格（字段名、类型、描述），再展示示例数据
  - 新增 `flattenSchemaProperties` 递归扁平化 JSON Schema
  - 新增 `formatSchemaTable` 格式化 ASCII 表格输出
  - 示例数据截断阈值由 200 提升至 3000 字符

### 📚 文档更新

- README 新增「常用脚本」说明表格
- README 新增 `.env` 文件配置环境变量说明，包含操作步骤、配置示例及优先级说明

## [1.2.0] - 2025-11-27

### 🔄 重构与优化
- 字段列表全面驱动：headers/query/body/cookies/responses 统一用字段列表自动生成 ApiPost 所需结构，调用更简洁、传输体积更小、节省 token
- responses 仅接受 fields 自动生成 data，不再使用 data 入参；所有字段（含父级）必须提供 desc，保证文档可读性
- 父级节点可显式描述，未提供时自动补位且不展示大块 JSON；可选 `APIPOST_INLINE_COMMENTS=true` 按 desc 生成 raw 行内注释（mock 始终为纯 JSON）

## [1.1.0] - 2025-08-14

### 🆕 新增功能
- `apipost_create_folder` - 创建API文档目录，支持在指定父目录下创建新的文件夹
- `apipost_smart_create` - 新增parent_id参数支持，允许在指定目录下创建API接口

#### 核心特性
- **目录管理**：支持创建API文档目录，构建层级结构
- **位置控制**：API接口创建时可指定父目录ID，提升文档管理效率
- **层级组织**：支持在指定目录下创建子目录和接口，无需手动移动

#### 参数说明
- `apipost_create_folder` 参数：
  - `name` (必需): 目录名称
  - `parent_id` (可选): 父目录ID，默认"0"表示根目录
  - `description` (可选): 目录描述
- `apipost_smart_create` 新增参数：
  - `parent_id` (可选): 父目录ID，默认"0"表示根目录

## [1.0.0] - 2025-08-06

### 🎉 首次发布

#### 新增功能
- `apipost_smart_create` - 创建API接口文档
- `apipost_detail` - 查看接口详细配置
- `apipost_list` - 接口列表查看和搜索
- `apipost_update` - 接口增量更新和字段删除
- `apipost_delete` - 批量删除接口

#### 核心特性
- 基于 ApiPost 官方 OpenAPI 实现
- 支持完整的HTTP参数配置（headers、query、body等）
- 增量更新：只修改指定字段，保持其他配置不变
- 字段删除：提供空值可删除对应配置项
- 三种安全模式：
  - `readonly`: 只读模式，仅查看
  - `limited`: 读写模式，禁止删除
  - `full`: 完全访问，所有操作

#### 可用工具
- `apipost_smart_create` - 创建API接口
- `apipost_detail` - 查看接口详情
- `apipost_list` - 接口列表查看
- `apipost_update` - 接口修改
- `apipost_delete` - 批量删除
