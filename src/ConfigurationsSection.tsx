import type { CopilotConfig, ModelSpec, ReasoningEffort } from './electron-contract';
import type { ConfigurationLastRun } from './prompt-runs';
import type { CopilotConfiguration } from './useCopilotCompareApp';

type ConfigurationsSectionProps = {
  copilot_configurations: CopilotConfiguration[];
  models: Record<string, ModelSpec>;
  running_config_ids: string[];
  copilot_connected: boolean;
  has_prompts_to_run: boolean;
  has_running_configurations: boolean;
  on_add_config: () => void;
  on_remove_config: (config_id: string) => void;
  on_update_config_model: (config_id: string, model_id: string) => void;
  on_update_config_effort: (config_id: string, effort: ReasoningEffort) => void;
  on_save_group: () => void;
  on_load_group: () => void;
  on_view_last_run: (last_run: ConfigurationLastRun | undefined) => void;
  on_run: (config: CopilotConfig) => void;
  on_more: (config_id: string) => void;
};

export function ConfigurationsSection({
  copilot_configurations,
  models,
  running_config_ids,
  copilot_connected,
  has_prompts_to_run,
  has_running_configurations,
  on_add_config,
  on_remove_config,
  on_update_config_model,
  on_update_config_effort,
  on_save_group,
  on_load_group,
  on_view_last_run,
  on_run,
  on_more,
}: ConfigurationsSectionProps) {
  const model_options = Object.values(models);
  const has_configurations = copilot_configurations.length > 0;

  return (
    <section className="app-section copilot-configurations" aria-labelledby="configs-title">
      <div className="section-header">
        <h2 className="section-title" id="configs-title">Configurations</h2>
        <div className="section-toolbar">
          <button className="btn btn-small btn-add-config" onClick={on_add_config} disabled={!copilot_connected}>
            Add Config
          </button>
          <button className="btn btn-small" onClick={on_save_group} disabled={!copilot_connected || !has_configurations}>
            Save Group
          </button>
          <button className="btn btn-small" onClick={on_load_group} disabled={!copilot_connected || has_running_configurations}>
            Load Group
          </button>
        </div>
      </div>
      <ul className="configs-list" aria-label="Copilot configurations">
        {!has_configurations ? (
          <li className="config-card config-card-empty">No configurations yet.</li>
        ) : (
          copilot_configurations.map((config) => {
            const model_spec = models[config.model_id];
            const is_running = running_config_ids.includes(config.id);
            const has_custom_prompt = config.custom_prompt?.trim().length ? true : false;
            const mcp_server_count = Object.keys(config.mcp_servers ?? {}).length;
            const supported_reasoning_efforts = model_spec?.supported_reasoning_efforts ?? [];
            const supports_reasoning_effort = supported_reasoning_efforts.length > 0;

            return (
              <li className={`config-card${is_running ? ' config-card-running' : ''}`} key={config.id} aria-busy={is_running} aria-disabled={is_running}>
                <div className='config-card-main'>
                  <select className="model-select" value={config.model_id} onChange={(event) => on_update_config_model(config.id, event.target.value)} disabled={is_running}>
                    {model_options.map((model) => (
                      <option key={model.id} value={model.id}>{model.id}</option>
                    ))}
                  </select>
                  {supports_reasoning_effort ? (
                    <select className="effort-select" value={config.reasoning_effort} onChange={(event) => on_update_config_effort(config.id, event.target.value as ReasoningEffort)} disabled={is_running}>
                      {supported_reasoning_efforts.map((effort) => (
                        <option key={effort} value={effort}>{effort}</option>
                      ))}
                    </select>
                  ) : null}
                  <span className="billing-mul">{model_spec?.billing_mul ? `${model_spec.billing_mul.toString()}x` : '0x'}</span>
                  <button className="btn btn-card btn-more" onClick={() => on_more(config.id)} disabled={is_running}>More</button>
                  {has_custom_prompt ? (
                    <span className={`config-prompt-badge ${config.overwrite_default_prompt ? 'config-prompt-badge-replace' : 'config-prompt-badge-append'}`}>
                      {config.overwrite_default_prompt ? 'Prompt: Replace' : 'Prompt: Append'}
                    </span>
                  ) : null}
                  {mcp_server_count > 0 ? (
                    <span className="config-mcp-badge">
                      {`MCP: ${mcp_server_count} server${mcp_server_count === 1 ? '' : 's'}`}
                    </span>
                  ) : null}
                </div>
                <div className="config-card-actions">
                  <button className="btn btn-card btn-last" onClick={() => on_view_last_run(config.last_run)} disabled={is_running || config.last_run === undefined}>Log</button>
                  <button className="btn btn-card btn-delete-config" onClick={() => on_remove_config(config.id)} disabled={is_running}>Delete</button>
                  <button className="btn btn-card btn-run" onClick={() => on_run(config)} disabled={is_running || !has_prompts_to_run}>Run</button>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}