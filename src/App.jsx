import React, { useState, useRef, useCallback } from 'react';
import Header from './components/Header';
import PdfViewer from './components/PdfViewer';
import SectionWrapper from './components/SectionWrapper';
import GridList from './components/GridList';
import KeyValueEditor from './components/KeyValueEditor';
import PrismaScreening from './components/PrismaScreening';
import DetailedSummary from './components/DetailedSummary';
import { useDebounce } from './hooks/useDebounce';
import { useAutoSave } from './hooks/useAutoSave';
import './App.css';

const mockSaveToDatabaseApi = async (dataPayload) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('[Mock DB] Snapshot Auto-Saved Successfully:', dataPayload);
      resolve({ success: true, timestamp: new Date().toISOString() });
    }, 450);
  });
};

export default function App() {
  const [paper, setPaper] = useState({
    title: 'Feature Selection based on Mutual Information Criteria',
    doi: '10.1109/TPAMI.2005.159',
    pdfUrl: '',
    selectedCluster: 'Filter Methods',
    selectedDomain: 'CSC engnr',
    selectedKeywords: ['mRMR', 'Gene Selection']
  });

  const [clusters, setClusters] = useState([
    'cluster1', 'cluster4', 'cluster7',
    'cluster2', 'cluster5', 'cluster8',
    'cluster3', 'cluster6'
  ]);

  const [domains, setDomains] = useState([
    'domain1', 'domain4', 'domain8',
    'domain2', 'domain5', 'domain9',
    'domain3', 'domain6'
  ]);

  const [keywords, setKeywords] = useState([
    'keyword1', 'keyword4', 'keywords7',
    'keyword2', 'keyword5', 'keyword8',
    'keyword3', 'keyword6'
  ]);

  const [columns, setColumns] = useState([
    { key: 'col_name1', value: 'Value..' },
    { key: 'col_name2', value: 'Value..' },
    { key: 'col_name3', value: 'Value..' },
    { key: 'col_name4', value: 'Value..' }
  ]);

  const [prismaDecision, setPrismaDecision] = useState('Include');
  const [prismaReason, setPrismaReason] = useState('');

  const [summaryPairs, setSummaryPairs] = useState([
    { key: 'col_name1', value: 'Value..' },
    { key: 'col_name2', value: 'Value..' }
  ]);

  const [detailedSummary, setDetailedSummary] = useState('');
  const [isFetchingDoi, setIsFetchingDoi] = useState(false);

  const [leftPanePercent, setLeftPanePercent] = useState(42);
  const isDraggingRef = useRef(false);
  const containerRef = useRef(null);

  const handleMouseDown = () => {
    isDraggingRef.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDraggingRef.current || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidth = e.clientX - containerRect.left;
    let newPercent = (newWidth / containerRect.width) * 100;

    if (newPercent < 20) newPercent = 20;
    if (newPercent > 75) newPercent = 75;

    setLeftPanePercent(newPercent);
  }, []);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'auto';
  }, [handleMouseMove]);

  const debouncedColumns = useDebounce(columns, 750);
  const debouncedSummaryPairs = useDebounce(summaryPairs, 750);
  const debouncedDetailedSummary = useDebounce(detailedSummary, 750);

  const fullSavePayload = {
    paper,
    clusters,
    domains,
    keywords,
    columns: debouncedColumns,
    summaryPairs: debouncedSummaryPairs,
    detailedSummary: debouncedDetailedSummary,
    prismaDecision,
    prismaReason
  };

  const { saveStatus } = useAutoSave(fullSavePayload, mockSaveToDatabaseApi);

  const handleOpenPaperReview = (doc) => {
    const targetUrl = doc.doi
      ? `https://doi.org/${doc.doi}`
      : 'https://arxiv.org/pdf/1706.03762.pdf';
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
    console.log(`[Review Mode] Initialized review session for: "${doc.title}"`);
  };

  const handleDoiFetch = async (doiString) => {
    setIsFetchingDoi(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 900));

      const fetchedMeta = {
        title: `Deep Residual Learning for Automated Extraction (${doiString})`,
        doi: doiString,
        pdfUrl: '',
        selectedCluster: 'Deep Learning / CNN',
        selectedDomain: 'Computer Vision',
        selectedKeywords: ['Residual Networks', 'ImageNet']
      };

      setPaper(fetchedMeta);
      setDetailedSummary(
        `Automated synthesis extracted from DOI ${doiString}: Proposes deep residual network framework with depth up to 152 layers.`
      );
    } catch (err) {
      console.error('DOI Fetch Failed:', err);
    } finally {
      setIsFetchingDoi(false);
    }
  };

  const handleSplitColumn = () => {
    const baseColName = `col_name${columns.length + 1}`;
    setColumns((prev) => [
      ...prev,
      { key: `${baseColName}(TC)`, value: '0.00' },
      { key: `${baseColName}(SC)`, value: '0.00' }
    ]);
  };

  const handleAddColumn = () => {
    setColumns((prev) => [
      ...prev,
      { key: `col_name${prev.length + 1}`, value: 'Value..' }
    ]);
  };

  return (
    <div className="window-container" ref={containerRef}>
      <Header
        paper={paper}
        onDoiFetch={handleDoiFetch}
        isFetchingDoi={isFetchingDoi}
        onOpenPaperReview={handleOpenPaperReview}
      />

      <main className="main-body">
        <PdfViewer paper={paper} widthPercent={leftPanePercent} />

        <div
          className="resizer-drag-handle"
          onMouseDown={handleMouseDown}
          title="Drag left/right to resize previewer & settings pane"
        >
          <div className="resizer-glyphs">
            <span>&lt;</span>
            <span>&gt;</span>
          </div>
        </div>

        <div className="right-pane">
          <SectionWrapper title="Cluster">
            <GridList
              items={clusters}
              selectedItem={paper.selectedCluster}
              onSelect={(item) =>
                setPaper((p) => ({ ...p, selectedCluster: item }))
              }
              onAddItem={(newCluster) =>
                setClusters((prev) => [...prev, newCluster])
              }
              placeholderPrefix="cluster"
            />
          </SectionWrapper>

          <SectionWrapper title="Domain">
            <GridList
              items={domains}
              selectedItem={paper.selectedDomain}
              onSelect={(item) =>
                setPaper((p) => ({ ...p, selectedDomain: item }))
              }
              onAddItem={(newDomain) =>
                setDomains((prev) => [...prev, newDomain])
              }
              placeholderPrefix="domain"
            />
          </SectionWrapper>

          <SectionWrapper title="Keywords">
            <GridList
              items={keywords}
              selectedItem={paper.selectedKeywords}
              onSelect={(item) => {
                setPaper((p) => {
                  const curr = p.selectedKeywords || [];
                  const next = curr.includes(item)
                    ? curr.filter((k) => k !== item)
                    : [...curr, item];
                  return { ...p, selectedKeywords: next };
                });
              }}
              onAddItem={(newKeyword) =>
                setKeywords((prev) => [...prev, newKeyword])
              }
              placeholderPrefix="keyword"
            />
          </SectionWrapper>

          <SectionWrapper title="Columns">
            <KeyValueEditor
              pairs={columns}
              onChange={setColumns}
              onAddPair={handleAddColumn}
              onSplitColumn={handleSplitColumn}
              showActions={true}
            />
          </SectionWrapper>

          <SectionWrapper title="PRISMA Blind Screening & Quality Appraisal">
            <PrismaScreening
              decision={prismaDecision}
              onDecisionChange={setPrismaDecision}
              reason={prismaReason}
              onReasonChange={setPrismaReason}
              saveStatus={saveStatus}
            />
          </SectionWrapper>

          <SectionWrapper title="Summery" hideExpandButton={true}>
            <KeyValueEditor
              pairs={summaryPairs}
              onChange={setSummaryPairs}
              showActions={false}
            />
          </SectionWrapper>

          <SectionWrapper title="Detailed Summery:">
            <DetailedSummary
              value={detailedSummary}
              onChange={setDetailedSummary}
            />
          </SectionWrapper>
        </div>
      </main>
    </div>
  );
}
