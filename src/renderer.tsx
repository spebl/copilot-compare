import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import type { CopilotConfig, CopilotResources, ElectronAPI, LastRun, ModelSpec, ReasoningEffort, ToolSpec } from './electron-contract';
import { LastRunModal } from './LastRunModal';
import { ToolDropdown } from './ToolDropdown';

type CopilotConfiguration = CopilotConfig & {
  last_run?: LastRun | undefined;
};

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error.';
}

function App() {
  const [prompt, setPrompt] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copilotConnected, setCopilotConnected] = useState(false);
  const [copilotConnecting, setCopilotConnecting] = useState(false);
  const [copilotConfigurations, setCopilotConfigurations] = useState<CopilotConfiguration[]>([]);
  // Indexed by id
  const [models, setModels] = useState<Record<string, ModelSpec>>({});
  // Indexed by name
  const [tools, setTools] = useState<Record<string, ToolSpec>>({});
  const [runningConfigIds, setRunningConfigIds] = useState<string[]>([]);
  const [selectedLastRun, setSelectedLastRun] = useState<LastRun | null>(null);
  const [openToolMenuConfigId, setOpenToolMenuConfigId] = useState<string | null>(null);
  const runningConfigIdsRef = useRef(new Set<string>());

  const hasRunningConfigurations = runningConfigIds.length > 0;
  const hasRunnableConfigurations = copilotConfigurations.some((config) => !runningConfigIds.includes(config.id));

  const startConfigurationRun = (configId: string) => {
    if (runningConfigIdsRef.current.has(configId)) {
      return false;
    }

    runningConfigIdsRef.current.add(configId);
    setRunningConfigIds(Array.from(runningConfigIdsRef.current));
    return true;
  };

  const finishConfigurationRun = (configId: string) => {
    runningConfigIdsRef.current.delete(configId);
    setRunningConfigIds(Array.from(runningConfigIdsRef.current));
  };

  const runConfiguration = async (config: CopilotConfig) => {
    if (!startConfigurationRun(config.id)) {
      return;
    }

    try {
      const last_run = await window.electronAPI.run(prompt, config);
      setErrorMessage(null);
      // Update configuration with results from last run.
      setCopilotConfigurations(configs => configs.map((c) => (c.id === config.id ? { ...c, last_run: last_run } : c)));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      finishConfigurationRun(config.id);
    }
  };

  const handleNewCopilotConnection = async () => {
    setCopilotConnecting(true);
    try {
      const resources = await window.electronAPI.newCopilotConnection();
      setErrorMessage(null);
      setModels(Object.fromEntries(resources.models.map(m => [m.id, m])));
      setTools(Object.fromEntries(resources.tools.map(t => [t.name, t])));
      const allToolNames = resources.tools.map((tool) => tool.name);
      setCopilotConfigurations((configs) =>
        configs.map((config) => ({
          ...config,
          tool_names: config.tool_names.length === 0 ? allToolNames : config.tool_names.filter((toolName) => allToolNames.includes(toolName)),
        }))
      );
      setCopilotConnected(true);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setCopilotConnecting(false);
    }
  };

  const handleAddConfig = async () => {
    const model_ids = Object.keys(models);
    const backup_id = model_ids[0];
    if (!backup_id) return; // No models available
    const default_model_id: string = models['gpt-5-mini'] ? 'gpt-5-mini' : backup_id;
    setCopilotConfigurations(configs => [...configs, {id: crypto.randomUUID(), model_id: default_model_id, tool_names: Object.values(tools).map((tool) => tool.name)}]);
  };

  const handleRunAll = async () => {
    const pendingConfigurations = copilotConfigurations.filter((config) => !runningConfigIdsRef.current.has(config.id));

    if (pendingConfigurations.length === 0) {
      return;
    }

    await Promise.all(pendingConfigurations.map((config) => runConfiguration(config)));
  };

  const handleRun = async (config: CopilotConfig) => {
    if (runningConfigIds.includes(config.id)) {
      return;
    }

    await runConfiguration(config);
  };

  const handleUpdateConfigModel = (config_id: string, model_id: string) => {
    if (runningConfigIds.includes(config_id)) {
      return;
    }

    setCopilotConfigurations(configs =>
      configs.map((c) => (c.id === config_id ? { ...c, model_id: model_id, reasoning_effort: models[model_id]?.defaultReasoningEffort } : c))
    );
  };

  const handleUpdateConfigEffort = (config_id: string, effort: ReasoningEffort) => {
    if (runningConfigIds.includes(config_id)) {
      return;
    }

    setCopilotConfigurations(configs =>
      configs.map((c) => (c.id === config_id ? { ...c, reasoning_effort: effort } : c))
    );
  };

  const handleToggleToolMenu = (configId: string) => {
    setOpenToolMenuConfigId((current) => (current === configId ? null : configId));
  };

  const handleCloseToolMenu = () => {
    setOpenToolMenuConfigId(null);
  };

  const handleToggleConfigTool = (configId: string, toolName: string) => {
    if (runningConfigIds.includes(configId)) {
      return;
    }

    setCopilotConfigurations((configs) =>
      configs.map((config) => {
        if (config.id !== configId) {
          return config;
        }

        const hasTool = config.tool_names.includes(toolName);
        return {
          ...config,
          tool_names: hasTool
            ? config.tool_names.filter((name) => name !== toolName)
            : [...config.tool_names, toolName],
        };
      })
    );
  };

  const handleViewLastRun = (last_run: LastRun | undefined) => {
    if (last_run === undefined) {
      return;
    }

    setSelectedLastRun(last_run);
  };

  const handleCloseLastRun = () => {
    setSelectedLastRun(null);
  };

  return (
    <>
      <div className="container">
        <div className="toolbar">
          <div className="toolbar-buttons">
            <button className="btn btn-small btn-copilot" onClick={handleNewCopilotConnection} disabled={copilotConnecting || copilotConnected}>
              {copilotConnected ? 'Connected' : copilotConnecting ? 'Connecting…' : 'New Copilot Connection'}
            </button>
            <button className="btn btn-small btn-add-config" onClick={handleAddConfig} disabled={!copilotConnected}>
              Add Configuration
            </button>
            <button className="btn btn-small btn-run-all" onClick={handleRunAll} disabled={!copilotConnected || !hasRunnableConfigurations}>
              {hasRunnableConfigurations ? 'Run All' : hasRunningConfigurations ? 'Running…' : 'Run All'}
            </button>
          </div>
        </div>
        {errorMessage ? (
          <p className="error-banner" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <section className="prompt-panel" aria-labelledby="prompt-label">
          <label className="prompt-label" id="prompt-label" htmlFor="prompt">
            Prompt
          </label>
          <textarea
            id="prompt"
            name="prompt"
            className="prompt-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the scenario you want to compare across Copilot setups..."
          />
        </section>
        <section className="copilot-configurations" aria-labelledby="configs-label">
          <label className="configs-label" id="configs-label" htmlFor="configs">
            Copilot Configurations
          </label>
          <table className="configs">
            <tbody>
              {copilotConfigurations.length === 0 ? (
                <tr className="config-row config-row-empty">
                  <td className="config-card" colSpan={2}>No configurations added yet.</td>
                </tr>
              ) : (
                copilotConfigurations.map((config) => {
                  const modelSpec = models[config.model_id];
                  const isRunning = runningConfigIds.includes(config.id);
                  const isToolMenuOpen = openToolMenuConfigId === config.id;
                  const availableTools = Object.values(tools);
                  return (
                    <tr className="config-row" key={config.id}>
                      <td className={`config-card${isRunning ? ' config-card-running' : ''}${isToolMenuOpen ? ' config-card-tool-menu-open' : ''}`} aria-busy={isRunning}>
                        <select className="model-select" value={config.model_id} onChange={(e) => handleUpdateConfigModel(config.id, e.target.value)} disabled={isRunning}>
                          {Object.values(models).map(m => (
                            <option key={m.id} value={m.id}>{m.id}</option>
                          ))}
                        </select>
                      { modelSpec?.supportedReasoningEfforts && modelSpec.supportedReasoningEfforts.length > 0 ? (
                        <select className="effort-select" value={config.reasoning_effort} onChange={(e) => handleUpdateConfigEffort(config.id, e.target.value as ReasoningEffort)} disabled={isRunning}>
                        {modelSpec.supportedReasoningEfforts.map(e => (
                          <option key={e} value={e}>{e}</option>
                        ))}
                        </select>
                      ) : 
                        null
                      }
                        <ToolDropdown
                          configId={config.id}
                          tools={availableTools}
                          selectedToolNames={config.tool_names}
                          disabled={isRunning}
                          isOpen={openToolMenuConfigId === config.id}
                          onToggleOpen={handleToggleToolMenu}
                          onClose={handleCloseToolMenu}
                          onToggleTool={handleToggleConfigTool}
                        />
                        <span className="billing-mul">{modelSpec?.billingMul ? modelSpec.billingMul.toString() + 'x' : '0x'}</span>
                        <button className="btn btn-card btn-last" onClick={() => handleViewLastRun(config.last_run)} disabled={isRunning || config.last_run === undefined}>Last</button>
                        <button className="btn btn-card btn-run" onClick={() => handleRun(config)} disabled={isRunning}>{isRunning ? 'Running…' : 'Run'}</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>
      </div>
      <LastRunModal lastRun={selectedLastRun} onClose={handleCloseLastRun} />
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
