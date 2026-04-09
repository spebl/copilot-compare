import type { McpLocalServerConfig, McpRemoteServerConfig, McpServerConfig, McpServers } from './electron-contract';

export const DEFAULT_MCP_SERVER_TOOLS = ['*'];

type NormalizedMcpLocalServerConfig = Omit<McpLocalServerConfig, 'tools' | 'type'> & {
  type: 'local' | 'stdio';
  tools: string[];
};

type NormalizedMcpRemoteServerConfig = Omit<McpRemoteServerConfig, 'tools'> & {
  tools: string[];
};

export type NormalizedMcpServerConfig = NormalizedMcpLocalServerConfig | NormalizedMcpRemoteServerConfig;
export type NormalizedMcpServers = Record<string, NormalizedMcpServerConfig>;

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function is_remote_server_type(value: unknown): value is McpRemoteServerConfig['type'] {
  return value === 'http' || value === 'sse';
}

function is_remote_mcp_server(server_config: McpServerConfig): server_config is McpRemoteServerConfig {
  return is_remote_server_type(server_config.type);
}

function is_local_server_type(value: unknown): value is McpLocalServerConfig['type'] {
  return value === undefined || value === 'local' || value === 'stdio';
}

function parse_non_empty_string(value: unknown, error_message: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(error_message);
  }

  return value;
}

function parse_string_array(value: unknown, error_message: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(error_message);
  }

  return Array.from(new Set(value));
}

function parse_optional_string_array(value: unknown, error_message: string) {
  if (value === undefined) {
    return undefined;
  }

  return parse_string_array(value, error_message);
}

function parse_optional_string_record(value: unknown, error_message: string) {
  if (value === undefined) {
    return undefined;
  }

  if (!is_record(value) || Object.values(value).some((item) => typeof item !== 'string')) {
    throw new Error(error_message);
  }

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, item as string]));
}

function parse_optional_timeout(value: unknown, error_message: string) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(error_message);
  }

  return value;
}

function parse_mcp_server_config(value: unknown, server_name: string): McpServerConfig {
  if (!is_record(value)) {
    throw new Error(`MCP server "${server_name}" must be an object.`);
  }

  const tools = parse_optional_string_array(value.tools, `MCP server "${server_name}" has an invalid tools list.`);
  const timeout = parse_optional_timeout(value.timeout, `MCP server "${server_name}" has an invalid timeout.`);

  if (is_remote_server_type(value.type)) {
    const headers = parse_optional_string_record(value.headers, `MCP server "${server_name}" has invalid headers.`);

    return {
      type: value.type,
      url: parse_non_empty_string(value.url, `MCP server "${server_name}" is missing a valid url.`),
      ...(headers ? { headers } : {}),
      ...(tools ? { tools } : {}),
      ...(timeout !== undefined ? { timeout } : {}),
    };
  }

  if (!is_local_server_type(value.type)) {
    throw new Error(`MCP server "${server_name}" has an unsupported type.`);
  }

  const env = parse_optional_string_record(value.env, `MCP server "${server_name}" has invalid env values.`);
  const cwd = value.cwd === undefined ? undefined : parse_non_empty_string(value.cwd, `MCP server "${server_name}" has an invalid cwd.`);

  return {
    type: value.type ?? 'local',
    command: parse_non_empty_string(value.command, `MCP server "${server_name}" is missing a valid command.`),
    args: parse_string_array(value.args, `MCP server "${server_name}" has an invalid args list.`),
    ...(env ? { env } : {}),
    ...(cwd ? { cwd } : {}),
    ...(tools ? { tools } : {}),
    ...(timeout !== undefined ? { timeout } : {}),
  };
}

function looks_like_mcp_server_record(value: Record<string, unknown>) {
  return Object.entries(value).every(([, server_value]) => {
    if (!is_record(server_value)) {
      return false;
    }

    return ['type', 'command', 'args', 'env', 'cwd', 'tools', 'timeout', 'url', 'headers'].some((key) => key in server_value);
  });
}

export function parse_mcp_servers(value: unknown, label = 'MCP servers'): McpServers {
  if (!is_record(value)) {
    throw new Error(`${label} must be an object.`);
  }

  const parsed_servers: McpServers = {};
  for (const [server_name, server_value] of Object.entries(value)) {
    const normalized_server_name = server_name.trim();
    if (normalized_server_name.length === 0) {
      throw new Error(`${label} contains an empty server name.`);
    }

    if (normalized_server_name in parsed_servers) {
      throw new Error(`${label} contains a duplicate server name: ${normalized_server_name}.`);
    }

    parsed_servers[normalized_server_name] = parse_mcp_server_config(server_value, normalized_server_name);
  }

  return parsed_servers;
}

export function parse_mcp_servers_file(value: unknown) {
  if (!is_record(value)) {
    throw new Error('MCP config file must be a JSON object.');
  }

  if ('mcpServers' in value) {
    return parse_mcp_servers(value.mcpServers, 'MCP config file mcpServers');
  }

  if (looks_like_mcp_server_record(value)) {
    return parse_mcp_servers(value, 'MCP config file');
  }

  throw new Error('MCP config file must contain an mcpServers object or be a direct server map.');
}

export function normalize_mcp_servers_for_session(mcp_servers: McpServers | undefined): NormalizedMcpServers | undefined {
  if (!mcp_servers || Object.keys(mcp_servers).length === 0) {
    return undefined;
  }

  const normalized_mcp_servers: NormalizedMcpServers = {};

  for (const [server_name, server_config] of Object.entries(mcp_servers)) {
    if (is_remote_mcp_server(server_config)) {
      normalized_mcp_servers[server_name] = {
        type: server_config.type,
        url: server_config.url,
        ...(server_config.headers ? { headers: server_config.headers } : {}),
        ...(server_config.timeout !== undefined ? { timeout: server_config.timeout } : {}),
        tools: server_config.tools ?? DEFAULT_MCP_SERVER_TOOLS,
      };
      continue;
    }

    normalized_mcp_servers[server_name] = {
      type: server_config.type ?? 'local',
      command: server_config.command,
      args: server_config.args,
      ...(server_config.env ? { env: server_config.env } : {}),
      ...(server_config.cwd ? { cwd: server_config.cwd } : {}),
      ...(server_config.timeout !== undefined ? { timeout: server_config.timeout } : {}),
      tools: server_config.tools ?? DEFAULT_MCP_SERVER_TOOLS,
    };
  }

  return normalized_mcp_servers;
}