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
  saveButtonText = 'Save Summary'
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
            <span className="save-icon">💾</span> {saveButtonText}
          </button>
        </div>
      )}
    </div>
  );
}

export default DetailedSummary;
