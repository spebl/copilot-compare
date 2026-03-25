import type { LastRun } from './electron-contract';

function formatDuration(duration: number, unit: 's' | 'ms' = 's') {
  if (unit === 'ms') {
    return `${duration.toFixed(2)} ms`;
  }

  return `${(duration / 1000).toFixed(2)} s`;
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

export function LastRunModal({
  lastRun,
  onClose,
}: {
  lastRun: LastRun | null;
  onClose: () => void;
}) {
  if (!lastRun) {
    return null;
  }

  return (
    <div className="last-run-modal-backdrop" onClick={onClose} role="presentation">
      <section
        className="last-run-modal"
        aria-labelledby="last-run-title"
        aria-modal="true"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="last-run-header">
          <div>
            <p className="last-run-eyebrow">Run Details</p>
            <h2 className="last-run-title" id="last-run-title">Last Copilot Run</h2>
          </div>
          <button className="btn btn-small last-run-close" onClick={onClose}>Close</button>
        </div>
        <div className="last-run-summary-grid">
          <article className="last-run-summary-card">
            <span className="last-run-summary-label">Duration</span>
            <strong className="last-run-summary-value">{formatDuration(lastRun.duration)}</strong>
          </article>
          <article className="last-run-summary-card">
            <span className="last-run-summary-label">Tokens Used</span>
            <strong className="last-run-summary-value">{lastRun.tokens_used.toLocaleString()}</strong>
          </article>
          <article className="last-run-summary-card">
            <span className="last-run-summary-label">Tool Calls</span>
            <strong className="last-run-summary-value">{lastRun.tool_calls.length}</strong>
          </article>
        </div>
        <div className="last-run-sections">
          <section className="last-run-section">
            <h3 className="last-run-section-title">Response</h3>
            <pre className="last-run-response">{lastRun.response}</pre>
          </section>
          <section className="last-run-section">
            <div className="last-run-section-heading">
              <h3 className="last-run-section-title">Tool Calls</h3>
              <span className="last-run-section-meta">Basic timing and identifiers</span>
            </div>
            {lastRun.tool_calls.length === 0 ? (
              <p className="last-run-empty">No tool calls recorded for this run.</p>
            ) : (
              <div className="last-run-tools-list">
                {lastRun.tool_calls.map((toolCall) => (
                  <article className="last-run-tool-card" key={toolCall.tool_call_id}>
                    <div className="last-run-tool-row">
                      <span className="last-run-tool-label">Tool Name</span>
                      <strong className="last-run-tool-value">{toolCall.tool_name}</strong>
                    </div>
                    <div className="last-run-tool-row">
                      <span className="last-run-tool-label">Tool Call ID</span>
                      <code className="last-run-tool-code">{toolCall.tool_call_id}</code>
                    </div>
                    <div className="last-run-tool-row">
                      <span className="last-run-tool-label">Start Time</span>
                      <span className="last-run-tool-value">{formatTimestamp(toolCall.start_time)}</span>
                    </div>
                    <div className="last-run-tool-row">
                      <span className="last-run-tool-label">End Time</span>
                      <span className="last-run-tool-value">{formatTimestamp(toolCall.end_time)}</span>
                    </div>
                    <div className="last-run-tool-row">
                      <span className="last-run-tool-label">Elapsed</span>
                      <span className="last-run-tool-value">{formatDuration(toolCall.end_time - toolCall.start_time, 'ms')}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}