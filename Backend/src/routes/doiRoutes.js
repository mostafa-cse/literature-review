const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// ==========================================
// DOI METADATA LOOKUP & INGESTION (CrossRef API)
// ==========================================

router.get('/doi/lookup', async (req, res) => {
  try {
    const { doi } = req.query;
    if (!doi) return res.status(400).json({ error: 'doi parameter is required' });

    let cleanDoi = doi.trim()
      .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
      .replace(/^doi:\s*/i, '')
      .trim();

    // If given an arXiv ID without prefix, normalize
    if (!cleanDoi.startsWith('10.') && /^\d{4}\.\d{4,5}(v\d+)?$/i.test(cleanDoi)) {
      cleanDoi = `10.48550/arXiv.${cleanDoi}`;
    }

    let title = '';
    let authors = '';
    let year = null;
    let pub = '';
    let abstract = '';
    let paperUrl = `https://doi.org/${cleanDoi}`;

    // 1. Fetch from CrossRef API with 6s timeout
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const url = `https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`;
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'LitSphere/1.0 (mailto:researcher@litsphere.org)' }
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        const item = data.message || {};

        title = item.title && item.title.length > 0 ? item.title[0] : '';
        authors = Array.isArray(item.author)
          ? item.author.map(a => `${a.given || ''} ${a.family || ''}`.trim()).filter(Boolean).join(', ')
          : (item.publisher || '');

        year = (item['published-print'] && item['published-print']['date-parts'] && item['published-print']['date-parts'][0] && item['published-print']['date-parts'][0][0])
          || (item['published-online'] && item['published-online']['date-parts'] && item['published-online']['date-parts'][0] && item['published-online']['date-parts'][0][0])
          || (item.issued && item.issued['date-parts'] && item.issued['date-parts'][0] && item.issued['date-parts'][0][0])
          || (item.created && item.created['date-parts'] && item.created['date-parts'][0] && item.created['date-parts'][0][0])
          || null;

        pub = (item['container-title'] && item['container-title'].length > 0 ? item['container-title'][0] : '')
          || (item['short-container-title'] && item['short-container-title'].length > 0 ? item['short-container-title'][0] : '')
          || item.publisher || '';

        if (item.abstract) {
          abstract = item.abstract
            .replace(/<jats:title>[^<]*<\/jats:title>/gi, '')
            .replace(/<[^>]*>?/gm, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }

        if (item.URL) paperUrl = item.URL;
      }
    } catch (crossRefErr) {
      console.warn('CrossRef lookup notice:', crossRefErr.message);
    }

    // 2. Fallback / Augment with Semantic Scholar (especially valuable for full abstract)
    if (!abstract || !title) {
      try {
        const s2Controller = new AbortController();
        const s2Timeout = setTimeout(() => s2Controller.abort(), 5000);
        const s2Url = `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(cleanDoi)}?fields=title,authors,year,abstract,venue,openAccessPdf`;
        const s2Res = await fetch(s2Url, {
          signal: s2Controller.signal,
          headers: { 'User-Agent': 'LitSphere/1.0 (mailto:researcher@litsphere.org)' }
        });
        clearTimeout(s2Timeout);

        if (s2Res.ok) {
          const s2Data = await s2Res.json();
          if (!title && s2Data.title) title = s2Data.title;
          if (!authors && Array.isArray(s2Data.authors)) {
            authors = s2Data.authors.map(a => a.name).filter(Boolean).join(', ');
          }
          if (!year && s2Data.year) year = s2Data.year;
          if (!pub) {
            pub = s2Data.venue || s2Data.publicationVenue?.name || '';
          }
          if (!abstract && s2Data.abstract) {
            abstract = s2Data.abstract.trim();
          }
          if (s2Data.url && (!paperUrl || paperUrl.includes('doi.org'))) {
            paperUrl = s2Data.url;
          }
        }
      } catch (s2Err) {
        console.warn('Semantic Scholar lookup notice:', s2Err.message);
      }
    }

    // 3. Fallback / Augment with OpenAlex (high rate-limit free polite pool with inverted index abstract)
    if (!abstract || !title) {
      try {
        const alexController = new AbortController();
        const alexTimeout = setTimeout(() => alexController.abort(), 5000);
        const alexUrl = `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(cleanDoi)}?mailto=researcher@litsphere.org`;
        const alexRes = await fetch(alexUrl, { signal: alexController.signal });
        clearTimeout(alexTimeout);

        if (alexRes.ok) {
          const alexData = await alexRes.json();
          if (!title && alexData.title) title = alexData.title;
          if (!authors && Array.isArray(alexData.authorships)) {
            authors = alexData.authorships.map(a => a.author?.display_name).filter(Boolean).join(', ');
          }
          if (!year && alexData.publication_year) year = alexData.publication_year;
          if (!pub && alexData.primary_location?.source?.display_name) {
            pub = alexData.primary_location.source.display_name;
          }
          if (!abstract && alexData.abstract_inverted_index) {
            const words = [];
            for (const [word, positions] of Object.entries(alexData.abstract_inverted_index)) {
              for (const pos of positions) words[pos] = word;
            }
            abstract = words.filter(Boolean).join(' ').trim();
          }
        }
      } catch (alexErr) {
        console.warn('OpenAlex lookup notice:', alexErr.message);
      }
    }

    if (!title && !abstract) {
      return res.status(404).json({ error: 'DOI metadata not found on CrossRef, Semantic Scholar, or OpenAlex' });
    }

    res.json({
      doi: cleanDoi,
      title,
      authors,
      year: year ? String(year) : '',
      pub,
      abstract,
      url: paperUrl,
      column_values: {
        title,
        authors,
        year: year ? String(year) : '',
        pub,
        venue: pub,
        doi: cleanDoi,
        abstract,
        intuition: abstract,
        url: paperUrl
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Direct Ingestion of Papers via DOI(s)
router.post('/doi/ingest', async (req, res) => {
  try {
    const { doi, dois, cluster_id, project_id } = req.body;
    const doiList = dois && Array.isArray(dois) ? dois : (doi ? [doi] : []);

    if (doiList.length === 0) {
      return res.status(400).json({ error: 'DOI or array of DOIs is required' });
    }

    const db = getDb();
    let pid = project_id ? parseInt(project_id, 10) : 1;
    const targetClusterId = (cluster_id && cluster_id !== 'unassigned' && cluster_id !== 'null' && cluster_id !== '') ? parseInt(cluster_id, 10) : null;
    const inserted = [];

    const insertPaper = db.prepare(`
      INSERT INTO papers (
        project_id, cluster_id, title, authors, year, pub, doi, pdf_url,
        status, domain, intuition, equation, strengths, gaps
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, '', 'unread', 'General', ?, '', '', '')
    `);

    for (const rawDoi of doiList) {
      const cleanDoi = rawDoi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
      if (!cleanDoi) continue;

      let title = `Paper (${cleanDoi})`;
      let authors = 'Academic Researchers';
      let year = new Date().getFullYear();
      let pub = '';
      let abstract = '';

      try {
        const url = `https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`;
        const response = await fetch(url, {
          headers: { 'User-Agent': 'LiteratureReviewApp/1.0 (mailto:researcher@example.com)' }
        });
        if (response.ok) {
          const data = await response.json();
          const item = data.message;
          if (item.title && item.title.length > 0) title = item.title[0];
          if (item.author) authors = item.author.map(a => `${a.given || ''} ${a.family || ''}`.trim()).join(', ');
          if (item['published-print'] && item['published-print']['date-parts']) {
            year = item['published-print']['date-parts'][0][0];
          } else if (item.created && item.created['date-parts']) {
            year = item.created['date-parts'][0][0];
          }
          if (item['container-title'] && item['container-title'].length > 0) pub = item['container-title'][0];
          if (item.abstract) abstract = item.abstract.replace(/<[^>]*>?/gm, '');
        }
      } catch (doiErr) {
        console.warn(`CrossRef fetch failed for ${cleanDoi}:`, doiErr.message);
      }

      const pRes = insertPaper.run(
        pid,
        targetClusterId,
        title,
        authors,
        year,
        pub,
        cleanDoi,
        abstract
      );

      inserted.push({
        id: pRes.lastInsertRowid,
        title,
        authors,
        year,
        doi: cleanDoi,
        cluster_id: targetClusterId
      });
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

module.exports = router;
