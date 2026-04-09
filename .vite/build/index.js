"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const path = require("node:path");
const node_fs = require("node:fs");
const electron = require("electron");
const IPC_CHANNELS = {
  new_copilot_connection: "new-copilot-connection",
  run: "run",
  save_configuration_group: "save-configuration-group",
  load_configuration_group: "load-configuration-group",
  load_mcp_servers: "load-mcp-servers",
  save_prompt_list: "save-prompt-list",
  load_prompt_list: "load-prompt-list",
  open_run_report: "open-run-report",
  open_last_run_window: "open-last-run-window",
  get_last_run_window_data: "get-last-run-window-data"
};
const REASONING_EFFORTS = ["low", "medium", "high", "xhigh"];
const DEFAULT_MCP_SERVER_TOOLS = ["*"];
function is_record$2(value) {
  return typeof value === "object" && value !== null;
}
function is_remote_server_type(value) {
  return value === "http" || value === "sse";
}
function is_remote_mcp_server(server_config) {
  return is_remote_server_type(server_config.type);
}
function is_local_server_type(value) {
  return value === void 0 || value === "local" || value === "stdio";
}
function parse_non_empty_string(value, error_message) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(error_message);
  }
  return value;
}
function parse_string_array(value, error_message) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(error_message);
  }
  return Array.from(new Set(value));
}
function parse_optional_string_array(value, error_message) {
  if (value === void 0) {
    return void 0;
  }
  return parse_string_array(value, error_message);
}
function parse_optional_string_record(value, error_message) {
  if (value === void 0) {
    return void 0;
  }
  if (!is_record$2(value) || Object.values(value).some((item) => typeof item !== "string")) {
    throw new Error(error_message);
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, item]));
}
function parse_optional_timeout(value, error_message) {
  if (value === void 0) {
    return void 0;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(error_message);
  }
  return value;
}
function parse_mcp_server_config(value, server_name) {
  if (!is_record$2(value)) {
    throw new Error(`MCP server "${server_name}" must be an object.`);
  }
  const tools = parse_optional_string_array(value.tools, `MCP server "${server_name}" has an invalid tools list.`);
  const timeout = parse_optional_timeout(value.timeout, `MCP server "${server_name}" has an invalid timeout.`);
  if (is_remote_server_type(value.type)) {
    const headers = parse_optional_string_record(value.headers, `MCP server "${server_name}" has invalid headers.`);
    return {
      type: value.type,
      url: parse_non_empty_string(value.url, `MCP server "${server_name}" is missing a valid url.`),
      ...headers ? { headers } : {},
      ...tools ? { tools } : {},
      ...timeout !== void 0 ? { timeout } : {}
    };
  }
  if (!is_local_server_type(value.type)) {
    throw new Error(`MCP server "${server_name}" has an unsupported type.`);
  }
  const env = parse_optional_string_record(value.env, `MCP server "${server_name}" has invalid env values.`);
  const cwd = value.cwd === void 0 ? void 0 : parse_non_empty_string(value.cwd, `MCP server "${server_name}" has an invalid cwd.`);
  return {
    type: value.type ?? "local",
    command: parse_non_empty_string(value.command, `MCP server "${server_name}" is missing a valid command.`),
    args: parse_string_array(value.args, `MCP server "${server_name}" has an invalid args list.`),
    ...env ? { env } : {},
    ...cwd ? { cwd } : {},
    ...tools ? { tools } : {},
    ...timeout !== void 0 ? { timeout } : {}
  };
}
function looks_like_mcp_server_record(value) {
  return Object.entries(value).every(([, server_value]) => {
    if (!is_record$2(server_value)) {
      return false;
    }
    return ["type", "command", "args", "env", "cwd", "tools", "timeout", "url", "headers"].some((key) => key in server_value);
  });
}
function parse_mcp_servers(value, label = "MCP servers") {
  if (!is_record$2(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const parsed_servers = {};
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
function parse_mcp_servers_file(value) {
  if (!is_record$2(value)) {
    throw new Error("MCP config file must be a JSON object.");
  }
  if ("mcpServers" in value) {
    return parse_mcp_servers(value.mcpServers, "MCP config file mcpServers");
  }
  if (looks_like_mcp_server_record(value)) {
    return parse_mcp_servers(value, "MCP config file");
  }
  throw new Error("MCP config file must contain an mcpServers object or be a direct server map.");
}
function normalize_mcp_servers_for_session(mcp_servers) {
  if (!mcp_servers || Object.keys(mcp_servers).length === 0) {
    return void 0;
  }
  const normalized_mcp_servers = {};
  for (const [server_name, server_config] of Object.entries(mcp_servers)) {
    if (is_remote_mcp_server(server_config)) {
      normalized_mcp_servers[server_name] = {
        type: server_config.type,
        url: server_config.url,
        ...server_config.headers ? { headers: server_config.headers } : {},
        ...server_config.timeout !== void 0 ? { timeout: server_config.timeout } : {},
        tools: server_config.tools ?? DEFAULT_MCP_SERVER_TOOLS
      };
      continue;
    }
    normalized_mcp_servers[server_name] = {
      type: server_config.type ?? "local",
      command: server_config.command,
      args: server_config.args,
      ...server_config.env ? { env: server_config.env } : {},
      ...server_config.cwd ? { cwd: server_config.cwd } : {},
      ...server_config.timeout !== void 0 ? { timeout: server_config.timeout } : {},
      tools: server_config.tools ?? DEFAULT_MCP_SERVER_TOOLS
    };
  }
  return normalized_mcp_servers;
}
const RUN_REPORTS_DIRECTORY_NAME = "runs";
function format_filename_date_part(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}
function sanitize_filename_part(value) {
  const sanitized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || "unknown";
}
function get_run_report_file_name(run_report) {
  const timestamp = format_filename_date_part(run_report.start_time);
  const model = sanitize_filename_part(run_report.config.model_id);
  const reasoning = sanitize_filename_part(run_report.config.reasoning_effort ?? "none");
  const id = sanitize_filename_part(run_report.id);
  return `${timestamp}__${model}__${reasoning}__${id}.json`;
}
function get_runs_directory(user_data_path) {
  return path.join(user_data_path, RUN_REPORTS_DIRECTORY_NAME);
}
async function write_run_report(user_data_path, run_report) {
  const report_path = path.join(get_runs_directory(user_data_path), get_run_report_file_name(run_report));
  await node_fs.promises.mkdir(path.dirname(report_path), { recursive: true });
  await node_fs.promises.writeFile(report_path, JSON.stringify(run_report, null, 2), "utf8");
  return report_path;
}
function is_record$1(value) {
  return typeof value === "object" && value !== null;
}
function is_json_value(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(is_json_value);
  }
  if (is_record$1(value)) {
    return Object.values(value).every(is_json_value);
  }
  return false;
}
function is_string_array(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function is_finite_number(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function parse_tool_call_response(value, index) {
  if (value === void 0) {
    return void 0;
  }
  if (!is_record$1(value)) {
    throw new Error(`Tool call ${index + 1} has an invalid response payload.`);
  }
  if (typeof value.success !== "boolean") {
    throw new Error(`Tool call ${index + 1} response is missing a valid success flag.`);
  }
  if (value.result !== void 0 && !is_json_value(value.result)) {
    throw new Error(`Tool call ${index + 1} response has an invalid result payload.`);
  }
  const error = value.error;
  let parsed_error;
  if (error !== void 0) {
    if (!is_record$1(error) || typeof error.message !== "string") {
      throw new Error(`Tool call ${index + 1} response has an invalid error payload.`);
    }
    if (error.code !== void 0 && typeof error.code !== "string") {
      throw new Error(`Tool call ${index + 1} response has an invalid error code.`);
    }
    parsed_error = {
      message: error.message,
      code: error.code
    };
  }
  return {
    success: value.success,
    result: value.result,
    error: parsed_error
  };
}
function parse_run_report(value) {
  if (!is_record$1(value)) {
    throw new Error("Run report must be a JSON object.");
  }
  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    throw new Error("Run report is missing a valid id.");
  }
  if (value.prompt !== void 0 && typeof value.prompt !== "string") {
    throw new Error("Run report has an invalid prompt.");
  }
  const config = value.config;
  if (!is_record$1(config)) {
    throw new Error("Run report is missing a valid config object.");
  }
  if (typeof config.id !== "string" || config.id.trim().length === 0) {
    throw new Error("Run report config is missing a valid id.");
  }
  if (typeof config.model_id !== "string" || config.model_id.trim().length === 0) {
    throw new Error("Run report config is missing a valid model_id.");
  }
  if (config.reasoning_effort !== void 0 && typeof config.reasoning_effort !== "string") {
    throw new Error("Run report config has an invalid reasoning_effort.");
  }
  if (!is_string_array(config.tool_names)) {
    throw new Error("Run report config has an invalid tool_names list.");
  }
  if (!Array.isArray(value.tool_calls)) {
    throw new Error("Run report is missing a valid tool_calls list.");
  }
  const tool_calls = value.tool_calls.map((tool_call, index) => {
    if (!is_record$1(tool_call)) {
      throw new Error(`Tool call ${index + 1} must be an object.`);
    }
    if (typeof tool_call.tool_call_id !== "string" || tool_call.tool_call_id.trim().length === 0) {
      throw new Error(`Tool call ${index + 1} is missing a valid tool_call_id.`);
    }
    if (typeof tool_call.tool_name !== "string" || tool_call.tool_name.trim().length === 0) {
      throw new Error(`Tool call ${index + 1} is missing a valid tool_name.`);
    }
    if (!is_finite_number(tool_call.start_time) || !is_finite_number(tool_call.end_time)) {
      throw new Error(`Tool call ${index + 1} is missing valid timing information.`);
    }
    if (tool_call.parameters !== void 0 && !is_json_value(tool_call.parameters)) {
      throw new Error(`Tool call ${index + 1} has an invalid parameters payload.`);
    }
    const response = parse_tool_call_response(tool_call.response, index);
    return {
      tool_call_id: tool_call.tool_call_id,
      tool_name: tool_call.tool_name,
      start_time: tool_call.start_time,
      end_time: tool_call.end_time,
      parameters: tool_call.parameters,
      response
    };
  });
  if (typeof value.response !== "string") {
    throw new Error("Run report is missing a valid response.");
  }
  if (!is_finite_number(value.tokens_used) || !is_finite_number(value.start_time) || !is_finite_number(value.end_time)) {
    throw new Error("Run report is missing valid token or timing metadata.");
  }
  return {
    id: value.id,
    prompt: value.prompt,
    config: {
      id: config.id,
      model_id: config.model_id,
      reasoning_effort: config.reasoning_effort,
      tool_names: config.tool_names,
      overwrite_default_prompt: typeof config.overwrite_default_prompt === "boolean" ? config.overwrite_default_prompt : false,
      custom_prompt: typeof config.custom_prompt === "string" ? config.custom_prompt : void 0,
      mcp_servers: config.mcp_servers === void 0 ? void 0 : parse_mcp_servers(config.mcp_servers, "Run report config mcp_servers")
    },
    tool_calls,
    response: value.response,
    tokens_used: value.tokens_used,
    start_time: value.start_time,
    end_time: value.end_time
  };
}
async function read_run_report(file_path) {
  const file_contents = await node_fs.promises.readFile(file_path, "utf8");
  return parse_run_report(JSON.parse(file_contents));
}
const JSON_FILE_FILTERS = [{ name: "JSON Files", extensions: ["json"] }];
function get_error_message(error) {
  return error instanceof Error ? error.message : "Unexpected error.";
}
function ensure_json_file_extension(file_path) {
  return path.extname(file_path).length === 0 ? `${file_path}.json` : file_path;
}
function get_dialog_window(event) {
  return electron.BrowserWindow.fromWebContents(event.sender);
}
async function show_save_dialog_for_event(event, dialog_options) {
  const browser_window = get_dialog_window(event);
  return browser_window ? electron.dialog.showSaveDialog(browser_window, dialog_options) : electron.dialog.showSaveDialog(dialog_options);
}
async function show_open_dialog_for_event(event, dialog_options) {
  const browser_window = get_dialog_window(event);
  return browser_window ? electron.dialog.showOpenDialog(browser_window, dialog_options) : electron.dialog.showOpenDialog(dialog_options);
}
async function choose_json_file_for_save(event, title, default_path) {
  const dialog_result = await show_save_dialog_for_event(event, {
    title,
    defaultPath: default_path,
    filters: JSON_FILE_FILTERS
  });
  if (dialog_result.canceled || !dialog_result.filePath) {
    return null;
  }
  return ensure_json_file_extension(dialog_result.filePath);
}
async function choose_json_file_for_open(event, title, default_path) {
  const dialog_result = await show_open_dialog_for_event(event, {
    title,
    defaultPath: default_path,
    filters: JSON_FILE_FILTERS,
    properties: ["openFile"]
  });
  const file_path = dialog_result.filePaths[0];
  if (dialog_result.canceled || !file_path) {
    return null;
  }
  return file_path;
}
async function write_json_file(file_path, value) {
  await node_fs.promises.writeFile(file_path, JSON.stringify(value, null, 2), "utf8");
}
async function read_json_file(file_path, parse) {
  const file_contents = await node_fs.promises.readFile(file_path, "utf8");
  return parse(JSON.parse(file_contents));
}
async function save_json_file(event, {
  title,
  default_path,
  value
}) {
  const file_path = await choose_json_file_for_save(event, title, default_path);
  if (!file_path) {
    return null;
  }
  await write_json_file(file_path, value);
  return file_path;
}
async function open_json_file(event, {
  title,
  default_path,
  load_file,
  error_label
}) {
  const file_path = await choose_json_file_for_open(event, title, default_path);
  if (!file_path) {
    return null;
  }
  try {
    return await load_file(file_path);
  } catch (error) {
    throw new Error(`Could not ${error_label} from ${path.basename(file_path)}: ${get_error_message(error)}`);
  }
}
const CONFIGURATION_GROUP_FILE_VERSION = 1;
const CONFIGURATION_GROUP_FILE_NAME = "copilot-configurations.json";
const CONFIGURATION_GROUPS_DIRECTORY_NAME = "configuration-groups";
const PROMPT_LIST_FILE_VERSION = 1;
const PROMPT_LIST_FILE_NAME = "copilot-prompts.json";
const PROMPT_LISTS_DIRECTORY_NAME = "prompt-lists";
function get_user_data_directory(user_data_path, directory_name) {
  return path.join(user_data_path, directory_name);
}
async function ensure_user_data_directory(user_data_path, directory_name) {
  const directory_path = get_user_data_directory(user_data_path, directory_name);
  await node_fs.promises.mkdir(directory_path, { recursive: true });
  return directory_path;
}
function is_record(value) {
  return typeof value === "object" && value !== null;
}
function is_reasoning_effort(value) {
  return typeof value === "string" && REASONING_EFFORTS.includes(value);
}
function parse_optional_string(value, error_message) {
  if (value === void 0) {
    return void 0;
  }
  if (typeof value === "string") {
    return value;
  }
  throw new Error(error_message);
}
function parse_optional_string_list(value, error_message) {
  if (value === void 0) {
    return void 0;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return Array.from(new Set(value));
  }
  throw new Error(error_message);
}
function parse_copilot_config(value, index) {
  if (!is_record(value)) {
    throw new Error(`Configuration ${index + 1} must be an object.`);
  }
  if (typeof value.model_id !== "string" || value.model_id.trim().length === 0) {
    throw new Error(`Configuration ${index + 1} is missing a valid model_id.`);
  }
  const id = typeof value.id === "string" && value.id.trim().length > 0 ? value.id : crypto.randomUUID();
  const reasoning_effort = value.reasoning_effort === void 0 ? void 0 : is_reasoning_effort(value.reasoning_effort) ? value.reasoning_effort : (() => {
    throw new Error(`Configuration ${index + 1} has an unsupported reasoning_effort.`);
  })();
  const tool_names = value.tool_names === void 0 ? [] : Array.isArray(value.tool_names) && value.tool_names.every((toolName) => typeof toolName === "string") ? Array.from(new Set(value.tool_names)) : (() => {
    throw new Error(`Configuration ${index + 1} has an invalid tool_names list.`);
  })();
  const overwrite_default_prompt = value.overwrite_default_prompt === void 0 ? false : typeof value.overwrite_default_prompt === "boolean" ? value.overwrite_default_prompt : (() => {
    throw new Error(`Configuration ${index + 1} has an invalid overwrite_default_prompt value.`);
  })();
  const custom_prompt = value.custom_prompt === void 0 ? void 0 : typeof value.custom_prompt === "string" ? value.custom_prompt : (() => {
    throw new Error(`Configuration ${index + 1} has an invalid custom_prompt value.`);
  })();
  const config_dir = parse_optional_string(
    value.config_dir,
    `Configuration ${index + 1} has an invalid config_dir value.`
  );
  const working_directory = parse_optional_string(
    value.working_directory,
    `Configuration ${index + 1} has an invalid working_directory value.`
  );
  const skill_directories = parse_optional_string_list(
    value.skill_directories,
    `Configuration ${index + 1} has an invalid skill_directories value.`
  );
  const mcp_servers = value.mcp_servers === void 0 ? void 0 : parse_mcp_servers(value.mcp_servers, `Configuration ${index + 1} mcp_servers`);
  return {
    id,
    model_id: value.model_id,
    reasoning_effort,
    tool_names,
    overwrite_default_prompt,
    custom_prompt,
    config_dir,
    working_directory,
    skill_directories,
    mcp_servers
  };
}
function parse_prompt_value(value, index) {
  if (typeof value !== "string") {
    throw new Error(`Prompt ${index + 1} must be a string.`);
  }
  const prompt = value.trim();
  if (prompt.length === 0) {
    throw new Error(`Prompt ${index + 1} must not be empty.`);
  }
  return prompt;
}
function parse_versioned_list_file(value, {
  file_label,
  version,
  property_name,
  parse_item
}) {
  if (Array.isArray(value)) {
    return value.map(parse_item);
  }
  if (!is_record(value)) {
    throw new Error(`${file_label} file must be a JSON object or array.`);
  }
  if (value.version !== void 0 && value.version !== version) {
    throw new Error(`Unsupported ${file_label.toLowerCase()} version: ${String(value.version)}.`);
  }
  const items = value[property_name];
  if (!Array.isArray(items)) {
    throw new Error(`${file_label} file is missing a ${property_name} array.`);
  }
  return items.map(parse_item);
}
async function ensure_configuration_groups_directory(user_data_path) {
  return ensure_user_data_directory(user_data_path, CONFIGURATION_GROUPS_DIRECTORY_NAME);
}
function create_configuration_group_file(configurations) {
  return {
    version: CONFIGURATION_GROUP_FILE_VERSION,
    configurations
  };
}
function parse_configuration_group_file(value) {
  return parse_versioned_list_file(value, {
    file_label: "Configuration group",
    version: CONFIGURATION_GROUP_FILE_VERSION,
    property_name: "configurations",
    parse_item: parse_copilot_config
  });
}
async function ensure_prompt_lists_directory(user_data_path) {
  return ensure_user_data_directory(user_data_path, PROMPT_LISTS_DIRECTORY_NAME);
}
function create_prompt_list_file(prompts) {
  return {
    version: PROMPT_LIST_FILE_VERSION,
    prompts: Array.from(new Set(prompts.map(parse_prompt_value)))
  };
}
function parse_prompt_list_file(value) {
  const prompts = parse_versioned_list_file(value, {
    file_label: "Prompt list",
    version: PROMPT_LIST_FILE_VERSION,
    property_name: "prompts",
    parse_item: parse_prompt_value
  });
  return Array.from(new Set(prompts));
}
const preload_path = path.join(__dirname, "preload.js");
path.join(__dirname, `../renderer/${"main_window"}/index.html`);
function load_main_window(win, query) {
  {
    const window_url = new URL("http://localhost:5173");
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        window_url.searchParams.set(key, value);
      }
    }
    return win.loadURL(window_url.toString());
  }
}
function to_json_value(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const normalized_item = to_json_value(item);
      return normalized_item === void 0 ? [] : [normalized_item];
    });
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, nested_value]) => {
        const normalized_value = to_json_value(nested_value);
        return normalized_value === void 0 ? [] : [[key, normalized_value]];
      })
    );
  }
  return String(value);
}
function get_copilot_cli_command() {
  const cli_loader_path = path.join(electron.app.getAppPath(), "node_modules", "@github", "copilot", "npm-loader.js");
  if (!node_fs.existsSync(cli_loader_path)) {
    throw new Error(
      "GitHub Copilot CLI is not installed where this app expects it. Run 'npm install' so @github/copilot is available before creating a connection."
    );
  }
  return {
    cliPath: process.env.npm_node_execpath ?? process.env.NODE ?? "node",
    cliArgs: [cli_loader_path]
  };
}
async function ensure_copilot_authenticated(client) {
  const auth_status = await client.getAuthStatus();
  if (auth_status.isAuthenticated) {
    return;
  }
  const details = auth_status.statusMessage ? ` ${auth_status.statusMessage}.` : "";
  throw new Error(
    `Copilot CLI is not authenticated.${details} Run 'copilot login' in a terminal, or set COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN before connecting.`
  );
}
const create_window = () => {
  const win = new electron.BrowserWindow({
    width: 1200,
    height: 1e3,
    webPreferences: {
      preload: preload_path
    }
  });
  void load_main_window(win);
  return win;
};
electron.app.whenReady().then(async () => {
  const load_copilot_sdk = () => import(
    /* webpackIgnore: true */
    "@github/copilot-sdk"
  );
  const { CopilotClient, approveAll: approve_all } = await load_copilot_sdk();
  let copilot_client = null;
  let copilot_resources = null;
  const last_run_window_data = /* @__PURE__ */ new Map();
  const create_last_run_window = (parent_window, window_id) => {
    const window_options = {
      width: 1040,
      height: 860,
      minWidth: 760,
      minHeight: 600,
      autoHideMenuBar: true,
      webPreferences: {
        preload: preload_path
      }
    };
    const win = new electron.BrowserWindow(
      parent_window ? { ...window_options, parent: parent_window } : window_options
    );
    void load_main_window(win, { view: "last-run", windowId: window_id });
    win.on("closed", () => {
      last_run_window_data.delete(window_id);
    });
    return win;
  };
  const load_copilot_resources = async (client) => {
    const tools = (await client.rpc.tools.list({})).tools;
    const models = await client.listModels();
    const model_specs = models.map((model_info) => {
      return {
        id: model_info.id,
        billing_mul: model_info.billing?.multiplier,
        supported_reasoning_efforts: model_info.supportedReasoningEfforts?.map((reasoning_effort) => reasoning_effort.toString()),
        default_reasoning_effort: model_info.defaultReasoningEffort?.toString()
      };
    });
    return { models: model_specs, tools };
  };
  electron.app.on("before-quit", () => {
    void copilot_client?.stop();
    copilot_client = null;
    copilot_resources = null;
  });
  electron.ipcMain.handle(IPC_CHANNELS.new_copilot_connection, async () => {
    if (copilot_client) {
      copilot_resources ??= await load_copilot_resources(copilot_client);
      return copilot_resources;
    }
    const cli_command = get_copilot_cli_command();
    const client = new CopilotClient(cli_command);
    try {
      await client.start();
      await ensure_copilot_authenticated(client);
      const resources = await load_copilot_resources(client);
      copilot_client = client;
      copilot_resources = resources;
      return resources;
    } catch (error) {
      await client.stop();
      throw error;
    }
  });
  electron.ipcMain.handle(IPC_CHANNELS.save_configuration_group, async (event, configurations) => {
    const configuration_groups_directory = await ensure_configuration_groups_directory(electron.app.getPath("userData"));
    return save_json_file(event, {
      title: "Save Copilot Configuration Group",
      default_path: path.join(configuration_groups_directory, CONFIGURATION_GROUP_FILE_NAME),
      value: create_configuration_group_file(configurations)
    });
  });
  electron.ipcMain.handle(IPC_CHANNELS.load_configuration_group, async (event) => {
    const configuration_groups_directory = await ensure_configuration_groups_directory(electron.app.getPath("userData"));
    return open_json_file(event, {
      title: "Load Copilot Configuration Group",
      default_path: configuration_groups_directory,
      load_file: (file_path) => read_json_file(file_path, parse_configuration_group_file),
      error_label: "load configuration group"
    });
  });
  electron.ipcMain.handle(IPC_CHANNELS.load_mcp_servers, async (event) => {
    return open_json_file(event, {
      title: "Load MCP Server Configuration",
      default_path: path.join(electron.app.getPath("home"), ".copilot", "mcp-config.json"),
      load_file: (file_path) => read_json_file(file_path, parse_mcp_servers_file),
      error_label: "load MCP server configuration"
    });
  });
  electron.ipcMain.handle(IPC_CHANNELS.save_prompt_list, async (event, prompts) => {
    if (!Array.isArray(prompts)) {
      throw new Error("Prompt list must be an array.");
    }
    const prompt_lists_directory = await ensure_prompt_lists_directory(electron.app.getPath("userData"));
    return save_json_file(event, {
      title: "Save Prompt List",
      default_path: path.join(prompt_lists_directory, PROMPT_LIST_FILE_NAME),
      value: create_prompt_list_file(prompts)
    });
  });
  electron.ipcMain.handle(IPC_CHANNELS.load_prompt_list, async (event) => {
    const prompt_lists_directory = await ensure_prompt_lists_directory(electron.app.getPath("userData"));
    return open_json_file(event, {
      title: "Load Prompt List",
      default_path: prompt_lists_directory,
      load_file: (file_path) => read_json_file(file_path, parse_prompt_list_file),
      error_label: "load prompt list"
    });
  });
  electron.ipcMain.handle(IPC_CHANNELS.open_run_report, async (event) => {
    const runs_directory = get_runs_directory(electron.app.getPath("userData"));
    await node_fs.promises.mkdir(runs_directory, { recursive: true });
    return open_json_file(event, {
      title: "Open Run Report",
      default_path: runs_directory,
      load_file: read_run_report,
      error_label: "open run report"
    });
  });
  electron.ipcMain.handle(IPC_CHANNELS.open_last_run_window, async (event, last_run) => {
    if (!last_run || !Array.isArray(last_run.prompt_runs)) {
      throw new Error("Run details are required to open the detached log window.");
    }
    const window_id = crypto.randomUUID();
    last_run_window_data.set(window_id, last_run);
    const parent_window = electron.BrowserWindow.fromWebContents(event.sender);
    create_last_run_window(parent_window, window_id);
  });
  electron.ipcMain.handle(IPC_CHANNELS.get_last_run_window_data, async (_event, window_id) => {
    if (typeof window_id !== "string" || window_id.length === 0) {
      return null;
    }
    return last_run_window_data.get(window_id) ?? null;
  });
  electron.ipcMain.handle(IPC_CHANNELS.run, async (_event, prompt, config) => {
    if (!copilot_client) {
      throw new Error("Create a Copilot connection before running a comparison.");
    }
    const run_id = crypto.randomUUID();
    const start_time = Date.now();
    const tool_calls = /* @__PURE__ */ new Map();
    const tool_reports = [];
    const session_config = { onPermissionRequest: approve_all, model: config.model_id };
    const custom_prompt = typeof config.custom_prompt === "string" && config.custom_prompt.trim().length > 0 ? config.custom_prompt : void 0;
    const config_dir = typeof config.config_dir === "string" && config.config_dir.trim().length > 0 ? config.config_dir.trim() : void 0;
    const working_directory = typeof config.working_directory === "string" && config.working_directory.trim().length > 0 ? config.working_directory.trim() : void 0;
    const skill_directories = Array.isArray(config.skill_directories) ? Array.from(new Set(config.skill_directories.map((directory) => directory.trim()).filter((directory) => directory.length > 0))) : void 0;
    const mcp_servers = normalize_mcp_servers_for_session(config.mcp_servers);
    session_config.availableTools = Array.from(new Set(config.tool_names));
    if (config.reasoning_effort) {
      session_config.reasoningEffort = config.reasoning_effort;
    }
    if (custom_prompt) {
      session_config.systemMessage = config.overwrite_default_prompt ? { mode: "replace", content: custom_prompt } : { mode: "append", content: custom_prompt };
    }
    if (mcp_servers) {
      session_config.mcpServers = mcp_servers;
    }
    if (config_dir) {
      session_config.configDir = config_dir;
    }
    if (working_directory) {
      session_config.workingDirectory = working_directory;
    }
    if (skill_directories && skill_directories.length > 0) {
      session_config.skillDirectories = skill_directories;
    }
    const session = await copilot_client.createSession(session_config);
    if (session === void 0) {
      throw new Error("Copilot did not create a session for this run.");
    }
    session.on("tool.execution_start", (toolEvent) => {
      const tool_start = {
        tool_name: toolEvent.data.toolName,
        start_time: Date.now(),
        parameters: to_json_value(toolEvent.data.arguments)
      };
      tool_calls.set(toolEvent.data.toolCallId, tool_start);
    });
    session.on("tool.execution_complete", (toolEvent) => {
      const tool_start = tool_calls.get(toolEvent.data.toolCallId);
      if (tool_start === void 0) return;
      tool_calls.delete(toolEvent.data.toolCallId);
      const response = {
        success: toolEvent.data.success
      };
      const result = to_json_value(toolEvent.data.result);
      if (result !== void 0) {
        response.result = result;
      }
      if (toolEvent.data.error) {
        response.error = {
          message: toolEvent.data.error.message,
          code: toolEvent.data.error.code
        };
      }
      tool_reports.push({
        tool_call_id: toolEvent.data.toolCallId,
        tool_name: tool_start.tool_name,
        start_time: tool_start.start_time,
        end_time: Date.now(),
        parameters: tool_start.parameters,
        response
      });
    });
    session.on("session.error", (sessionEvent) => {
      console.error(`Session Error: ${sessionEvent.data.message}`);
    });
    try {
      const response = await session.sendAndWait({ prompt }, 12e5);
      const response_content = response?.data.content.trim() || "";
      const tokens_used = response?.data.outputTokens || 0;
      const run_report = { id: run_id, prompt, config, response: response_content, tool_calls: tool_reports, tokens_used, start_time, end_time: Date.now() };
      await write_run_report(electron.app.getPath("userData"), run_report);
      const last_run = { tool_calls: tool_reports, response: response_content, tokens_used, duration: Date.now() - start_time };
      return last_run;
    } finally {
      session.disconnect();
    }
  });
  create_window();
}).catch((error) => {
  const message = error instanceof Error ? error.message : "Unexpected startup error.";
  console.error("Failed to initialize copilot-compare", error);
  electron.dialog.showErrorBox("copilot-compare failed to start", message);
  electron.app.quit();
});
//# sourceMappingURL=index.js.map
