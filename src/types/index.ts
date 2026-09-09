/**
 * ApiPost MCP 类型定义模块
 */

// ============ 工作空间类型 ============
export interface Workspace {
    teamId: string;
    teamName: string;
    projectId: string;
    projectName: string;
}

export interface Team {
    team_id: string;
    name: string;
}

export interface Project {
    project_id: string;
    name: string;
}

// ============ API 参数类型 ============
export interface ApiParameter {
    key: string;
    type?: string;
    field_type?: string;
    desc?: string;
    description?: string;
    required?: boolean;
    not_null?: number;
    is_checked?: number;
    example?: unknown;
    value?: unknown;
    autoParent?: boolean;
    schema?: Record<string, unknown>;
    param_id?: string;
}

export interface ApiField {
    key: string;
    type?: string;
    desc?: string;
    description?: string;
    example?: unknown;
    value?: unknown;
    required?: boolean;
    not_null?: number;
    schema?: Record<string, unknown>;
    autoParent?: boolean;
}

// ============ 认证类型 ============
export interface AuthConfig {
    type?: string;
    bearer?: { key: string };
    basic?: { username: string; password: string };
}

// ============ 响应类型 ============
export interface ResponseField {
    name?: string;
    status?: number;
    fields?: ApiField[];
    data?: unknown;
    schema?: Record<string, unknown>;
}

export interface ApiPostResponseExample {
    example_id: string;
    raw: string;
    raw_parameter: ApiParameter[];
    headers: unknown[];
    expect: {
        code: string;
        content_type: string;
        is_default: number;
        mock: string;
        name: string;
        schema: Record<string, unknown>;
        verify_type: string;
        sleep: number;
    };
}

export interface ResponseConfig {
    example: ApiPostResponseExample[];
    is_check_result: number;
}

// ============ Body 类型 ============
export interface BodySection {
    mode: string;
    parameter: unknown[];
    raw: string;
    raw_parameter: ApiParameter[];
    raw_schema: Record<string, unknown>;
    binary: null;
}

// ============ API 详情类型 ============
export interface ApiDetail {
    target_id: string;
    name: string;
    url: string;
    method: string;
    description?: string;
    request?: {
        body?: BodySection & { parameter?: ApiParameter[] };
        query?: { parameter?: ApiParameter[] };
        header?: { parameter?: ApiParameter[] };
        cookie?: { parameter?: ApiParameter[] };
        auth?: AuthConfig;
    };
    response?: ResponseConfig;
}

// ============ 工具参数类型 ============
export interface CreateFolderArgs {
    name: string;
    parent_id?: string;
    description?: string;
}

export interface SmartCreateArgs {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    url: string;
    name: string;
    parent_id?: string;
    description?: string;
    headers?: string;
    query?: string;
    body?: string;
    cookies?: string;
    auth?: string;
    responses?: string;
}

export interface ListArgs {
    search?: string;
    parent_id?: string;
    target_type?: 'api' | 'folder' | 'all';
    show_structure?: boolean;
    show_path?: boolean;
    recursive?: boolean;
    depth?: number;
    group_by_folder?: boolean;
    limit?: number;
    show_all?: boolean;
}

export interface ListAllArgs {
    include_folders?: boolean;
    show_description?: boolean;
    limit?: number;
    page?: number;
}

export interface UpdateArgs {
    target_id: string;
    name?: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    url?: string;
    description?: string;
    headers?: string;
    query?: string;
    body?: string;
    cookies?: string;
    auth?: string;
    responses?: string;
}

export interface DeleteArgs {
    api_ids: string[];
}

export interface DetailArgs {
    target_id: string;
}

export interface SchemaToTypesArgs {
    target_id: string;
    output_ts?: boolean;
    output_jsdoc?: boolean;
}

export interface WorkspaceArgs {
    action: 'current' | 'list_teams' | 'list_projects' | 'switch';
    team_id?: string;
    project_id?: string;
    team_name?: string;
    project_name?: string;
    show_details?: boolean;
    show_all?: boolean;
}

export interface TestConnectionArgs {
    random_string: string;
}

// ============ Schema 转换类型 ============
export interface SchemaField {
    field: string;
    type: string;
    desc: string;
}

export interface TypeScriptOutput {
    ts: string;
    jsdoc: string;
}

export interface SchemaToTypesOutput {
    url: string;
    target_id: string;
    method: string;
    request: {
        body: TypeScriptOutput & { mode: string };
        query: TypeScriptOutput;
    };
    response: TypeScriptOutput;
}

// ============ API 响应类型 ============
export interface ApiPostApiResponse<T = unknown> {
    code: number;
    msg?: string;
    message?: string;
    data: T;
}

export interface ApiListItem {
    target_id: string;
    name: string;
    url?: string;
    method?: string;
    target_type?: 'api' | 'folder';
    parent_id?: string;
    description?: string;
    is_folder?: number;
}

export interface FolderTreeItem extends ApiListItem {
    children?: FolderTreeItem[];
    path?: string[];
}
