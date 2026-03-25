import React, { useEffect, useRef } from 'react';
import type { ToolSpec } from './electron-contract';

export function ToolDropdown({
  configId,
  tools,
  selectedToolNames,
  disabled,
  isOpen,
  onToggleOpen,
  onClose,
  onToggleTool,
}: {
  configId: string;
  tools: ToolSpec[];
  selectedToolNames: string[];
  disabled: boolean;
  isOpen: boolean;
  onToggleOpen: (configId: string) => void;
  onClose: () => void;
  onToggleTool: (configId: string, toolName: string) => void;
}) {
  const selectedCount = selectedToolNames.length;
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerLabel = selectedCount === 0
    ? 'No tools selected'
    : selectedCount === tools.length
      ? `All tools selected (${selectedCount})`
      : `${selectedCount} tool${selectedCount === 1 ? '' : 's'} selected`;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const dropdownElement = dropdownRef.current;
      if (!dropdownElement || !(event.target instanceof Node) || dropdownElement.contains(event.target)) {
        return;
      }

      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [isOpen, onClose]);

  return (
    <div ref={dropdownRef} className={`tool-dropdown${isOpen ? ' tool-dropdown-open' : ''}`}>
      <button
        type="button"
        className="tool-dropdown-trigger"
        onClick={() => onToggleOpen(configId)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <span className="tool-dropdown-trigger-value">{triggerLabel}</span>
      </button>
      {isOpen ? (
        <div className="tool-dropdown-menu" role="menu" aria-label="Select tools">
          {tools.length === 0 ? (
            <p className="tool-dropdown-empty">No tools available.</p>
          ) : (
            tools.map((tool) => {
              const checked = selectedToolNames.includes(tool.name);
              return (
                <label className="tool-dropdown-option" key={tool.name}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleTool(configId, tool.name)}
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