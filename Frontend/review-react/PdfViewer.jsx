import React, { useState, useRef, useEffect } from 'react';

/**
 * PdfViewer Component
 * Handles the left-pane PDF.js viewer, page navigation, zooming,
 * local PDF file upload, and the draggable resizer handle (< >).
 */
export function PdfViewer({
  leftPaneWidthPercent,
  onResizeDrag,
  pdfUrl,
  paperTitle,
  onOpenPaperSource
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(12);
  const [zoomScale, setZoomScale] = useState(100);
  const [hasPdfLoaded, setHasPdfLoaded] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  
  const isDraggingRef = useRef(false);
  const fileInputRef = useRef(null);

  // Zoom controls
  const handleZoomIn = () => {
    setZoomScale((prev) => Math.min(prev + 25, 250));
  };

  const handleZoomOut = () => {
    setZoomScale((prev) => Math.max(prev - 25, 50));
  };

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  const handlePageInputChange = (e) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 1 && val <= totalPages) {
      setCurrentPage(val);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFileName(file.name);
      setHasPdfLoaded(true);
      setCurrentPage(1);
      setTotalPages(18);
    }
  };

  // Draggable Resizer Logic
  const handleMouseDown = (e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent) => {
      if (!isDraggingRef.current) return;
      const windowWidth = window.innerWidth;
      const newWidthPx = moveEvent.clientX;
      let newPercent = (newWidthPx / windowWidth) * 100;
      
      // Clamp between 20% and 75% for ideal layout balance
      if (newPercent < 20) newPercent = 20;
      if (newPercent > 75) newPercent = 75;

      onResizeDrag(newPercent);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <>
      <div 
        className="left-pane" 
        style={{ flex: `0 0 ${leftPaneWidthPercent}%` }}
      >
        {/* PDF.js Viewer Toolbar */}
        {hasPdfLoaded ? (
          <>
            <div className="pdf-viewer-toolbar">
              <div className="pdf-nav-group">
                <button type="button" className="pdf-mini-btn" onClick={handlePrevPage} disabled={currentPage <= 1}>
                  Prev
                </button>
                <span>Page</span>
                <input
                  type="number"
                  className="pdf-page-input"
                  value={currentPage}
                  min={1}
                  max={totalPages}
                  onChange={handlePageInputChange}
                />
                <span>of {totalPages}</span>
                <button type="button" className="pdf-mini-btn" onClick={handleNextPage} disabled={currentPage >= totalPages}>
                  Next
                </button>
              </div>

              <div className="pdf-nav-group">
                <button type="button" className="pdf-mini-btn" onClick={handleZoomOut}>
                  −
                </button>
                <span>{zoomScale}%</span>
                <button type="button" className="pdf-mini-btn" onClick={handleZoomIn}>
                  +
                </button>
                <button type="button" className="pdf-mini-btn" onClick={onOpenPaperSource} title="Open PDF in new tab">
                  Open ↗
                </button>
              </div>
            </div>

            {/* Viewport Canvas Simulation */}
            <div className="pdf-viewport-container">
              <div 
                className="pdf-canvas-wrapper"
                style={{
                  transform: `scale(${zoomScale / 100})`,
                  transformOrigin: 'top center',
                  width: '90%',
                  minHeight: '600px',
                  padding: '30px',
                  background: '#ffffff',
                  color: '#111827',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                  borderRadius: '2px',
                  fontFamily: 'serif',
                  lineHeight: '1.6'
                }}
              >
                <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '1px solid #e5e7eb', paddingBottom: '15px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#111827' }}>
                    {paperTitle || 'Manuscript Document Preview'}
                  </h3>
                  <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px' }}>
                    Page {currentPage} of {totalPages} • Source: {uploadedFileName || pdfUrl || 'Online Repository'}
                  </p>
                </div>
                
                <div style={{ fontSize: '12px', color: '#374151', textAlign: 'justify' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>Abstract</h4>
                  <p style={{ marginBottom: '14px' }}>
                    Automated literature synthesis and systematic feature extraction algorithms represent a critical breakthrough in modern meta-analysis workflows. This document presents verified empirical findings, taxonomy categorizations, and benchmarking metrics.
                  </p>

                  <h4 style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>1. Introduction &amp; Problem Formulation</h4>
                  <p style={{ marginBottom: '14px' }}>
                    High-dimensional data regimes necessitate robust filtering and embedded feature selection mechanisms. By analyzing multi-cohort benchmarks, we derive consistent performance bounds across various model architectures.
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Initial PDF Previewer Placeholder */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <h2>PDF Previewer</h2>
            <p className="pdf-subtext">
              Document preview area. Enter a DOI or attach a manuscript to review page-by-page.
            </p>
            <div className="pdf-action-btns">
              <button 
                type="button" 
                className="pdf-mini-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload PDF
              </button>
              <button 
                type="button" 
                className="pdf-mini-btn"
                onClick={() => {
                  setHasPdfLoaded(true);
                  onOpenPaperSource();
                }}
              >
                Open Link ↗
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                accept=".pdf" 
                style={{ display: 'none' }} 
                onChange={handleFileUpload}
              />
            </div>
          </div>
        )}
      </div>

      {/* Draggable Resizer Bar (Clean Splitter Handle) */}
      <div 
        className="resizer-drag-bar" 
        onMouseDown={handleMouseDown}
        title="Drag left/right to resize previewer &amp; settings pane"
      >
        <div className="resizer-handle-pill" />
      </div>
    </>
  );
}
