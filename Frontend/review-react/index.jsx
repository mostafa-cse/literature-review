import React from 'react';
import ReactDOM from 'react-dom/client';
import { PaperReviewApp } from './PaperReviewApp';

const rootElement = document.getElementById('root') || document.getElementById('app');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <PaperReviewApp />
    </React.StrictMode>
  );
}

export { PaperReviewApp } from './PaperReviewApp';
export { Header } from './Header';
export { PdfViewer } from './PdfViewer';
export { SectionWrapper } from './SectionWrapper';
export { GridList } from './GridList';
export { DashedBoxList } from './DashedBoxList';
export { PrismaScreening } from './PrismaScreening';
export { DetailedSummary } from './DetailedSummary';
export { useDebounce } from './useDebounce';
export { INITIAL_PAPER_STATE, savePaperToDb, fetchPaperByDoi } from './mockDb';
