import React from 'react';

/**
 * DetailedSummary Component
 * Editable textual synthesis box with full-width placeholder styling.
 */
export function DetailedSummary({
  value = '',
  onChange
}) {
  return (
    <div className="text-box-placeholder">
      <textarea
        className="detailed-summary-textarea"
        rows={5}
        placeholder="Enter detailed text synthesis here..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
