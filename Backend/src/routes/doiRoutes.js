const express = require('express');
const router = express.Router();
const scholarlyService = require('../services/scholarlyService');

// ==========================================
// MULTI-SOURCE SCHOLARLY METADATA LOOKUP & INGESTION
// Cascade: CrossRef -> Semantic Scholar -> OpenAlex & arXiv -> Unpaywall
// ==========================================

/**
 * GET /api/doi/lookup
 * Query param: ?doi=...
 * Resolves academic metadata with fallback cascade, circuit breakers, rate limiting, and 24h Redis caching
 */
router.get('/doi/lookup', async (req, res) => {
  try {
    const rawDoi = req.query.doi || req.query.identifier || req.query.id;
    if (!rawDoi) {
      return res.status(400).json({ error: 'doi parameter is required' });
    }

    const scholarlyData = await scholarlyService.fetchScholarlyMetadata(rawDoi);

    if (!scholarlyData || (!scholarlyData.title && !scholarlyData.abstract)) {
      return res.status(404).json({
        error: 'Scholarly metadata not found on CrossRef, Semantic Scholar, OpenAlex, or arXiv'
      });
    }

    // Set cache status header if served from Redis
    if (scholarlyData.cached) {
      res.setHeader('X-Cache', 'HIT');
    } else {
      res.setHeader('X-Cache', 'MISS');
    }

    const yearStr = scholarlyData.year ? String(scholarlyData.year) : '';
    const intuition = scholarlyData.tldr || scholarlyData.abstract || '';

    res.json({
      doi: scholarlyData.doi,
      title: scholarlyData.title,
      authors: scholarlyData.authors,
      year: yearStr,
      pub: scholarlyData.pub,
      abstract: scholarlyData.abstract,
      tldr: scholarlyData.tldr,
      citation_count: scholarlyData.citation_count,
      influential_citation_count: scholarlyData.influential_citation_count,
      author_affiliations: scholarlyData.author_affiliations,
      taxonomy_concepts: scholarlyData.taxonomy_concepts,
      primary_topic: scholarlyData.primary_topic,
      open_access: scholarlyData.open_access,
      pdf_url: scholarlyData.pdf_url,
      url: scholarlyData.url,
      sources: scholarlyData.sources,
      cached: scholarlyData.cached || false,
      column_values: {
        title: scholarlyData.title,
        authors: scholarlyData.authors,
        year: yearStr,
        pub: scholarlyData.pub,
        venue: scholarlyData.pub,
        doi: scholarlyData.doi,
        abstract: scholarlyData.abstract,
        intuition: intuition,
        summary: intuition,
        url: scholarlyData.url,
        citations: scholarlyData.citation_count !== null ? String(scholarlyData.citation_count) : '',
        topic: scholarlyData.primary_topic || (scholarlyData.taxonomy_concepts?.[0] || ''),
        domain: scholarlyData.primary_topic || (scholarlyData.taxonomy_concepts?.[0] || '')
      }
    });
  } catch (err) {
    console.error('DOI lookup error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/doi/ingest
 * Direct Ingestion of Papers via DOI(s) with multi-source enrichment
 * Body: { doi?: string, dois?: string[], cluster_id?: number|string, project_id?: number|string }
 */
router.post('/doi/ingest', async (req, res) => {
  try {
    const { doi, dois, cluster_id, project_id } = req.body;
    const doiList = dois && Array.isArray(dois) ? dois : (doi ? [doi] : []);

    if (doiList.length === 0) {
      return res.status(400).json({ error: 'DOI or array of DOIs is required' });
    }

    const pid = project_id ? parseInt(project_id, 10) : 1;
    const targetClusterId = (cluster_id && cluster_id !== 'unassigned' && cluster_id !== 'null' && cluster_id !== '')
      ? parseInt(cluster_id, 10)
      : null;

    const inserted = [];

    for (const rawDoi of doiList) {
      if (!rawDoi || !String(rawDoi).trim()) continue;

      let scholarlyData;
      try {
        scholarlyData = await scholarlyService.fetchScholarlyMetadata(rawDoi);
      } catch (fetchErr) {
        console.warn(`External lookup error for ${rawDoi}:`, fetchErr.message);
      }

      if (!scholarlyData || !scholarlyData.title) {
        // Minimal fallback record if all external lookups failed
        const cleanId = scholarlyService.cleanIdentifier(rawDoi);
        scholarlyData = {
          doi: cleanId,
          title: `Paper (${cleanId})`,
          authors: 'Academic Researchers',
          year: new Date().getFullYear(),
          pub: '',
          abstract: '',
          tldr: '',
          pdf_url: '',
          sources: []
        };
      }

      const paperRecord = await scholarlyService.ingestPaperFromScholarly(
        scholarlyData,
        pid,
        targetClusterId
      );

      inserted.push(paperRecord);
    }

    res.status(201).json({
      success: true,
      count: inserted.length,
      ingested_count: inserted.length,
      papers: inserted
    });
  } catch (err) {
    console.error('DOI ingest error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/doi/providers/health
 * Diagnostic endpoint reporting circuit breaker state, failure counts, and uptime for external academic APIs
 */
router.get('/doi/providers/health', (req, res) => {
  try {
    const health = scholarlyService.getProviderHealth();
    const allHealthy = Object.values(health).every(p => p.state === 'CLOSED');
    res.json({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      providers: health
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

