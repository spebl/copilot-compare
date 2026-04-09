import { useEffect, useId, useState } from 'react';

import type { McpRemoteServerConfig, McpServerConfig, McpServers, ToolSpec } from './electron-contract';
import { ToolDropdown } from './ToolDropdown';
import type { ConfigurationAdditionalOptions, CopilotConfiguration } from './useCopilotCompareApp';

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
  const [overwrite_default_prompt, set_overwrite_default_prompt] = useState(config.overwrite_default_prompt);
  const [custom_prompt, set_custom_prompt] = useState(config.custom_prompt ?? '');
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

  useEffect(() => {
    set_tool_names(config.tool_names);
    set_overwrite_default_prompt(config.overwrite_default_prompt);
    set_custom_prompt(config.custom_prompt ?? '');
    set_config_dir(config.config_dir ?? '');
    set_working_directory(config.working_directory ?? '');
    set_skill_directories_input((config.skill_directories ?? []).join('\n'));
    set_mcp_servers(config.mcp_servers);
  }, [
    config.id,
    config.tool_names,
    config.overwrite_default_prompt,
    config.custom_prompt,
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
    on_save(config.id, {
      tool_names,
      overwrite_default_prompt,
      custom_prompt,
      config_dir,
      working_directory,
      skill_directories: skill_directories_input.split(/\r?\n/),
      mcp_servers,
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
          <div className="config-prompt-input-group">
          <div className="config-prompt-input-header">
            <label className="config-prompt-group-title" htmlFor={prompt_id}>
              Prompt
            </label>
            <fieldset className="config-prompt-mode-group" aria-label="Mode">
              <legend className="config-prompt-mode-legend">Mode</legend>
              <label className="config-prompt-mode-option" data-selected={!overwrite_default_prompt}>
                <input
                  checked={!overwrite_default_prompt}
                  name={`prompt-mode-${config.id}`}
                  onChange={() => set_overwrite_default_prompt(false)}
                  type="radio"
                />
                <span className="config-prompt-mode-title">Append</span>
              </label>
              <label className="config-prompt-mode-option" data-selected={overwrite_default_prompt}>
                <input
                  checked={overwrite_default_prompt}
                  name={`prompt-mode-${config.id}`}
                  onChange={() => set_overwrite_default_prompt(true)}
                  type="radio"
                />
                <span className="config-prompt-mode-title">Overwrite</span>
              </label>
            </fieldset>
          </div>
          <textarea
            autoFocus
            className="config-prompt-input"
            id={prompt_id}
            onChange={(event) => set_custom_prompt(event.target.value)}
            placeholder="Optional prompt"
            rows={6}
            value={custom_prompt}
          />
          </div>

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