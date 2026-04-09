import type { ToolReport } from './electron-contract';
import type { ConfigurationLastRun } from './prompt-runs';

function format_duration(duration: number, unit: 's' | 'ms' = 's') {
  if (unit === 'ms') {
    return `${duration.toFixed(2)} ms`;
  }

  return `${(duration / 1000).toFixed(2)} s`;
}

function format_timestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

function format_json_text(value: unknown) {
  if (value === undefined) {
    return null;
  }

  return JSON.stringify(value, null, 2);
}

function get_tool_status_label(tool_call: ToolReport) {
  if (tool_call.response?.success === true) {
    return 'Succeeded';
  }

  if (tool_call.response?.success === false) {
    return 'Failed';
  }

  return 'Completed';
}

function get_tool_status_class_name(tool_call: ToolReport) {
  if (tool_call.response?.success === true) {
    return 'last-run-tool-status last-run-tool-status-success';
  }

  if (tool_call.response?.success === false) {
    return 'last-run-tool-status last-run-tool-status-failure';
  }

  return 'last-run-tool-status last-run-tool-status-complete';
}

export function LastRunView({
  last_run,
}: {
  last_run: ConfigurationLastRun;
}) {
  return (
    <section className="last-run-modal">
      <div className="last-run-header">
        <h2 className="last-run-title" id="last-run-title">Run Log</h2>
      </div>
      <div className="last-run-summary-grid">
        <article className="last-run-summary-card">
          <span className="last-run-summary-label">Prompts</span>
          <strong className="last-run-summary-value">{last_run.prompt_runs.length}</strong>
        </article>
        <article className="last-run-summary-card">
          <span className="last-run-summary-label">Time</span>
          <strong className="last-run-summary-value">{format_duration(last_run.duration)}</strong>
        </article>
        <article className="last-run-summary-card">
          <span className="last-run-summary-label">Tokens</span>
          <strong className="last-run-summary-value">{last_run.tokens_used.toLocaleString()}</strong>
        </article>
        <article className="last-run-summary-card">
          <span className="last-run-summary-label">Tools</span>
          <strong className="last-run-summary-value">{last_run.tool_calls.length}</strong>
        </article>
      </div>
      <div className="last-run-sections">
        <section className="last-run-section">
          <h3 className="last-run-section-title">Prompts</h3>
          {last_run.prompt_runs.length === 0 ? (
            <p className="last-run-empty">No prompts recorded.</p>
          ) : (
            <div className="last-run-prompt-list">
              {last_run.prompt_runs.map((prompt_run, index) => (
                <article className="last-run-prompt-card" key={`${index}-${prompt_run.prompt.slice(0, 32)}`}>
                  <div className="last-run-prompt-header">
                    <div className="last-run-prompt-copy">
                      <span className="last-run-prompt-index">Prompt {index + 1}</span>
                      <pre className="last-run-prompt-text">{prompt_run.prompt}</pre>
                    </div>
                    <div className="last-run-prompt-stats">
                      <span className="last-run-prompt-stat">{prompt_run.tokens_used.toLocaleString()} tokens</span>
                      <span className="last-run-prompt-stat">{format_duration(prompt_run.duration)}</span>
                      <span className="last-run-prompt-stat">{prompt_run.tool_calls.length} tools</span>
                    </div>
                  </div>
                  <div>
                    <h4 className="last-run-subsection-title">Response</h4>
                    <pre className="last-run-response">{prompt_run.response}</pre>
                  </div>
                  <div>
                    <h4 className="last-run-subsection-title">Tools</h4>
                    {prompt_run.tool_calls.length === 0 ? (
                      <p className="last-run-empty">No tool calls.</p>
                    ) : (
                      <div className="last-run-tools-list">
                        {prompt_run.tool_calls.map((tool_call) => (
                          <details className="last-run-tool-card" key={tool_call.tool_call_id} open={prompt_run.tool_calls.length === 1}>
                            <summary className="last-run-tool-summary">
                              <div className="last-run-tool-summary-main">
                                <strong className="last-run-tool-name">{tool_call.tool_name}</strong>
                                <span className={get_tool_status_class_name(tool_call)}>{get_tool_status_label(tool_call)}</span>
                              </div>
                              <div className="last-run-tool-summary-meta">
                                <span className="last-run-tool-summary-stat">{format_duration(tool_call.end_time - tool_call.start_time, 'ms')}</span>
                                {tool_call.parameters !== undefined ? <span className="last-run-tool-summary-stat">Args</span> : null}
                                {tool_call.response !== undefined ? <span className="last-run-tool-summary-stat">Output</span> : null}
                              </div>
                            </summary>
                            <div className="last-run-tool-details">
                              <div className="last-run-tool-row">
                                <span className="last-run-tool-label">ID</span>
                                <code className="last-run-tool-code">{tool_call.tool_call_id}</code>
                              </div>
                              <div className="last-run-tool-row">
                                <span className="last-run-tool-label">Start</span>
                                <span className="last-run-tool-value">{format_timestamp(tool_call.start_time)}</span>
                              </div>
                              <div className="last-run-tool-row">
                                <span className="last-run-tool-label">End</span>
                                <span className="last-run-tool-value">{format_timestamp(tool_call.end_time)}</span>
                              </div>
                              <div className="last-run-tool-row">
                                <span className="last-run-tool-label">Time</span>
                                <span className="last-run-tool-value">{format_duration(tool_call.end_time - tool_call.start_time, 'ms')}</span>
                              </div>
                              {tool_call.parameters !== undefined ? (
                                <div className="last-run-tool-payload-group">
                                  <h5 className="last-run-tool-payload-title">Args</h5>
                                  <pre className="last-run-tool-payload">{format_json_text(tool_call.parameters)}</pre>
                                </div>
                              ) : null}
                              {tool_call.response !== undefined ? (
                                <div className="last-run-tool-payload-group">
                                  <h5 className="last-run-tool-payload-title">Output</h5>
                                  <pre className="last-run-tool-payload">{format_json_text(tool_call.response)}</pre>
                                </div>
                              ) : null}
                            </div>
                          </details>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}