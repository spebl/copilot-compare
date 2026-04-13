import { useEffect, useId, useState } from 'react';

import {
  SYSTEM_PROMPT_SECTION_IDS,
  type McpRemoteServerConfig,
  type McpServerConfig,
  type McpServers,
  type SystemPromptMode,
  type SystemPromptSectionId,
  type SystemPromptSectionOverrideAction,
  type SystemPromptSections,
  type ToolSpec,
} from './electron-contract';
import { ToolDropdown } from './ToolDropdown';
import type { ConfigurationAdditionalOptions, CopilotConfiguration } from './useCopilotCompareApp';

type PromptEditorMode = 'simple' | 'advanced';
type SimplePromptAction = 'default' | 'append' | 'replace';

type ConfigurationPromptModalProps = {
  config: CopilotConfiguration;
  tools: ToolSpec[];
  is_tool_menu_open: boolean;
  on_close: () => void;
  on_load_mcp_servers: () => Promise<McpServers | null>;
  on_toggle_tool_menu: (config_id: string) => void;
  on_close_tool_menu: () => void;
  on_save: (config_id: string, options: ConfigurationAdditionalOptions) => void;
};

const PROMPT_SECTION_DETAILS: Record<SystemPromptSectionId, { title: string; description: string; placeholder: string }> = {
  identity: {
    title: 'Identity',
    description: 'Defines the agent role and self-description.',
    placeholder: 'Adjust how the assistant identifies itself and frames its responsibilities.',
  },
  tone: {
    title: 'Tone',
    description: 'Controls voice, brevity, and collaboration style.',
    placeholder: 'Set the tone you want applied to responses in this configuration.',
  },
  tool_efficiency: {
    title: 'Tool Efficiency',
    description: 'Guides how aggressively the agent uses tools and parallelism.',
    placeholder: 'Add rules for when to search, read, batch, or avoid unnecessary tool calls.',
  },
  environment_context: {
    title: 'Environment Context',
    description: 'Adds assumptions and constraints about the local workspace and runtime.',
    placeholder: 'Describe any environment details the agent should always assume here.',
  },
  code_change_rules: {
    title: 'Code Change Rules',
    description: 'Sets boundaries for edits, refactors, and implementation behavior.',
    placeholder: 'Specify rules for how code should be changed in this setup.',
  },
  guidelines: {
    title: 'Guidelines',
    description: 'Captures broader coding and collaboration guidance.',
    placeholder: 'Add general guidelines that should shape the agent behavior.',
  },
  safety: {
    title: 'Safety',
    description: 'Adjusts allowed or disallowed behavior within safety boundaries.',
    placeholder: 'Add safe-handling instructions that should apply to this configuration.',
  },
  tool_instructions: {
    title: 'Tool Instructions',
    description: 'Overrides rules for how built-in tools should be used.',
    placeholder: 'Refine how the agent should use available tools in this config.',
  },
  custom_instructions: {
    title: 'Custom Instructions',
    description: 'Targets the custom-instructions section appended by the SDK.',
    placeholder: 'Add or replace custom instructions managed through the SDK prompt builder.',
  },
  last_instructions: {
    title: 'Last Instructions',
    description: 'Controls the final instruction block in the system prompt.',
    placeholder: 'Adjust the final high-priority instructions applied before generation.',
  },
};

const PROMPT_OVERRIDE_ACTION_OPTIONS: Array<{ value: SystemPromptSectionOverrideAction; label: string }> = [
  { value: 'append', label: 'Append' },
  { value: 'prepend', label: 'Prepend' },
  { value: 'replace', label: 'Replace' },
  { value: 'remove', label: 'Remove' },
];

const SIMPLE_PROMPT_ACTION_OPTIONS: Array<{ value: SimplePromptAction; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'append', label: 'Append' },
  { value: 'replace', label: 'Replace' },
];

function get_prompt_mode(config: CopilotConfiguration): SystemPromptMode {
  if (config.prompt_mode) {
    return config.prompt_mode;
  }

  if (config.prompt_sections && Object.keys(config.prompt_sections).length > 0) {
    return 'customize';
  }

  return config.prompt_mode ?? (config.overwrite_default_prompt ? 'replace' : 'append');
}

function get_prompt_editor_mode(config: CopilotConfiguration): PromptEditorMode {
  return get_prompt_mode(config) === 'customize' ? 'advanced' : 'simple';
}

function get_simple_prompt_action(config: CopilotConfiguration): SimplePromptAction {
  const prompt_mode = get_prompt_mode(config);
  if (prompt_mode === 'replace') {
    return config.custom_prompt?.trim().length ? 'replace' : 'default';
  }

  if (prompt_mode === 'append') {
    return config.custom_prompt?.trim().length ? 'append' : 'default';
  }

  return 'default';
}

function get_simple_prompt_placeholder(simple_prompt_action: SimplePromptAction) {
  if (simple_prompt_action === 'replace') {
    return 'Replace the default system prompt';
  }

  return 'Add instructions after the default system prompt';
}

function is_remote_mcp_server(server_config: McpServerConfig): server_config is McpRemoteServerConfig {
  return server_config.type === 'http' || server_config.type === 'sse';
}

function get_mcp_tool_summary(server_config: McpServerConfig) {
  if (server_config.tools === undefined || (server_config.tools.length === 1 && server_config.tools[0] === '*')) {
    return 'All tools';
  }

  if (server_config.tools.length === 0) {
    return 'No tools';
  }

  return `${server_config.tools.length} tool${server_config.tools.length === 1 ? '' : 's'}`;
}

function get_mcp_server_target(server_config: McpServerConfig) {
  if (is_remote_mcp_server(server_config)) {
    return server_config.url;
  }

  return [server_config.command, ...server_config.args].join(' ');
}

function get_mcp_server_meta(server_config: McpServerConfig) {
  const details = [get_mcp_tool_summary(server_config)];
  if (server_config.timeout !== undefined) {
    details.push(`${server_config.timeout}ms timeout`);
  }

  if (is_remote_mcp_server(server_config)) {
    const header_count = Object.keys(server_config.headers ?? {}).length;
    if (header_count > 0) {
      details.push(`${header_count} header${header_count === 1 ? '' : 's'}`);
    }
  } else {
    const env_count = Object.keys(server_config.env ?? {}).length;
    if (env_count > 0) {
      details.push(`${env_count} env var${env_count === 1 ? '' : 's'}`);
    }

    if (server_config.cwd) {
      details.push(server_config.cwd);
    }
  }

  return details.join(' | ');
}

export function ConfigurationPromptModal({
  config,
  tools,
  is_tool_menu_open,
  on_close,
  on_load_mcp_servers,
  on_toggle_tool_menu,
  on_close_tool_menu,
  on_save,
}: ConfigurationPromptModalProps) {
  const [tool_names, set_tool_names] = useState(config.tool_names);
  const [prompt_editor_mode, set_prompt_editor_mode] = useState<PromptEditorMode>(get_prompt_editor_mode(config));
  const [simple_prompt_action, set_simple_prompt_action] = useState<SimplePromptAction>(get_simple_prompt_action(config));
  const [custom_prompt, set_custom_prompt] = useState(config.custom_prompt ?? '');
  const [prompt_sections, set_prompt_sections] = useState<SystemPromptSections>(config.prompt_sections ?? {});
  const [config_dir, set_config_dir] = useState(config.config_dir ?? '');
  const [working_directory, set_working_directory] = useState(config.working_directory ?? '');
  const [skill_directories_input, set_skill_directories_input] = useState((config.skill_directories ?? []).join('\n'));
  const [mcp_servers, set_mcp_servers] = useState<McpServers | undefined>(config.mcp_servers);
  const [loading_mcp_servers, set_loading_mcp_servers] = useState(false);
  const title_id = useId();
  const prompt_id = useId();
  const config_dir_id = useId();
  const working_directory_id = useId();
  const skill_directories_id = useId();
  const mcp_server_entries = Object.entries(mcp_servers ?? {});
  const has_mcp_servers = mcp_server_entries.length > 0;
  const selected_tool_count = tool_names.length;
  const configured_prompt_sections = SYSTEM_PROMPT_SECTION_IDS.filter((section_id) => prompt_sections[section_id] !== undefined);

  useEffect(() => {
    set_tool_names(config.tool_names);
    set_prompt_editor_mode(get_prompt_editor_mode(config));
    set_simple_prompt_action(get_simple_prompt_action(config));
    set_custom_prompt(config.custom_prompt ?? '');
    set_prompt_sections(config.prompt_sections ?? {});
    set_config_dir(config.config_dir ?? '');
    set_working_directory(config.working_directory ?? '');
    set_skill_directories_input((config.skill_directories ?? []).join('\n'));
    set_mcp_servers(config.mcp_servers);
  }, [
    config.id,
    config.tool_names,
    config.prompt_mode,
    config.overwrite_default_prompt,
    config.custom_prompt,
    config.prompt_sections,
    config.config_dir,
    config.working_directory,
    config.skill_directories,
    config.mcp_servers,
  ]);

  useEffect(() => {
    const handle_key_down = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        on_close();
      }
    };

    window.addEventListener('keydown', handle_key_down);
    return () => {
      window.removeEventListener('keydown', handle_key_down);
    };
  }, [on_close]);

  const handle_load_mcp_servers = async () => {
    set_loading_mcp_servers(true);
    try {
      const loaded_mcp_servers = await on_load_mcp_servers();
      if (loaded_mcp_servers !== null) {
        set_mcp_servers(loaded_mcp_servers);
      }
    } finally {
      set_loading_mcp_servers(false);
    }
  };

  const handle_save = () => {
    const next_prompt_mode = prompt_editor_mode === 'advanced'
      ? 'customize'
      : simple_prompt_action === 'replace'
        ? 'replace'
        : 'append';

    on_save(config.id, {
      tool_names,
      prompt_mode: next_prompt_mode,
      custom_prompt: prompt_editor_mode === 'simple' && simple_prompt_action !== 'default' ? custom_prompt : undefined,
      prompt_sections: prompt_editor_mode === 'advanced' ? prompt_sections : undefined,
      config_dir,
      working_directory,
      skill_directories: skill_directories_input.split(/\r?\n/),
      mcp_servers,
    });
  };

  const handle_prompt_section_action_change = (
    section_id: SystemPromptSectionId,
    next_action: SystemPromptSectionOverrideAction | 'default',
  ) => {
    set_prompt_sections((current_prompt_sections) => {
      if (next_action === 'default') {
        const next_prompt_sections = { ...current_prompt_sections };
        delete next_prompt_sections[section_id];
        return next_prompt_sections;
      }

      const current_prompt_section = current_prompt_sections[section_id];
      return {
        ...current_prompt_sections,
        [section_id]: next_action === 'remove'
          ? { action: 'remove' }
          : { action: next_action, content: current_prompt_section?.content ?? '' },
      };
    });
  };

  const handle_prompt_section_content_change = (section_id: SystemPromptSectionId, next_content: string) => {
    set_prompt_sections((current_prompt_sections) => {
      const current_prompt_section = current_prompt_sections[section_id];
      if (!current_prompt_section || current_prompt_section.action === 'remove') {
        return current_prompt_sections;
      }

      return {
        ...current_prompt_sections,
        [section_id]: {
          ...current_prompt_section,
          content: next_content,
        },
      };
    });
  };

  const handle_toggle_tool = (config_id: string, tool_name: string) => {
    if (config_id !== config.id) {
      return;
    }

    set_tool_names((current_tool_names) => {
      const has_tool = current_tool_names.includes(tool_name);
      return has_tool
        ? current_tool_names.filter((name) => name !== tool_name)
        : [...current_tool_names, tool_name];
    });
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={on_close}>
      <section
        className="config-prompt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title_id}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="config-prompt-modal-header">
          <h2 className="config-prompt-modal-title" id={title_id}>Settings</h2>
          <div className="config-prompt-modal-toolbar">
            <button
              className="btn btn-small btn-modal-primary"
              onClick={handle_save}
              type="button"
              disabled={loading_mcp_servers}
            >
              Save
            </button>
            <button className="btn btn-small btn-modal-secondary" onClick={on_close} type="button">
              Close
            </button>
          </div>
        </div>

        <div className="config-prompt-modal-body">
          <section className="config-prompt-input-group config-prompt-section">
            <div className="config-prompt-input-header">
              <div className="config-prompt-copy">
                <p className="config-prompt-group-title">Prompt</p>
              </div>
              <button
                aria-label={`Prompt editor mode: ${prompt_editor_mode}. Click to switch modes.`}
                className="config-prompt-mode-group"
                onClick={() => set_prompt_editor_mode((current_mode) => current_mode === 'simple' ? 'advanced' : 'simple')}
                type="button"
              >
                <span className="config-prompt-mode-option" data-selected={prompt_editor_mode === 'simple'}>
                  <span className="config-prompt-mode-title">Simple</span>
                </span>
                <span className="config-prompt-mode-option" data-selected={prompt_editor_mode === 'advanced'}>
                  <span className="config-prompt-mode-title">Advanced</span>
                </span>
              </button>
            </div>
            {prompt_editor_mode === 'advanced' ? (
              <div className="config-prompt-sections" aria-label="System prompt sections">
                {SYSTEM_PROMPT_SECTION_IDS.map((section_id) => {
                  const section_details = PROMPT_SECTION_DETAILS[section_id];
                  const prompt_section = prompt_sections[section_id];
                  const selected_action = prompt_section?.action ?? 'default';

                  return (
                    <section className="config-prompt-section-card" key={section_id}>
                      <div className="config-prompt-section-header">
                        <div className="config-prompt-section-copy">
                          <h3 className="config-prompt-section-title">{section_details.title}</h3>
                          <p className="config-prompt-section-description">{section_details.description}</p>
                        </div>
                        <label className="config-prompt-section-select-field">
                          <span className="config-prompt-section-select-label">Action</span>
                          <select
                            className="config-prompt-section-select"
                            onChange={(event) => handle_prompt_section_action_change(section_id, event.target.value as SystemPromptSectionOverrideAction | 'default')}
                            value={selected_action}
                          >
                            <option value="default">No override</option>
                            {PROMPT_OVERRIDE_ACTION_OPTIONS.map((action_option) => (
                              <option key={action_option.value} value={action_option.value}>{action_option.label}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {selected_action === 'remove' ? (
                        <p className="config-prompt-section-note">This section will be removed from the generated system prompt.</p>
                      ) : selected_action === 'default' ? (
                        <p className="config-prompt-section-empty">Leave this section unchanged.</p>
                      ) : (
                        <textarea
                          className="config-prompt-input config-prompt-section-input"
                          onChange={(event) => handle_prompt_section_content_change(section_id, event.target.value)}
                          placeholder={section_details.placeholder}
                          rows={4}
                          value={prompt_section?.content ?? ''}
                        />
                      )}
                    </section>
                  );
                })}
              </div>
            ) : (
              <section className="config-prompt-section-card">
                <div className="config-prompt-section-header">
                  <div className="config-prompt-section-copy">
                    <h3 className="config-prompt-section-title">System Prompt</h3>
                    <p className="config-prompt-section-description">Append to or override the default system prompt.</p>
                  </div>
                  <label className="config-prompt-section-select-field" htmlFor={prompt_id}>
                    <span className="config-prompt-section-select-label">Action</span>
                    <select
                      className="config-prompt-section-select"
                      id={prompt_id}
                      onChange={(event) => set_simple_prompt_action(event.target.value as SimplePromptAction)}
                      value={simple_prompt_action}
                    >
                      {SIMPLE_PROMPT_ACTION_OPTIONS.map((action_option) => (
                        <option key={action_option.value} value={action_option.value}>{action_option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {simple_prompt_action === 'default' ? (
                  <p className="config-prompt-section-empty">Leave the system prompt unchanged.</p>
                ) : (
                  <textarea
                    autoFocus
                    aria-label="Prompt content"
                    className="config-prompt-input config-prompt-section-input"
                    onChange={(event) => set_custom_prompt(event.target.value)}
                    placeholder={get_simple_prompt_placeholder(simple_prompt_action)}
                    rows={4}
                    value={custom_prompt}
                  />
                )}
              </section>
            )}
          </section>

          <div className="config-tools-section">
            <div className="config-tools-section-header">
              <div className="config-tools-copy">
                <p className="config-prompt-group-title">Tools</p>
                <p className="config-tools-count">{selected_tool_count} selected</p>
              </div>
            </div>
            <ToolDropdown
              config_id={config.id}
              tools={tools}
              selected_tool_names={tool_names}
              disabled={loading_mcp_servers}
              is_open={is_tool_menu_open}
              on_toggle_open={on_toggle_tool_menu}
              on_close={on_close_tool_menu}
              on_toggle_tool={handle_toggle_tool}
            />
          </div>

          <div className="config-session-path-section">
            <p className="config-prompt-group-title">Paths</p>
            <div className="config-session-path-grid">
              <label className="config-session-path-field" htmlFor={working_directory_id}>
                <span className="config-prompt-group-title">Working directory</span>
                <input
                  className="config-session-path-input"
                  id={working_directory_id}
                  onChange={(event) => set_working_directory(event.target.value)}
                  placeholder="D:\\src\\my-project"
                  type="text"
                  value={working_directory}
                />
              </label>
              <label className="config-session-path-field" htmlFor={config_dir_id}>
                <span className="config-prompt-group-title">Config directory</span>
                <input
                  className="config-session-path-input"
                  id={config_dir_id}
                  onChange={(event) => set_config_dir(event.target.value)}
                  placeholder="C:\\Users\\name\\.config\\copilot"
                  type="text"
                  value={config_dir}
                />
              </label>
            </div>
            <label className="config-session-path-field" htmlFor={skill_directories_id}>
              <span className="config-prompt-group-title">Skill directories</span>
              <textarea
                className="config-prompt-input config-session-path-textarea"
                id={skill_directories_id}
                onChange={(event) => set_skill_directories_input(event.target.value)}
                placeholder="D:\\skills\\shared&#10;D:\\src\\my-project\\.github\\skills"
                rows={4}
                value={skill_directories_input}
              />
            </label>
          </div>

          <div className="config-mcp-section">
            <div className="config-mcp-section-header">
              <div className="config-mcp-copy">
                <p className="config-prompt-group-title">MCP</p>
                {has_mcp_servers ? <p className="config-mcp-count">{mcp_server_entries.length} loaded</p> : null}
              </div>
              <div className="config-mcp-actions">
                <button
                  className="btn btn-modal-primary config-mcp-import-button"
                  onClick={() => void handle_load_mcp_servers()}
                  type="button"
                  disabled={loading_mcp_servers}
                >
                  {loading_mcp_servers ? 'Loading…' : has_mcp_servers ? 'Replace' : 'Import'}
                </button>
                <button
                  className="btn btn-small btn-modal-secondary config-mcp-clear-button"
                  onClick={() => set_mcp_servers(undefined)}
                  type="button"
                  disabled={loading_mcp_servers || !has_mcp_servers}
                >
                  Clear
                </button>
              </div>
            </div>
            {has_mcp_servers ? (
              <ul className="config-mcp-server-list" aria-label="Imported MCP servers">
                {mcp_server_entries.map(([server_name, server_config]) => {
                  const server_type = (server_config.type ?? 'local').toUpperCase();

                  return (
                    <li className="config-mcp-server-card" key={server_name}>
                      <div className="config-mcp-server-header">
                        <span className="config-mcp-server-name">{server_name}</span>
                        <span className="config-mcp-server-type">{server_type}</span>
                      </div>
                      <p className="config-mcp-server-target">{get_mcp_server_target(server_config)}</p>
                      <p className="config-mcp-server-meta">{get_mcp_server_meta(server_config)}</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="config-mcp-empty">No MCP servers.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}