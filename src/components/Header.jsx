import React, { useState } from 'react';

export default function Header({
  paper,
  onDoiFetch,
  isFetchingDoi,
  onOpenPaperReview
}) {
  const [doiInput, setDoiInput] = useState('');

  const handleFetchClick = () => {
    if (!doiInput.trim()) return;
    onDoiFetch(doiInput.trim());
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleFetchClick();
    }
  };

  return (
    <header className="header">
      <div className="header-left">
        <div
          className="title-main"
          onClick={() => onOpenPaperReview(paper)}
          title="Click to view full manuscript and start review session"
        >
          {paper.title || 'Papers Name'}
        </div>
        <div className="title-sub">
          [{paper.selectedCluster || 'Selected Cluster'}] [{paper.selectedDomain || 'Domain'}] [..] [{paper.selectedKeywords?.length ? paper.selectedKeywords.join(', ') : 'keywords'}]
        </div>
      </div>
      <div className="header-right">
        <span className="doi-label">DOI AUTO-FETCH:</span>
        <input
          type="text"
          className="doi-input"
          placeholder="Enter DOI (e.g. 10.1145/2939672.2939785)"
          value={doiInput}
          onChange={(e) => setDoiInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isFetchingDoi}
        />
        <button
          className="fetch-btn"
          onClick={handleFetchClick}
          disabled={isFetchingDoi}
        >
          {isFetchingDoi ? 'Fetching...' : 'Fetch'}
        </button>
      </div>
    </header>
  );
}
