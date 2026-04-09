import React, { useEffect, useRef } from 'react';
import type { ToolSpec } from './electron-contract';

export function ToolDropdown({
  config_id,
  tools,
  selected_tool_names,
  disabled,
  is_open,
  on_toggle_open,
  on_close,
  on_toggle_tool,
}: {
  config_id: string;
  tools: ToolSpec[];
  selected_tool_names: string[];
  disabled: boolean;
  is_open: boolean;
  on_toggle_open: (config_id: string) => void;
  on_close: () => void;
  on_toggle_tool: (config_id: string, tool_name: string) => void;
}) {
  const selected_count = selected_tool_names.length;
  const dropdown_ref = useRef<HTMLDivElement>(null);
  const trigger_label = selected_count === 0
    ? 'No tools selected'
    : selected_count === tools.length
      ? `All tools selected (${selected_count})`
      : `${selected_count} tool${selected_count === 1 ? '' : 's'} selected`;
  const trigger_width_label = [
    'No tools selected',
    `${tools.length} tool${tools.length === 1 ? '' : 's'} selected`,
    `All tools selected (${tools.length})`,
  ].reduce((longest_label, label) => (
    label.length > longest_label.length ? label : longest_label
  ), '');

  useEffect(() => {
    if (!is_open) {
      return undefined;
    }

    const handle_pointer_down = (event: PointerEvent) => {
      const dropdown_element = dropdown_ref.current;
      if (!dropdown_element || !(event.target instanceof Node) || dropdown_element.contains(event.target)) {
        return;
      }

      on_close();
    };

    document.addEventListener('pointerdown', handle_pointer_down, true);

    return () => {
      document.removeEventListener('pointerdown', handle_pointer_down, true);
    };
  }, [is_open, on_close]);

  return (
    <div ref={dropdown_ref} className={`tool-dropdown${is_open ? ' tool-dropdown-open' : ''}`}>
      <button
        type="button"
        className="tool-dropdown-trigger"
        onClick={() => on_toggle_open(config_id)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={is_open}
      >
        <span className="tool-dropdown-trigger-copy">
          <span className="tool-dropdown-trigger-value">{trigger_label}</span>
          <span className="tool-dropdown-trigger-measure" aria-hidden="true">{trigger_width_label}</span>
        </span>
      </button>
      {is_open ? (
        <div className="tool-dropdown-menu" role="menu" aria-label="Select tools">
          {tools.length === 0 ? (
            <p className="tool-dropdown-empty">No tools available.</p>
          ) : (
            tools.map((tool) => {
              const checked = selected_tool_names.includes(tool.name);
              return (
                <label className="tool-dropdown-option" key={tool.name}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => on_toggle_tool(config_id, tool.name)}
                    disabled={disabled}
                  />
                  <span className="tool-dropdown-option-copy">
                    <span className="tool-dropdown-option-title">{tool.name}</span>
                  </span>
                </label>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}