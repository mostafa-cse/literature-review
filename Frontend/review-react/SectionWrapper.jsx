import React, { useState } from 'react';

/**
 * SectionWrapper Component
 * Handles the accordion behavior, title display, and rotating chevron toggle icon.
 */
export function SectionWrapper({
  title,
  defaultExpanded = true,
  children,
  headerAction = null,
  id
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpand = () => {
    setIsExpanded((prev) => !prev);
  };

  return (
    <div className={`section ${!isExpanded ? 'collapsed' : ''}`} id={id}>
      <div 
        className="section-header" 
        onClick={toggleExpand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleExpand(); }}
      >
        <div className="section-title">{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {headerAction && <div onClick={(e) => e.stopPropagation()}>{headerAction}</div>}
          <button type="button" className="expand-btn" aria-label="Toggle section">
            <svg 
              className="chevron-icon" 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2.5" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              style={{
                transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                display: 'inline-block'
              }}
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="section-content">
          {children}
        </div>
      )}
    </div>
  );
}
