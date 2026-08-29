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

    const cleanDoi = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
    const url = `https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'LiteratureReviewApp/1.0 (mailto:researcher@example.com)' }
    });

    if (!response.ok) {
      return res.status(404).json({ error: 'DOI not found or CrossRef service error' });
    }

    const data = await response.json();
    const item = data.message;

    const title = item.title && item.title.length > 0 ? item.title[0] : '';
    const authors = item.author ? item.author.map(a => `${a.given || ''} ${a.family || ''}`.trim()).join(', ') : '';
    const year = (item['published-print'] && item['published-print']['date-parts'] && item['published-print']['date-parts'][0] && item['published-print']['date-parts'][0][0])
      || (item['published-online'] && item['published-online']['date-parts'] && item['published-online']['date-parts'][0] && item['published-online']['date-parts'][0][0])
      || (item.issued && item.issued['date-parts'] && item.issued['date-parts'][0] && item.issued['date-parts'][0][0])
      || (item.created && item.created['date-parts'] && item.created['date-parts'][0] && item.created['date-parts'][0][0])
      || null;
    const pub = item['container-title'] && item['container-title'].length > 0 ? item['container-title'][0] : (item.publisher || '');
    const abstract = item.abstract ? item.abstract.replace(/<[^>]*>?/gm, '') : '';

    res.json({
      doi: cleanDoi,
      title,
      authors,
      year,
      pub,
      abstract,
      url: item.URL
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
