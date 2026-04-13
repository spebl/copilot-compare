import { useRef, useState } from 'react';

import {
  SYSTEM_PROMPT_SECTION_IDS,
  type CopilotConfig,
  type LastRun,
  type McpServers,
  type ModelSpec,
  type ReasoningEffort,
  type RunReport,
  type SystemPromptMode,
  type SystemPromptSectionOverride,
  type SystemPromptSections,
  type ToolSpec,
} from './electron-contract';
import type { ConfigurationLastRun, PromptRunSummary } from './prompt-runs';

export type CopilotConfiguration = CopilotConfig & {
  last_run?: ConfigurationLastRun | undefined;
};

export type ConfigurationAdditionalOptions = Pick<
  CopilotConfig,
  'tool_names' | 'prompt_mode' | 'custom_prompt' | 'prompt_sections' | 'config_dir' | 'working_directory' | 'skill_directories' | 'mcp_servers'
>;

type CopilotCompareState = {
  prompt: string;
  saved_prompts: string[];
  error_message: string | null;
  copilot_connected: boolean;
  copilot_connecting: boolean;
  copilot_configurations: CopilotConfiguration[];
  models: Record<string, ModelSpec>;
  tools: Record<string, ToolSpec>;
  running_config_ids: string[];
  open_tool_menu_config_id: string | null;
  editing_prompt_config_id: string | null;
  has_prompt_draft: boolean;
  has_saved_prompts: boolean;
  has_prompts_to_run: boolean;
  has_running_configurations: boolean;
};

type CopilotCompareActions = {
  set_prompt: (prompt: string) => void;
  handle_new_copilot_connection: () => Promise<void>;
  handle_add_config: () => void;
  handle_remove_config: (config_id: string) => void;
  handle_run_all: () => Promise<void>;
  handle_run: (config: CopilotConfig) => Promise<void>;
  handle_update_config_model: (config_id: string, model_id: string) => void;
  handle_update_config_effort: (config_id: string, effort: ReasoningEffort) => void;
  handle_toggle_tool_menu: (config_id: string) => void;
  handle_close_tool_menu: () => void;
  handle_toggle_config_tool: (config_id: string, tool_name: string) => void;
  handle_close_prompt_customization: () => void;
  handle_save_prompt_customization: (config_id: string, options: ConfigurationAdditionalOptions) => void;
  handle_load_mcp_servers: () => Promise<McpServers | null>;
  handle_save_prompt: () => void;
  handle_use_saved_prompt: (saved_prompt: string) => void;
  handle_remove_saved_prompt: (saved_prompt: string) => void;
  handle_view_last_run: (last_run: ConfigurationLastRun | undefined) => Promise<void>;
  handle_more: (config_id: string) => void;
  handle_save_group: () => Promise<void>;
  handle_save_prompt_list: () => Promise<void>;
  handle_load_group: () => Promise<void>;
  handle_load_prompt_list: () => Promise<void>;
  handle_open_run_file: () => Promise<void>;
};

function get_error_message(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error.';
}

function get_runnable_prompts(saved_prompts: string[], draft_prompt: string) {
  if (saved_prompts.length > 0) {
    return saved_prompts;
  }

  const normalized_draft_prompt = draft_prompt.trim();
  return normalized_draft_prompt.length > 0 ? [normalized_draft_prompt] : [];
}

function create_configuration_last_run(prompt_runs: PromptRunSummary[]): ConfigurationLastRun {
  return {
    prompt_runs,
    tool_calls: prompt_runs.flatMap((prompt_run) => prompt_run.tool_calls),
    tokens_used: prompt_runs.reduce((total, prompt_run) => total + prompt_run.tokens_used, 0),
    duration: prompt_runs.reduce((total, prompt_run) => total + prompt_run.duration, 0),
  };
}

function create_configuration_last_run_from_report(run_report: RunReport): ConfigurationLastRun {
  const prompt = run_report.prompt?.trim().length ? run_report.prompt : 'Prompt not recorded in this saved run file.';
  return create_configuration_last_run([
    {
      prompt,
      response: run_report.response,
      tokens_used: run_report.tokens_used,
      duration: run_report.end_time - run_report.start_time,
      tool_calls: run_report.tool_calls,
    },
  ]);
}

function get_default_model_id(models: Record<string, ModelSpec>) {
  const model_ids = Object.keys(models);
  const backup_id = model_ids[0];
  if (!backup_id) {
    return null;
  }

  return models['gpt-5-mini'] ? 'gpt-5-mini' : backup_id;
}

function get_normalized_reasoning_effort(model_spec: ModelSpec | undefined, reasoning_effort: ReasoningEffort | undefined) {
  const supported_reasoning_efforts = model_spec?.supported_reasoning_efforts;
  if (!supported_reasoning_efforts || supported_reasoning_efforts.length === 0) {
    return undefined;
  }

  if (reasoning_effort && supported_reasoning_efforts.includes(reasoning_effort)) {
    return reasoning_effort;
  }

  return model_spec.default_reasoning_effort ?? supported_reasoning_efforts[0];
}

function get_available_tool_names(tools: Record<string, ToolSpec>) {
  return Object.values(tools).map((tool) => tool.name);
}

function filter_available_tool_names(tool_names: string[], available_tool_names: string[]) {
  const available_tool_name_set = new Set(available_tool_names);
  return Array.from(new Set(tool_names.filter((tool_name) => available_tool_name_set.has(tool_name))));
}

function normalize_optional_string(value: string | undefined) {
  const normalized_value = value?.trim();
  return normalized_value && normalized_value.length > 0 ? normalized_value : undefined;
}

function normalize_optional_prompt_string(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  return value.trim().length > 0 ? value : undefined;
}

function normalize_optional_string_list(values: string[] | undefined) {
  if (!values) {
    return undefined;
  }

  const normalized_values = Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)));
  return normalized_values.length > 0 ? normalized_values : undefined;
}

function normalize_prompt_sections(prompt_sections: SystemPromptSections | undefined) {
  if (!prompt_sections) {
    return undefined;
  }

  const normalized_prompt_sections: NonNullable<SystemPromptSections> = {};

  for (const section_id of SYSTEM_PROMPT_SECTION_IDS) {
    const prompt_section = prompt_sections[section_id];
    if (!prompt_section) {
      continue;
    }

    if (prompt_section.action === 'remove') {
      normalized_prompt_sections[section_id] = { action: 'remove' };
      continue;
    }

    if (prompt_section.action === 'replace') {
      normalized_prompt_sections[section_id] = { action: 'replace', content: prompt_section.content ?? '' };
      continue;
    }

    if (typeof prompt_section.content !== 'string' || prompt_section.content.trim().length === 0) {
      continue;
    }

    normalized_prompt_sections[section_id] = { action: prompt_section.action, content: prompt_section.content };
  }

  if (Object.keys(normalized_prompt_sections).length === 0) {
    return undefined;
  }

  return normalized_prompt_sections;
}

function get_prompt_mode(
  configuration: Pick<CopilotConfig, 'prompt_mode' | 'overwrite_default_prompt' | 'prompt_sections'>,
): SystemPromptMode {
  if (configuration.prompt_mode) {
    return configuration.prompt_mode;
  }

  if (configuration.prompt_sections && Object.keys(configuration.prompt_sections).length > 0) {
    return 'customize';
  }

  return configuration.overwrite_default_prompt ? 'replace' : 'append';
}

function normalize_loaded_configurations(
  configurations: CopilotConfig[],
  models: Record<string, ModelSpec>,
  tools: Record<string, ToolSpec>,
): CopilotConfiguration[] {
  const default_model_id = get_default_model_id(models);
  if (!default_model_id) {
    throw new Error('Create a Copilot connection before loading configurations.');
  }

  const available_tool_names = get_available_tool_names(tools);
  const seen_ids = new Set<string>();

  return configurations.map((configuration) => {
    const next_id = configuration.id && !seen_ids.has(configuration.id) ? configuration.id : crypto.randomUUID();
    seen_ids.add(next_id);

    const model_id = models[configuration.model_id] ? configuration.model_id : default_model_id;
    const tool_names = filter_available_tool_names(configuration.tool_names, available_tool_names);
    const prompt_sections = normalize_prompt_sections(configuration.prompt_sections);
    const prompt_mode = get_prompt_mode(configuration);

    return {
      id: next_id,
      model_id,
      reasoning_effort: get_normalized_reasoning_effort(models[model_id], configuration.reasoning_effort),
      tool_names,
      prompt_mode,
      overwrite_default_prompt: prompt_mode === 'replace',
      custom_prompt: configuration.custom_prompt,
      prompt_sections,
      config_dir: configuration.config_dir,
      working_directory: configuration.working_directory,
      skill_directories: configuration.skill_directories,
      mcp_servers: configuration.mcp_servers,
    };
  });
}

export function useCopilotCompareApp(): { state: CopilotCompareState; actions: CopilotCompareActions } {
  const [prompt, set_prompt] = useState('');
  const [saved_prompts, set_saved_prompts] = useState<string[]>([]);
  const [error_message, set_error_message] = useState<string | null>(null);
  const [copilot_connected, set_copilot_connected] = useState(false);
  const [copilot_connecting, set_copilot_connecting] = useState(false);
  const [copilot_configurations, set_copilot_configurations] = useState<CopilotConfiguration[]>([]);
  const [models, set_models] = useState<Record<string, ModelSpec>>({});
  const [tools, set_tools] = useState<Record<string, ToolSpec>>({});
  const [running_config_ids, set_running_config_ids] = useState<string[]>([]);
  const [open_tool_menu_config_id, set_open_tool_menu_config_id] = useState<string | null>(null);
  const [editing_prompt_config_id, set_editing_prompt_config_id] = useState<string | null>(null);
  const running_config_ids_ref = useRef(new Set<string>());
  const has_prompt_draft = prompt.trim().length > 0;
  const has_saved_prompts = saved_prompts.length > 0;
  const prompts_to_run = get_runnable_prompts(saved_prompts, prompt);
  const has_prompts_to_run = prompts_to_run.length > 0;
  const has_running_configurations = running_config_ids.length > 0;

  const update_configuration = (
    config_id: string,
    update_config: (config: CopilotConfiguration) => CopilotConfiguration,
  ) => {
    set_copilot_configurations((configs) =>
      configs.map((config) => (config.id === config_id ? update_config(config) : config))
    );
  };

  const start_configuration_run = (config_id: string) => {
    if (running_config_ids_ref.current.has(config_id)) {
      return false;
    }

    running_config_ids_ref.current.add(config_id);
    set_running_config_ids(Array.from(running_config_ids_ref.current));
    return true;
  };

  const finish_configuration_run = (config_id: string) => {
    running_config_ids_ref.current.delete(config_id);
    set_running_config_ids(Array.from(running_config_ids_ref.current));
  };

  const run_configuration = async (config: CopilotConfig) => {
    if (!start_configuration_run(config.id)) {
      return;
    }

    const next_prompts_to_run = get_runnable_prompts(saved_prompts, prompt);
    if (next_prompts_to_run.length === 0) {
      finish_configuration_run(config.id);
      set_error_message('Add or save at least one prompt before running a comparison.');
      return;
    }

    try {
      const prompt_runs: PromptRunSummary[] = [];
      for (const prompt_to_run of next_prompts_to_run) {
        const prompt_run: LastRun = await window.electronAPI.run(prompt_to_run, config);
        prompt_runs.push({ ...prompt_run, prompt: prompt_to_run });
      }

      const last_run = create_configuration_last_run(prompt_runs);
      set_error_message(null);
      update_configuration(config.id, (current_config) => ({ ...current_config, last_run }));
    } catch (error) {
      set_error_message(get_error_message(error));
    } finally {
      finish_configuration_run(config.id);
    }
  };

  const handle_new_copilot_connection = async () => {
    set_copilot_connecting(true);
    try {
      const resources = await window.electronAPI.new_copilot_connection();
      set_error_message(null);
      set_models(Object.fromEntries(resources.models.map((model) => [model.id, model])));
      set_tools(Object.fromEntries(resources.tools.map((tool) => [tool.name, tool])));
      const available_tool_names = resources.tools.map((tool) => tool.name);
      set_copilot_configurations((configs) =>
        configs.map((config) => ({
          ...config,
          tool_names: filter_available_tool_names(config.tool_names, available_tool_names),
        }))
      );
      set_copilot_connected(true);
    } catch (error) {
      set_error_message(get_error_message(error));
    } finally {
      set_copilot_connecting(false);
    }
  };

  const handle_add_config = () => {
    const default_model_id = get_default_model_id(models);
    if (!default_model_id) {
      return;
    }

    const available_tool_names = get_available_tool_names(tools);
    set_copilot_configurations((configs) => [
      ...configs,
      {
        id: crypto.randomUUID(),
        model_id: default_model_id,
        tool_names: available_tool_names,
        prompt_mode: 'append',
        overwrite_default_prompt: false,
        custom_prompt: undefined,
        prompt_sections: undefined,
        config_dir: undefined,
        working_directory: undefined,
        skill_directories: undefined,
        mcp_servers: undefined,
      },
    ]);
  };

  const handle_remove_config = (config_id: string) => {
    if (running_config_ids_ref.current.has(config_id)) {
      set_error_message('Wait for the running comparison to finish before removing this configuration.');
      return;
    }

    set_copilot_configurations((configs) => configs.filter((config) => config.id !== config_id));
    set_open_tool_menu_config_id((current_config_id) => (current_config_id === config_id ? null : current_config_id));
    set_editing_prompt_config_id((current_config_id) => (current_config_id === config_id ? null : current_config_id));
    set_error_message(null);
  };

  const handle_run_all = async () => {
    if (!has_prompts_to_run) {
      set_error_message('Add or save at least one prompt before running a comparison.');
      return;
    }

    const pending_configurations = copilot_configurations.filter((config) => !running_config_ids_ref.current.has(config.id));
    if (pending_configurations.length === 0) {
      return;
    }

    await Promise.all(pending_configurations.map((config) => run_configuration(config)));
  };

  const handle_run = async (config: CopilotConfig) => {
    if (running_config_ids.includes(config.id) || !has_prompts_to_run) {
      if (!has_prompts_to_run) {
        set_error_message('Add or save at least one prompt before running a comparison.');
      }
      return;
    }

    await run_configuration(config);
  };

  const handle_update_config_model = (config_id: string, model_id: string) => {
    if (running_config_ids.includes(config_id)) {
      return;
    }

    update_configuration(config_id, (config) => ({
      ...config,
      model_id,
      reasoning_effort: models[model_id]?.default_reasoning_effort,
    }));
  };

  const handle_update_config_effort = (config_id: string, effort: ReasoningEffort) => {
    if (running_config_ids.includes(config_id)) {
      return;
    }

    update_configuration(config_id, (config) => ({ ...config, reasoning_effort: effort }));
  };

  const handle_toggle_tool_menu = (config_id: string) => {
    set_open_tool_menu_config_id((current_config_id) => (current_config_id === config_id ? null : config_id));
  };

  const handle_close_tool_menu = () => {
    set_open_tool_menu_config_id(null);
  };

  const handle_toggle_config_tool = (config_id: string, tool_name: string) => {
    if (running_config_ids.includes(config_id)) {
      return;
    }

    update_configuration(config_id, (config) => {
      const has_tool = config.tool_names.includes(tool_name);
      return {
        ...config,
        tool_names: has_tool
          ? config.tool_names.filter((name) => name !== tool_name)
          : [...config.tool_names, tool_name],
      };
    });
  };

  const handle_close_prompt_customization = () => {
    set_open_tool_menu_config_id(null);
    set_editing_prompt_config_id(null);
  };

  const handle_save_prompt_customization = (config_id: string, options: ConfigurationAdditionalOptions) => {
    if (running_config_ids_ref.current.has(config_id)) {
      set_error_message('Wait for the running comparison to finish before updating this configuration.');
      return;
    }

    const normalized_custom_prompt = normalize_optional_prompt_string(options.custom_prompt);
    const normalized_prompt_sections = normalize_prompt_sections(options.prompt_sections);
    const normalized_config_dir = normalize_optional_string(options.config_dir);
    const normalized_working_directory = normalize_optional_string(options.working_directory);
    const normalized_skill_directories = normalize_optional_string_list(options.skill_directories);
    const normalized_mcp_servers = options.mcp_servers && Object.keys(options.mcp_servers).length > 0 ? options.mcp_servers : undefined;
    const normalized_tool_names = filter_available_tool_names(options.tool_names, get_available_tool_names(tools));
    const prompt_mode = options.prompt_mode ?? (normalized_prompt_sections ? 'customize' : 'append');
    update_configuration(config_id, (config) => ({
      ...config,
      tool_names: normalized_tool_names,
      prompt_mode,
      overwrite_default_prompt: prompt_mode === 'replace',
      custom_prompt: normalized_custom_prompt,
      prompt_sections: normalized_prompt_sections,
      config_dir: normalized_config_dir,
      working_directory: normalized_working_directory,
      skill_directories: normalized_skill_directories,
      mcp_servers: normalized_mcp_servers,
    }));
    set_open_tool_menu_config_id(null);
    set_editing_prompt_config_id(null);
    set_error_message(null);
  };

  const handle_load_mcp_servers = async () => {
    try {
      const loaded_mcp_servers = await window.electronAPI.load_mcp_servers();
      if (loaded_mcp_servers !== null) {
        set_error_message(null);
      }

      return loaded_mcp_servers;
    } catch (error) {
      set_error_message(get_error_message(error));
      return null;
    }
  };

  const handle_save_prompt = () => {
    const normalized_prompt = prompt.trim();
    if (normalized_prompt.length === 0) {
      set_error_message('Enter a prompt before saving it.');
      return;
    }

    if (saved_prompts.includes(normalized_prompt)) {
      set_error_message('That prompt is already saved in the list.');
      return;
    }

    set_saved_prompts((current_prompts) => [...current_prompts, normalized_prompt]);
    set_prompt('');
    set_error_message(null);
  };

  const handle_use_saved_prompt = (saved_prompt: string) => {
    set_prompt(saved_prompt);
    set_error_message(null);
  };

  const handle_remove_saved_prompt = (saved_prompt: string) => {
    set_saved_prompts((current_prompts) => current_prompts.filter((prompt_value) => prompt_value !== saved_prompt));
    set_error_message(null);
  };

  const handle_view_last_run = async (last_run: ConfigurationLastRun | undefined) => {
    if (last_run === undefined) {
      return;
    }

    try {
      await window.electronAPI.open_last_run_window(last_run);
      set_error_message(null);
    } catch (error) {
      set_error_message(get_error_message(error));
    }
  };

  const handle_more = (config_id: string) => {
    if (running_config_ids_ref.current.has(config_id)) {
      return;
    }

    set_open_tool_menu_config_id(null);
    set_editing_prompt_config_id(config_id);
    set_error_message(null);
  };

  const handle_save_group = async () => {
    try {
      const saved_file_path = await window.electronAPI.save_configuration_group(
        copilot_configurations.map(({ last_run, ...config }) => config)
      );

      if (saved_file_path !== null) {
        set_error_message(null);
      }
    } catch (error) {
      set_error_message(get_error_message(error));
    }
  };

  const handle_save_prompt_list = async () => {
    try {
      const saved_file_path = await window.electronAPI.save_prompt_list(saved_prompts);
      if (saved_file_path !== null) {
        set_error_message(null);
      }
    } catch (error) {
      set_error_message(get_error_message(error));
    }
  };

  const handle_load_group = async () => {
    if (has_running_configurations) {
      set_error_message('Wait for running comparisons to finish before loading a configuration group.');
      return;
    }

    try {
      const loaded_configurations = await window.electronAPI.load_configuration_group();
      if (loaded_configurations === null) {
        return;
      }

      set_copilot_configurations(normalize_loaded_configurations(loaded_configurations, models, tools));
      set_open_tool_menu_config_id(null);
      set_editing_prompt_config_id(null);
      set_error_message(null);
    } catch (error) {
      set_error_message(get_error_message(error));
    }
  };

  const handle_load_prompt_list = async () => {
    if (has_running_configurations) {
      set_error_message('Wait for running comparisons to finish before loading a prompt list.');
      return;
    }

    try {
      const loaded_prompts = await window.electronAPI.load_prompt_list();
      if (loaded_prompts === null) {
        return;
      }

      set_saved_prompts(loaded_prompts);
      set_error_message(null);
    } catch (error) {
      set_error_message(get_error_message(error));
    }
  };

  const handle_open_run_file = async () => {
    try {
      const run_report = await window.electronAPI.open_run_report();
      if (run_report === null) {
        return;
      }

      await window.electronAPI.open_last_run_window(create_configuration_last_run_from_report(run_report));
      set_error_message(null);
    } catch (error) {
      set_error_message(get_error_message(error));
    }
  };

  return {
    state: {
      prompt,
      saved_prompts,
      error_message,
      copilot_connected,
      copilot_connecting,
      copilot_configurations,
      models,
      tools,
      running_config_ids,
      open_tool_menu_config_id,
      editing_prompt_config_id,
      has_prompt_draft,
      has_saved_prompts,
      has_prompts_to_run,
      has_running_configurations,
    },
    actions: {
      set_prompt,
      handle_new_copilot_connection,
      handle_add_config,
      handle_remove_config,
      handle_run_all,
      handle_run,
      handle_update_config_model,
      handle_update_config_effort,
      handle_toggle_tool_menu,
      handle_close_tool_menu,
      handle_toggle_config_tool,
      handle_close_prompt_customization,
      handle_save_prompt_customization,
      handle_load_mcp_servers,
      handle_save_prompt,
      handle_use_saved_prompt,
      handle_remove_saved_prompt,
      handle_view_last_run,
      handle_more,
      handle_save_group,
      handle_save_prompt_list,
      handle_load_group,
      handle_load_prompt_list,
      handle_open_run_file,
    },
  };
}