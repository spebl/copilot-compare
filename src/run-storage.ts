import path from "node:path";
import { promises as fs } from "node:fs";

import type { JsonValue, RunReport, ToolCallResponse } from "./electron-contract";
import { parse_mcp_servers } from "./mcp-server-config";

const RUN_REPORTS_DIRECTORY_NAME = "runs";

function format_filename_date_part(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

function sanitize_filename_part(value: string) {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "unknown";
}

function get_run_report_file_name(run_report: RunReport) {
  const timestamp = format_filename_date_part(run_report.start_time);
  const model = sanitize_filename_part(run_report.config.model_id);
  const reasoning = sanitize_filename_part(run_report.config.reasoning_effort ?? "none");
  const id = sanitize_filename_part(run_report.id);
  return `${timestamp}__${model}__${reasoning}__${id}.json`;
}

export function get_runs_directory(user_data_path: string) {
  return path.join(user_data_path, RUN_REPORTS_DIRECTORY_NAME);
}

export async function write_run_report(user_data_path: string, run_report: RunReport) {
  const report_path = path.join(get_runs_directory(user_data_path), get_run_report_file_name(run_report));
  await fs.mkdir(path.dirname(report_path), { recursive: true });
  await fs.writeFile(report_path, JSON.stringify(run_report, null, 2), "utf8");
  return report_path;
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function is_json_value(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(is_json_value);
  }

  if (is_record(value)) {
    return Object.values(value).every(is_json_value);
  }

  return false;
}

function is_string_array(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function is_finite_number(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parse_tool_call_response(value: unknown, index: number): ToolCallResponse | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!is_record(value)) {
    throw new Error(`Tool call ${index + 1} has an invalid response payload.`);
  }

  if (typeof value.success !== "boolean") {
    throw new Error(`Tool call ${index + 1} response is missing a valid success flag.`);
  }

  if (value.result !== undefined && !is_json_value(value.result)) {
    throw new Error(`Tool call ${index + 1} response has an invalid result payload.`);
  }

  const error = value.error;
  let parsed_error: ToolCallResponse["error"];
  if (error !== undefined) {
    if (!is_record(error) || typeof error.message !== "string") {
      throw new Error(`Tool call ${index + 1} response has an invalid error payload.`);
    }

    if (error.code !== undefined && typeof error.code !== "string") {
      throw new Error(`Tool call ${index + 1} response has an invalid error code.`);
    }

    parsed_error = {
      message: error.message,
      code: error.code,
    };
  }

  return {
    success: value.success,
    result: value.result as JsonValue | undefined,
    error: parsed_error,
  };
}

export function parse_run_report(value: unknown): RunReport {
  if (!is_record(value)) {
    throw new Error("Run report must be a JSON object.");
  }

  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    throw new Error("Run report is missing a valid id.");
  }

  if (value.prompt !== undefined && typeof value.prompt !== "string") {
    throw new Error("Run report has an invalid prompt.");
  }

  const config = value.config;
  if (!is_record(config)) {
    throw new Error("Run report is missing a valid config object.");
  }

  if (typeof config.id !== "string" || config.id.trim().length === 0) {
    throw new Error("Run report config is missing a valid id.");
  }

  if (typeof config.model_id !== "string" || config.model_id.trim().length === 0) {
    throw new Error("Run report config is missing a valid model_id.");
  }

  if (config.reasoning_effort !== undefined && typeof config.reasoning_effort !== "string") {
    throw new Error("Run report config has an invalid reasoning_effort.");
  }

  if (!is_string_array(config.tool_names)) {
    throw new Error("Run report config has an invalid tool_names list.");
  }

  if (!Array.isArray(value.tool_calls)) {
    throw new Error("Run report is missing a valid tool_calls list.");
  }

  const tool_calls = value.tool_calls.map((tool_call, index) => {
    if (!is_record(tool_call)) {
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

    if (tool_call.parameters !== undefined && !is_json_value(tool_call.parameters)) {
      throw new Error(`Tool call ${index + 1} has an invalid parameters payload.`);
    }

    const response = parse_tool_call_response(tool_call.response, index);

    return {
      tool_call_id: tool_call.tool_call_id,
      tool_name: tool_call.tool_name,
      start_time: tool_call.start_time,
      end_time: tool_call.end_time,
      parameters: tool_call.parameters as JsonValue | undefined,
      response,
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
      reasoning_effort: config.reasoning_effort as RunReport["config"]["reasoning_effort"],
      tool_names: config.tool_names,
      overwrite_default_prompt: typeof config.overwrite_default_prompt === "boolean" ? config.overwrite_default_prompt : false,
      custom_prompt: typeof config.custom_prompt === "string" ? config.custom_prompt : undefined,
      mcp_servers: config.mcp_servers === undefined ? undefined : parse_mcp_servers(config.mcp_servers, "Run report config mcp_servers"),
    },
    tool_calls,
    response: value.response,
    tokens_used: value.tokens_used,
    start_time: value.start_time,
    end_time: value.end_time,
  };
}

export async function read_run_report(file_path: string) {
  const file_contents = await fs.readFile(file_path, "utf8");
  return parse_run_report(JSON.parse(file_contents));
}