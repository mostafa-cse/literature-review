import React from 'react';

/**
 * PrismaScreening Component
 * Handles mutually exclusive PRISMA inclusion voting (Include, Exclude, Uncertain),
 * exclusion reason selection from a functional dropdown, and the live auto-save indicator.
 */
export function PrismaScreening({
  decision = 'included', // 'included' | 'excluded' | 'uncertain'
  onDecisionChange,
  reason = '',
  onReasonChange,
  saveStatus = 'saved' // 'saving' | 'saved' | 'error'
}) {
  const handleVote = (vote) => {
    onDecisionChange(vote);
  };

  const getStatusClass = () => {
    switch (saveStatus) {
      case 'saving':
        return 'status-saving';
      case 'error':
        return 'status-error';
      case 'saved':
      default:
        return 'status-saved';
    }
  };

  const getStatusText = () => {
    switch (saveStatus) {
      case 'saving':
        return 'Saving...';
      case 'error':
        return 'Retry';
      case 'saved':
      default:
        return 'Saved';
    }
  };

  return (
    <div>
      {/* Row 1: Mutually exclusive radio buttons */}
      <div className="prisma-row-1">
        <div
          className={`solid-box ${decision === 'included' ? 'active' : ''}`}
          onClick={() => handleVote('included')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleVote('included'); }}
        >
          Include
        </div>
        <div
          className={`solid-box ${decision === 'excluded' ? 'active' : ''}`}
          onClick={() => handleVote('excluded')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleVote('excluded'); }}
        >
          Exclude
        </div>
        <div
          className={`solid-box ${decision === 'uncertain' ? 'active' : ''}`}
          onClick={() => handleVote('uncertain')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleVote('uncertain'); }}
        >
          Uncertain
        </div>
      </div>

      {/* Row 2: Functional Reason Dropdown + Live Auto-Save Indicator */}
      <div className="prisma-row-2">
        <div className="solid-box long-box">
          <select
            className="prisma-reason-select"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
          >
            <option value="">Selected Reasons (▼)</option>
            <option value="Valid methodology">Valid methodology meeting all criteria</option>
            <option value="Not empirical study">Out of scope / non-empirical study</option>
            <option value="Duplicate publication">Duplicate publication / preprint</option>
            <option value="Incompatible benchmark">Incompatible benchmark / missing dataset</option>
            <option value="Language barrier">Language barrier / full text unavailable</option>
            <option value="High risk of bias">High risk of bias / quality flaws</option>
          </select>
        </div>

        {/* Repurposed Live Auto-Save Status Box */}
        <div
          className={`solid-box short-box ${getStatusClass()}`}
          title="Real-Time Background Auto-Save Status"
        >
          {getStatusText()}
        </div>
      </div>
    </div>
  );
}
