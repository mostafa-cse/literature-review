import React from 'react';

export default function DetailedSummary({ value, onChange }) {
  return (
    <div className="text-box-container">
      <textarea
        className="detailed-summary-textarea"
        placeholder="[..............................text box.............................]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
      />
    </div>
  );
}
