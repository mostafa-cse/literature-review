/**
 * Mock Database & Simulated API Engine
 * Handles asynchronous DOI auto-fetch and background auto-save operations.
 */

export const INITIAL_PAPER_STATE = {
  id: 101,
  title: 'Deep Feature Selection for High-Dimensional Omics Classification',
  doi: '10.1145/2939672.2939785',
  pdfUrl: 'https://arxiv.org/pdf/2301.00001.pdf',
  clusters: ['Deep Learning', 'Feature Selection', 'Bioinformatics', 'Cancer Genomics'],
  selectedCluster: 'Feature Selection',
  domains: ['Healthcare AI', 'Genomics', 'Computational Biology'],
  selectedDomain: 'Genomics',
  keywords: ['mRMR', 'LASSO', 'Attention Mechanism', 'Biomarkers', 'TCGA'],
  selectedKeywords: ['mRMR', 'Attention Mechanism'],
  columns: [
    { key: 'Architecture', value: 'Multi-head Self-Attention with Gated Residuals' },
    { key: 'Benchmark Dataset', value: 'TCGA Pan-Cancer (11,000 RNA-seq samples)' },
    { key: 'Evaluation Metrics', value: 'F1-Score: 94.8%, AUC-ROC: 0.982' },
    { key: 'Baseline Comparison', value: 'Random Forests, SVM-RFE, DeepLIFT' }
  ],
  prismaDecision: 'included', // 'included' | 'excluded' | 'uncertain'
  prismaReason: 'Valid methodology',
  summaryItems: [
    { key: 'Intuition', value: 'Sparse regularized attention captures nonlinear gene interactions.' },
    { key: 'Formulation', value: 'L1 + Frobenius norm regularization over dense embedding weights.' },
    { key: 'Strengths', value: 'High biological interpretability with validated clinical pathway hits.' },
    { key: 'Research Gaps', value: 'Computational complexity scales quadratically with feature size.' }
  ],
  detailedSummary: 'This paper introduces a robust deep learning framework for feature selection in ultra-high-dimensional biological datasets. By coupling sparsity-inducing penalties with multi-head attention, the model identifies minimal prognostic gene signatures while maintaining state-of-the-art diagnostic accuracy across multiple cancer cohorts.'
};

/**
 * Simulates an async background save to mock database.
 * Returns a promise resolving after 400ms.
 */
export async function savePaperToDb(paperData) {
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        localStorage.setItem(`litnexis_paper_${paperData.id || 101}`, JSON.stringify(paperData));
      } catch (e) {
        console.warn('LocalStorage save failed:', e);
      }
      resolve({ success: true, timestamp: new Date().toISOString() });
    }, 450);
  });
}

/**
 * Simulates an async DOI auto-fetch API.
 * Simulates network latency (800ms) and returns bibliographic metadata.
 */
export async function fetchPaperByDoi(doiString) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const cleanDoi = (doiString || '').trim();
      if (!cleanDoi) {
        reject(new Error('Please provide a valid DOI string.'));
        return;
      }

      if (cleanDoi.toLowerCase().includes('error')) {
        reject(new Error('DOI lookup failed. Server returned 404 Not Found.'));
        return;
      }

      resolve({
        title: `Comprehensive Systematic Review: [DOI ${cleanDoi}]`,
        doi: cleanDoi,
        pdfUrl: `https://doi.org/${cleanDoi}`,
        clusters: ['Deep Learning', 'Systematic Review', 'Benchmarking'],
        selectedCluster: 'Deep Learning',
        domains: ['Artificial Intelligence', 'Data Science'],
        selectedDomain: 'Artificial Intelligence',
        keywords: ['Neural Networks', 'Optimization', 'Empirical Study'],
        selectedKeywords: ['Neural Networks'],
        detailedSummary: `Auto-extracted abstract and synthesis summary for publication identified by DOI: ${cleanDoi}. Metadata verified via Crossref & OpenAlex API.`
      });
    }, 850);
  });
}
