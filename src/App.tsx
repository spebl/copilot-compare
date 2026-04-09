import { ConfigurationPromptModal } from './ConfigurationPromptModal';
import { ConfigurationsSection } from './ConfigurationsSection';
import { PromptPanel } from './PromptPanel';
import { useCopilotCompareApp } from './useCopilotCompareApp';

export function App() {
  const { state, actions } = useCopilotCompareApp();
  const prompt_customization_config = state.editing_prompt_config_id
    ? state.copilot_configurations.find((config) => config.id === state.editing_prompt_config_id) ?? null
    : null;

  return (
    <div className="app-shell">
      <div className="app-toolbar" aria-label="App actions">
        <div className="app-toolbar-group app-toolbar-group-primary">
          <button className="btn btn-small btn-copilot" onClick={() => void actions.handle_new_copilot_connection()} disabled={state.copilot_connecting || state.copilot_connected}>
            {state.copilot_connected ? 'Connected' : state.copilot_connecting ? 'Connecting…' : 'Connect Copilot'}
          </button>
        </div>
        <div className="app-toolbar-group app-toolbar-group-secondary">
          <button className="btn btn-small btn-open-log" onClick={() => void actions.handle_open_run_file()}>
            Open Log
          </button>
          <button className="btn btn-small btn-run-all" onClick={() => void actions.handle_run_all()} disabled={!state.copilot_connected || !state.has_prompts_to_run || state.copilot_configurations.length === 0}>
            Run All
          </button>
        </div>
      </div>
      <main className="app-main">
        {state.error_message ? (
          <p className="error-banner" role="alert">
            {state.error_message}
          </p>
        ) : null}
        <PromptPanel
          prompt={state.prompt}
          saved_prompts={state.saved_prompts}
          has_prompt_draft={state.has_prompt_draft}
          has_saved_prompts={state.has_saved_prompts}
          has_running_configurations={state.has_running_configurations}
          on_prompt_change={actions.set_prompt}
          on_save_prompt={actions.handle_save_prompt}
          on_save_prompt_list={() => void actions.handle_save_prompt_list()}
          on_load_prompt_list={() => void actions.handle_load_prompt_list()}
          on_use_saved_prompt={actions.handle_use_saved_prompt}
          on_remove_saved_prompt={actions.handle_remove_saved_prompt}
        />
        <ConfigurationsSection
          copilot_configurations={state.copilot_configurations}
          models={state.models}
          running_config_ids={state.running_config_ids}
          copilot_connected={state.copilot_connected}
          has_prompts_to_run={state.has_prompts_to_run}
          has_running_configurations={state.has_running_configurations}
          on_add_config={actions.handle_add_config}
          on_remove_config={actions.handle_remove_config}
          on_update_config_model={actions.handle_update_config_model}
          on_update_config_effort={actions.handle_update_config_effort}
          on_save_group={() => void actions.handle_save_group()}
          on_load_group={() => void actions.handle_load_group()}
          on_view_last_run={(last_run) => void actions.handle_view_last_run(last_run)}
          on_run={(config) => void actions.handle_run(config)}
          on_more={actions.handle_more}
        />
      </main>
      {prompt_customization_config ? (
        <ConfigurationPromptModal
          config={prompt_customization_config}
          tools={Object.values(state.tools)}
          is_tool_menu_open={state.open_tool_menu_config_id === prompt_customization_config.id}
          on_close={actions.handle_close_prompt_customization}
          on_load_mcp_servers={actions.handle_load_mcp_servers}
          on_toggle_tool_menu={actions.handle_toggle_tool_menu}
          on_close_tool_menu={actions.handle_close_tool_menu}
          on_save={actions.handle_save_prompt_customization}
        />
      ) : null}
    </div>
  );
}