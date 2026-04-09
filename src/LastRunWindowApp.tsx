import { useEffect, useState } from 'react';

import type { ConfigurationLastRun } from './prompt-runs';
import { LastRunView } from './LastRunView';

function get_error_message(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error.';
}

export function LastRunWindowApp() {
  const [last_run, set_last_run] = useState<ConfigurationLastRun | null>(null);
  const [error_message, set_error_message] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Run Log - copilot-compare';

    let is_active = true;
    const window_id = new URLSearchParams(window.location.search).get('windowId');

    const load_last_run = async () => {
      try {
        if (!window_id) {
          set_error_message('No run data for this window.');
          return;
        }

        const initial_last_run = await window.electronAPI.get_last_run_window_data(window_id);
        if (!is_active) {
          return;
        }

        if (initial_last_run === null) {
          set_error_message('No run data for this window.');
          return;
        }

        set_last_run(initial_last_run);
        set_error_message(null);
      } catch (error) {
        if (!is_active) {
          return;
        }

        set_error_message(get_error_message(error));
      }
    };

    void load_last_run();

    return () => {
      is_active = false;
    };
  }, []);

  return (
    <div className="last-run-window-shell">
      {error_message ? (
        <p className="error-banner" role="alert">
          {error_message}
        </p>
      ) : null}
      {last_run ? <LastRunView last_run={last_run} /> : null}
      {!last_run && !error_message ? <p className="last-run-window-status">Loading run…</p> : null}
    </div>
  );
}