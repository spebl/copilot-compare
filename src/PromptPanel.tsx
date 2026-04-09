type PromptPanelProps = {
  prompt: string;
  saved_prompts: string[];
  has_prompt_draft: boolean;
  has_saved_prompts: boolean;
  has_running_configurations: boolean;
  on_prompt_change: (prompt: string) => void;
  on_save_prompt: () => void;
  on_save_prompt_list: () => void;
  on_load_prompt_list: () => void;
  on_use_saved_prompt: (saved_prompt: string) => void;
  on_remove_saved_prompt: (saved_prompt: string) => void;
};

function DraftIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M3 11.75V13h1.25l6.9-6.9-1.25-1.25L3 11.75ZM12.1 5.15l.75-.75a.9.9 0 0 0 0-1.25l-.5-.5a.9.9 0 0 0-1.25 0l-.75.75 1.75 1.75Z" fill="currentColor" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M6 2.75h4l.5 1.25H13v1.5h-1v7.25A1.25 1.25 0 0 1 10.75 14h-5.5A1.25 1.25 0 0 1 4 12.75V5.5H3V4h2.5L6 2.75Zm-.5 2.75v7h5v-7h-5Zm1.25 1.25h1.5v4h-1.5v-4Zm2.5 0h1.5v4h-1.5v-4Z" fill="currentColor" />
    </svg>
  );
}

function format_saved_prompt_number(index: number) {
  const prompt_number = index + 1;
  return prompt_number < 10 ? `0${prompt_number}` : `${prompt_number}`;
}

export function PromptPanel({
  prompt,
  saved_prompts,
  has_prompt_draft,
  has_saved_prompts,
  has_running_configurations,
  on_prompt_change,
  on_save_prompt,
  on_save_prompt_list,
  on_load_prompt_list,
  on_use_saved_prompt,
  on_remove_saved_prompt,
}: PromptPanelProps) {
  const show_draft_hint = saved_prompts.length > 0 && has_prompt_draft;

  return (
    <section className="app-section prompt-panel" aria-labelledby="prompt-title">
      <div className="section-header">
        <h2 className="section-title" id="prompt-title">Prompt</h2>
        <div className="section-toolbar">
          <button className="btn btn-small btn-save-prompt" onClick={on_save_prompt} disabled={!has_prompt_draft}>
            Save Prompt
          </button>
        </div>
      </div>
      <textarea
        id="prompt"
        name="prompt"
        className="prompt-input"
        aria-labelledby="prompt-title"
        value={prompt}
        onChange={(event) => on_prompt_change(event.target.value)}
        placeholder="Enter the prompt to run across configurations..."
      />
      {show_draft_hint ? (
        <p className="prompt-draft-hint">Save the draft to include it in the list.</p>
      ) : null}
      <div className="section-subpanel prompt-list-panel" aria-live="polite">
        <div className="subsection-header">
          <div className="subsection-title-row">
            <h3 className="subsection-title">Saved Prompts</h3>
            <span className="section-meta">{saved_prompts.length} saved</span>
          </div>
          <div className="subsection-toolbar">
            <button className="btn btn-small" onClick={on_save_prompt_list} disabled={!has_saved_prompts}>
              Save List
            </button>
            <button className="btn btn-small" onClick={on_load_prompt_list} disabled={has_running_configurations}>
              Load List
            </button>
          </div>
        </div>
        {saved_prompts.length === 0 ? (
          <p className="prompt-list-empty">No saved prompts yet.</p>
        ) : (
          <ol className="prompt-list">
            {saved_prompts.map((saved_prompt, index) => {
              const prompt_number = format_saved_prompt_number(index);

              return (
                <li className="prompt-list-item" key={`${index}-${saved_prompt.slice(0, 32)}`}>
                  <span className="prompt-list-index" aria-label={`Prompt ${prompt_number}`}>{prompt_number}</span>
                  <div className="prompt-list-actions">
                    <button className="btn btn-icon btn-prompt-use" onClick={() => on_use_saved_prompt(saved_prompt)} aria-label={`Edit draft from prompt ${prompt_number}`} title={`Edit draft from prompt ${prompt_number}`}>
                      <DraftIcon />
                    </button>
                    <button className="btn btn-icon btn-prompt-remove" onClick={() => on_remove_saved_prompt(saved_prompt)} aria-label={`Remove prompt ${prompt_number}`} title={`Remove prompt ${prompt_number}`}>
                      <RemoveIcon />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}