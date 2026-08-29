import React from 'react';

export default function PdfViewer({ paper, widthPercent }) {
  return (
    <div className="left-pane" style={{ flex: `0 0 ${widthPercent}%` }}>
      {paper.pdfUrl ? (
        <iframe
          src={paper.pdfUrl}
          title="PDF Document Previewer"
          className="pdf-iframe"
        />
      ) : (
        <div className="pdf-placeholder">
          <h2>PDF Previewer</h2>
          <p className="pdf-subtext">
            {paper.doi ? `Manuscript loaded via DOI: ${paper.doi}` : 'No PDF attached. Enter a DOI or upload document.'}
          </p>
        </div>
      )}
    </div>
  );
}
