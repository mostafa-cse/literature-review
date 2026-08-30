import React from 'react';

/**
 * DetailedSummary Component
 * Editable textual synthesis box with debounced textarea and right-aligned Save button.
 */
export function DetailedSummary({
  value = '',
  onChange,
  onSave,
  showSaveButton = true,
  saveButtonText = 'Save'
}) {
  return (
    <div>
      <div className="text-box-placeholder">
        <textarea
          className="detailed-summary-textarea"
          rows={5}
          placeholder="Enter detailed text synthesis here..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>

      {showSaveButton && onSave && (
        <div className="section-action-bar">
          <button
            type="button"
            className="section-save-btn"
            onClick={onSave}
          >
            <svg className="save-btn-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> {saveButtonText}
          </button>
        </div>
      )}
    </div>
  );
}

export default DetailedSummary;
