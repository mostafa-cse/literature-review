import React, { useState } from 'react';

export default function SectionWrapper({
  title,
  children,
  defaultExpanded = true,
  hideExpandButton = false
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="section">
      <div className="section-header">
        <div className="section-title">{title}</div>
        {!hideExpandButton && (
          <button
            type="button"
            className="expand-btn"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            title={isExpanded ? 'Collapse section' : 'Expand section'}
          >
            <span className={`chevron-icon ${isExpanded ? 'open' : ''}`}>
              &#9662;
            </span>
          </button>
        )}
      </div>
      {isExpanded && <div className="section-content">{children}</div>}
    </div>
  );
}
