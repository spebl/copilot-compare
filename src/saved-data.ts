import path from "node:path";
import { promises as fs } from "node:fs";

import { REASONING_EFFORTS, type CopilotConfig, type ReasoningEffort } from "./electron-contract";
import { parse_mcp_servers } from "./mcp-server-config";

const CONFIGURATION_GROUP_FILE_VERSION = 1;
export const CONFIGURATION_GROUP_FILE_NAME = "copilot-configurations.json";
const CONFIGURATION_GROUPS_DIRECTORY_NAME = "configuration-groups";
const PROMPT_LIST_FILE_VERSION = 1;
export const PROMPT_LIST_FILE_NAME = "copilot-prompts.json";
const PROMPT_LISTS_DIRECTORY_NAME = "prompt-lists";

type ConfigurationGroupFile = {
  version: number;
  configurations: CopilotConfig[];
};

type PromptListFile = {
  version: number;
  prompts: string[];
};

function get_user_data_directory(user_data_path: string, directory_name: string) {
  return path.join(user_data_path, directory_name);
}

async function ensure_user_data_directory(user_data_path: string, directory_name: string) {
  const directory_path = get_user_data_directory(user_data_path, directory_name);
  await fs.mkdir(directory_path, { recursive: true });
  return directory_path;
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function is_reasoning_effort(value: unknown): value is ReasoningEffort {
  return typeof value === "string" && REASONING_EFFORTS.includes(value as ReasoningEffort);
}

function parse_optional_string(value: unknown, error_message: string) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  throw new Error(error_message);
}

function parse_optional_string_list(value: unknown, error_message: string) {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return Array.from(new Set(value));
  }

  throw new Error(error_message);
}

function parse_copilot_config(value: unknown, index: number): CopilotConfig {
  if (!is_record(value)) {
    throw new Error(`Configuration ${index + 1} must be an object.`);
  }

  if (typeof value.model_id !== "string" || value.model_id.trim().length === 0) {
    throw new Error(`Configuration ${index + 1} is missing a valid model_id.`);
  }

  const id = typeof value.id === "string" && value.id.trim().length > 0 ? value.id : crypto.randomUUID();
  const reasoning_effort = value.reasoning_effort === undefined
    ? undefined
    : is_reasoning_effort(value.reasoning_effort)
      ? value.reasoning_effort
      : (() => {
          throw new Error(`Configuration ${index + 1} has an unsupported reasoning_effort.`);
        })();
  const tool_names = value.tool_names === undefined
    ? []
    : Array.isArray(value.tool_names) && value.tool_names.every((toolName) => typeof toolName === "string")
      ? Array.from(new Set(value.tool_names))
      : (() => {
          throw new Error(`Configuration ${index + 1} has an invalid tool_names list.`);
        })();
  const overwrite_default_prompt = value.overwrite_default_prompt === undefined
    ? false
    : typeof value.overwrite_default_prompt === "boolean"
      ? value.overwrite_default_prompt
      : (() => {
          throw new Error(`Configuration ${index + 1} has an invalid overwrite_default_prompt value.`);
        })();
  const custom_prompt = value.custom_prompt === undefined
    ? undefined
    : typeof value.custom_prompt === "string"
      ? value.custom_prompt
      : (() => {
          throw new Error(`Configuration ${index + 1} has an invalid custom_prompt value.`);
        })();
  const config_dir = parse_optional_string(
    value.config_dir,
    `Configuration ${index + 1} has an invalid config_dir value.`,
  );
  const working_directory = parse_optional_string(
    value.working_directory,
    `Configuration ${index + 1} has an invalid working_directory value.`,
  );
  const skill_directories = parse_optional_string_list(
    value.skill_directories,
    `Configuration ${index + 1} has an invalid skill_directories value.`,
  );
  const mcp_servers = value.mcp_servers === undefined
    ? undefined
    : parse_mcp_servers(value.mcp_servers, `Configuration ${index + 1} mcp_servers`);

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
    mcp_servers,
  };
}

function parse_prompt_value(value: unknown, index: number) {
  if (typeof value !== "string") {
    throw new Error(`Prompt ${index + 1} must be a string.`);
  }

  const prompt = value.trim();
  if (prompt.length === 0) {
    throw new Error(`Prompt ${index + 1} must not be empty.`);
  }

  return prompt;
}

function parse_versioned_list_file<T>(
  value: unknown,
  {
    file_label,
    version,
    property_name,
    parse_item,
  }: {
    file_label: string;
    version: number;
    property_name: string;
    parse_item: (item: unknown, index: number) => T;
  },
) {
  if (Array.isArray(value)) {
    return value.map(parse_item);
  }

  if (!is_record(value)) {
    throw new Error(`${file_label} file must be a JSON object or array.`);
  }

  if (value.version !== undefined && value.version !== version) {
    throw new Error(`Unsupported ${file_label.toLowerCase()} version: ${String(value.version)}.`);
  }

  const items = value[property_name];
  if (!Array.isArray(items)) {
    throw new Error(`${file_label} file is missing a ${property_name} array.`);
  }

  return items.map(parse_item);
}

export function get_configuration_groups_directory(user_data_path: string) {
  return get_user_data_directory(user_data_path, CONFIGURATION_GROUPS_DIRECTORY_NAME);
}

export async function ensure_configuration_groups_directory(user_data_path: string) {
  return ensure_user_data_directory(user_data_path, CONFIGURATION_GROUPS_DIRECTORY_NAME);
}

export function create_configuration_group_file(configurations: CopilotConfig[]): ConfigurationGroupFile {
  return {
    version: CONFIGURATION_GROUP_FILE_VERSION,
    configurations,
  };
}

export function parse_configuration_group_file(value: unknown): CopilotConfig[] {
  return parse_versioned_list_file(value, {
    file_label: "Configuration group",
    version: CONFIGURATION_GROUP_FILE_VERSION,
    property_name: "configurations",
    parse_item: parse_copilot_config,
  });
}

export function get_prompt_lists_directory(user_data_path: string) {
  return get_user_data_directory(user_data_path, PROMPT_LISTS_DIRECTORY_NAME);
}

export async function ensure_prompt_lists_directory(user_data_path: string) {
  return ensure_user_data_directory(user_data_path, PROMPT_LISTS_DIRECTORY_NAME);
}

export function create_prompt_list_file(prompts: string[]): PromptListFile {
  return {
    version: PROMPT_LIST_FILE_VERSION,
    prompts: Array.from(new Set(prompts.map(parse_prompt_value))),
  };
}

export function parse_prompt_list_file(value: unknown): string[] {
  const prompts = parse_versioned_list_file(value, {
    file_label: "Prompt list",
    version: PROMPT_LIST_FILE_VERSION,
    property_name: "prompts",
    parse_item: parse_prompt_value,
  });

  return Array.from(new Set(prompts));
}