import React from 'react';

const REASON_OPTIONS = [
  'Select Exclusion/Inclusion Reason...',
  'Out of scope - non-empirical study',
  'Duplicate publication / Pre-print artifact',
  'Incompatible benchmark / missing dataset details',
  'Language barrier / full text unavailable',
  'High methodological bias / low appraisal score',
  'Valid methodology meeting all criteria'
];

export default function PrismaScreening({
  decision,
  onDecisionChange,
  reason,
  onReasonChange,
  saveStatus
}) {
  const options = ['Include', 'Exclude', 'Uncertain'];

  return (
    <div className="prisma-container">
      {/* Mutually Exclusive Radio Buttons */}
      <div className="prisma-row-1">
        {options.map((opt) => {
          const isActive = decision === opt;
          return (
            <div
              key={opt}
              className={`solid-box radio-box ${isActive ? 'active' : ''}`}
              onClick={() => onDecisionChange(opt)}
              role="radio"
              aria-checked={isActive}
              tabIndex={0}
            >
              {opt}
            </div>
          );
        })}
      </div>

      {/* Reason Dropdown & Live Auto-Save Indicator */}
      <div className="prisma-row-2">
        <div className="solid-box long-box">
          <select
            className="reason-select"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
          >
            {REASON_OPTIONS.map((r, i) => (
              <option key={i} value={i === 0 ? '' : r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {/* Repurposed Live Save Indicator */}
        <div
          className={`solid-box short-box status-box status-${saveStatus}`}
          title="Background Auto-save Engine Status"
        >
          {saveStatus === 'saving' && <span className="saving-spinner">&#9696;</span>}
          {saveStatus === 'saving' && ' Saving...'}
          {saveStatus === 'saved' && '✓ Saved'}
          {saveStatus === 'error' && '⚠️ Retry'}
          {saveStatus === 'idle' && 'Save'}
        </div>
      </div>
    </div>
  );
}
