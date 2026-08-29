const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const { getDb } = require('../db');

// ==========================================
// MULTI-FORMAT EXPORT ENGINE (XLSX / CSV / JSON)
// ==========================================

function handleExport(req, res) {
  try {
    const format = (req.query.format || (req.body && req.body.format) || 'xlsx').toLowerCase();
    const clusterId = req.params.id || req.query.cluster_id || (req.body && req.body.cluster_id);
    const projectId = req.query.project_id || (req.body && req.body.project_id) || 1;
    
    // Parse selected columns from either 'cols' or 'columns' parameter
    const rawCols = req.query.cols || req.query.columns || (req.body && (req.body.cols || req.body.columns));
    const selectedColumns = rawCols ? (Array.isArray(rawCols) ? rawCols : String(rawCols).split(',')) : null;

    const db = getDb();

    // Verify project exists
    const proj = db.prepare('SELECT id, name, description FROM projects WHERE id = ?').get(projectId);

    let cluster = null;
    let papers = [];
    let dynamicCols = [];

    if (clusterId && clusterId !== 'all') {
      cluster = db.prepare('SELECT * FROM clusters WHERE id = ?').get(clusterId);
      papers = db.prepare('SELECT * FROM papers WHERE cluster_id = ? ORDER BY year DESC, id ASC').all(clusterId);
      dynamicCols = db.prepare('SELECT * FROM dynamic_columns WHERE cluster_id = ? ORDER BY parent_column_id ASC, id ASC').all(clusterId);
    } else {
      cluster = { name: (proj ? proj.name : 'Master_Matrix') };
      papers = db.prepare(`
        SELECT p.*, c.name as cluster_name 
        FROM papers p 
        LEFT JOIN clusters c ON c.id = p.cluster_id 
        WHERE p.project_id = ? OR c.project_id = ?
        ORDER BY p.cluster_id ASC, p.year DESC, p.id ASC
      `).all(projectId, projectId);
      dynamicCols = db.prepare(`
        SELECT DISTINCT dc.id, dc.column_name, dc.parent_column_id, dc.col_type, p.column_name as parent_name
        FROM dynamic_columns dc
        LEFT JOIN dynamic_columns p ON p.id = dc.parent_column_id
        JOIN clusters c ON c.id = dc.cluster_id
        WHERE c.project_id = ?
        ORDER BY dc.parent_column_id ASC, dc.id ASC
      `).all(projectId);
    }

    // Get column values
    const colValues = db.prepare(`
      SELECT pcv.paper_id, pcv.column_id, pcv.value, dc.column_name
      FROM paper_column_values pcv
      JOIN dynamic_columns dc ON dc.id = pcv.column_id
    `).all();

    const valMap = {};
    for (const cv of colValues) {
      if (!valMap[cv.paper_id]) valMap[cv.paper_id] = {};
      valMap[cv.paper_id][cv.column_name] = cv.value;
      valMap[cv.paper_id][cv.column_id] = cv.value;
    }

    // Get keywords
    const keywords = db.prepare('SELECT paper_id, keyword FROM keywords').all();
    const kwMap = {};
    for (const kw of keywords) {
      if (!kwMap[kw.paper_id]) kwMap[kw.paper_id] = [];
      kwMap[kw.paper_id].push(kw.keyword);
    }

    // Dynamic Columns grouping
    const topLevelCols = dynamicCols.filter(c => !c.parent_column_id);
    const childColsByParent = {};
    dynamicCols.filter(c => c.parent_column_id).forEach(c => {
      if (!childColsByParent[c.parent_column_id]) childColsByParent[c.parent_column_id] = [];
      childColsByParent[c.parent_column_id].push(c);
    });

    const hasSplitCols = Object.keys(childColsByParent).length > 0;

    // Define column mapping
    const baseColumns = [
      { key: '#', label: '#', val: (p, idx) => idx + 1 },
      { key: 'title', label: 'Paper Title', val: p => p.title || 'Untitled' },
      { key: 'authors', label: 'Authors', val: p => p.authors || '' },
      { key: 'year', label: 'Year', val: p => p.year || '' },
      { key: 'cluster', label: 'Cluster Name', val: p => p.cluster_name || 'Unassigned' },
      { key: 'domain', label: 'Domain', val: p => p.domain || 'General' },
      { key: 'status', label: 'Reading Status', val: p => (p.status || 'unread').replace(/_/g, ' ').toUpperCase() },
      { key: 'pub', label: 'Pub / Venue', val: p => p.pub || '' },
      { key: 'doi', label: 'DOI / Link', val: p => p.doi || p.pdf_url || '' }
    ];

    const formatExportVal = (raw) => {
      if (raw === null || raw === undefined) return '';
      if (typeof raw === 'object' && !Array.isArray(raw)) {
        return Object.entries(raw).map(([k, v]) => `${k}: ${v}`).join('\n');
      }
      if (typeof raw === 'string' && raw.trim().startsWith('{') && raw.trim().endsWith('}')) {
        try {
          const obj = JSON.parse(raw.trim());
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join('\n');
          }
        } catch (_) {}
      }
      return String(raw);
    };

    // Dynamic columns to export
    const dynamicExportCols = [];
    topLevelCols.forEach(col => {
      const subs = childColsByParent[col.id] || [];
      if (subs.length > 0) {
        subs.forEach(s => {
          dynamicExportCols.push({
            key: `dyn_${s.id}`,
            label: s.column_name,
            parent: col.column_name,
            val: p => {
              const directVal = valMap[p.id] && (valMap[p.id][s.column_name] || valMap[p.id][s.id]);
              if (directVal !== undefined && directVal !== null && directVal !== '') {
                return formatExportVal(directVal);
              }
              const parentVal = valMap[p.id] && (valMap[p.id][col.column_name] || valMap[p.id][col.id]);
              if (parentVal) {
                try {
                  const splitObj = (typeof parentVal === 'string' && parentVal.startsWith('{'))
                    ? JSON.parse(parentVal)
                    : (typeof parentVal === 'object' ? parentVal : null);
                  if (splitObj) {
                    const shortKey = s.column_name.match(/\(([^)]+)\)$/)?.[1] || s.column_name;
                    if (splitObj[shortKey] !== undefined) return formatExportVal(splitObj[shortKey]);
                    if (splitObj[s.column_name] !== undefined) return formatExportVal(splitObj[s.column_name]);
                  }
                } catch (_) {}
              }
              return '';
            }
          });
        });
      } else {
        dynamicExportCols.push({
          key: `dyn_${col.id}`,
          label: col.column_name,
          parent: null,
          val: p => formatExportVal((valMap[p.id] && (valMap[p.id][col.column_name] || valMap[p.id][col.id])) || '')
        });
      }
    });

    let allExportCols = [...baseColumns, ...dynamicExportCols];

    // Filter by user selection if requested
    if (Array.isArray(selectedColumns) && selectedColumns.length > 0) {
      allExportCols = allExportCols.filter(col => {
        const colKey = (col.key || '').toLowerCase();
        const colKeyNoDyn = colKey.replace('dyn_', '');
        const colLabel = (col.label || '').toLowerCase();

        return selectedColumns.some(sc => {
          const s = (sc || '').trim().toLowerCase();
          const sNoDyn = s.replace('dyn_', '');
          return s === colKey || s === colLabel || sNoDyn === colKeyNoDyn || s === colKeyNoDyn || sNoDyn === colLabel;
        });
      });
    }

    const fileNameBase = (cluster ? cluster.name : 'Master_Matrix').replace(/[^a-zA-Z0-9_-]/g, '_');

    // 1. JSON Export
    if (format === 'json') {
      const jsonRows = papers.map((p, idx) => {
        const obj = {};
        allExportCols.forEach(c => { obj[c.label] = c.val(p, idx); });
        return obj;
      });
      res.setHeader('Content-Disposition', `attachment; filename="${fileNameBase}.json"`);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.send(JSON.stringify(jsonRows, null, 2));
    }

    // 2. BibTeX (.bib) Export
    if (format === 'bib' || format === 'bibtex') {
      const bibEntries = papers.map(p => {
        const firstAuthor = (p.authors || 'Author').split(/[,&]/)[0].trim().replace(/[^a-zA-Z]/g, '').toLowerCase();
        const year = p.year || new Date().getFullYear();
        const citeKey = `${firstAuthor}${year}_${p.id}`;
        
        let bib = `@article{${citeKey},\n`;
        bib += `  title     = {${(p.title || 'Untitled').replace(/[{}]/g, '')}},\n`;
        bib += `  author    = {${p.authors || 'Unknown'}},\n`;
        if (p.year) bib += `  year      = {${p.year}},\n`;
        if (p.pub) bib += `  journal   = {${p.pub}},\n`;
        if (p.doi) bib += `  doi       = {${p.doi}},\n`;
        if (p.pdf_url) bib += `  url       = {${p.pdf_url}},\n`;
        if (p.domain) bib += `  keywords  = {${p.domain}},\n`;
        if (p.intuition) bib += `  abstract  = {${p.intuition.replace(/[{}]/g, '')}},\n`;
        bib += `  publisher = {LitNexis Research Matrix}\n`;
        bib += `}\n`;
        return bib;
      }).join('\n');

      res.setHeader('Content-Disposition', `attachment; filename="${fileNameBase}.bib"`);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(`% LitNexis Systematic Literature Review - BibTeX Export\n% Project: ${proj ? proj.name : 'Master Matrix'}\n% Total Citations: ${papers.length}\n\n${bibEntries}`);
    }

    // 3. LaTeX Table (.tex) Export
    if (format === 'tex' || format === 'latex') {
      const colsToUse = allExportCols.filter(c => !['#', 'pdf_url', 'doi'].includes(c.key)).slice(0, 6);
      const colSpec = 'l ' + colsToUse.slice(1).map(() => 'X').join(' ');

      let tex = `% Camera-Ready Literature Survey Matrix (Generated by LitNexis)\n`;
      tex += `\\begin{table*}[t]\n`;
      tex += `\\centering\n`;
      tex += `\\caption{Systematic Literature Comparison: ${cluster ? cluster.name : 'Research Survey'}}\n`;
      tex += `\\label{tab:survey_matrix}\n`;
      tex += `\\small\n`;
      tex += `\\begin{tabularx}{\\textwidth}{${colSpec}}\n`;
      tex += `\\toprule\n`;
      tex += colsToUse.map(c => `\\textbf{${c.label}}`).join(' & ') + ` \\\\\n`;
      tex += `\\midrule\n`;

      papers.forEach((p, idx) => {
        const rowVals = colsToUse.map(c => {
          let val = String(c.val(p, idx) || '-').replace(/[_#$%&~^\\{}]/g, '\\$&');
          return val.length > 60 ? val.substring(0, 57) + '...' : val;
        });
        tex += rowVals.join(' & ') + ` \\\\\n`;
      });

      tex += `\\bottomrule\n`;
      tex += `\\end{tabularx}\n`;
      tex += `\\end{table*}\n`;

      res.setHeader('Content-Disposition', `attachment; filename="${fileNameBase}.tex"`);
      res.setHeader('Content-Type', 'application/x-tex; charset=utf-8');
      return res.send(tex);
    }

    // 4. Excel (.xlsx) Export with Professional Styling & Freeze Panes
    if (format === 'xlsx' || format === 'excel') {
      const wsData = [];
      const merges = [];
      const rowHeights = [];

      if (hasSplitCols) {
        // Multi-level Header Row 1 & Row 2
        const headerRow1 = [];
        const headerRow2 = [];

        let cIdx = 0;
        allExportCols.forEach(col => {
          if (col.parent) {
            headerRow1.push(col.parent);
            headerRow2.push(col.label);
          } else {
            headerRow1.push(col.label);
            headerRow2.push('');
            // Vertical merge row 0 and row 1
            merges.push({ s: { r: 0, c: cIdx }, e: { r: 1, c: cIdx } });
          }
          cIdx++;
        });

        // Group horizontal merges for parent headers
        let startCol = -1;
        let currentParent = null;
        for (let i = 0; i < allExportCols.length; i++) {
          const p = allExportCols[i].parent;
          if (p) {
            if (p === currentParent) {
              // continue group
            } else {
              if (currentParent && startCol >= 0 && (i - 1) > startCol) {
                merges.push({ s: { r: 0, c: startCol }, e: { r: 0, c: i - 1 } });
              }
              currentParent = p;
              startCol = i;
            }
          } else {
            if (currentParent && startCol >= 0 && (i - 1) > startCol) {
              merges.push({ s: { r: 0, c: startCol }, e: { r: 0, c: i - 1 } });
            }
            currentParent = null;
            startCol = -1;
          }
        }
        if (currentParent && startCol >= 0 && (allExportCols.length - 1) > startCol) {
          merges.push({ s: { r: 0, c: startCol }, e: { r: 0, c: allExportCols.length - 1 } });
        }

        wsData.push(headerRow1);
        wsData.push(headerRow2);
        rowHeights.push({ hpt: 28 });
        rowHeights.push({ hpt: 22 });
      } else {
        // Single Header Row
        wsData.push(allExportCols.map(c => c.label));
        rowHeights.push({ hpt: 28 });
      }

      // Add Data Rows & Compute Dynamic Row Heights
      papers.forEach((p, idx) => {
        const row = allExportCols.map(c => c.val(p, idx));
        wsData.push(row);

        // Compute row height based on max multiline content
        const maxLines = Math.max(1, ...row.map(val => String(val || '').split('\n').length));
        rowHeights.push({ hpt: Math.max(22, Math.min(140, maxLines * 16 + 6)) });
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      if (merges.length > 0) ws['!merges'] = merges;
      ws['!rows'] = rowHeights;

      // Calculate dynamic and optimal column widths
      ws['!cols'] = allExportCols.map((c, colIdx) => {
        let maxLen = Math.max((c.label || '').length, (c.parent || '').length, 8);
        papers.forEach((p, rIdx) => {
          const val = String(c.val(p, rIdx) || '');
          const lines = val.split('\n');
          lines.forEach(line => {
            if (line.length > maxLen) {
              maxLen = Math.min(65, Math.max(maxLen, line.length));
            }
          });
        });
        if (c.key === '#') maxLen = Math.max(maxLen, 6);
        if (c.key === 'year') maxLen = Math.max(maxLen, 10);
        if (c.key === 'title') maxLen = Math.max(maxLen, 45);
        if (c.key === 'authors') maxLen = Math.max(maxLen, 28);
        if (c.key === 'domain') maxLen = Math.max(maxLen, 18);
        if (c.key === 'status') maxLen = Math.max(maxLen, 16);
        if (c.key === 'cluster') maxLen = Math.max(maxLen, 24);
        if (c.key === 'pub') maxLen = Math.max(maxLen, 30);
        if (c.key === 'doi') maxLen = Math.max(maxLen, 36);
        if (c.key && c.key.startsWith('dyn_')) maxLen = Math.max(maxLen, 32);

        return { wch: maxLen + 3 };
      });

      // Freeze header row(s) and first 2 columns (# and Paper Title)
      const headerRowCount = hasSplitCols ? 2 : 1;
      ws['!views'] = [
        {
          state: 'frozen',
          xSplit: 2,
          ySplit: headerRowCount,
          topLeftCell: `C${headerRowCount + 1}`,
          activePane: 'bottomRight',
          showGridLines: true
        }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Master Matrix');

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', `attachment; filename="${fileNameBase}.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buf);
    }

    // 5. CSV Export
    const csvRows = [];
    csvRows.push(allExportCols.map(c => `"${String(c.label).replace(/"/g, '""')}"`).join(','));

    papers.forEach((p, idx) => {
      const row = allExportCols.map(c => {
        const v = String(c.val(p, idx) || '');
        return `"${v.replace(/"/g, '""')}"`;
      }).join(',');
      csvRows.push(row);
    });

    res.setHeader('Content-Disposition', `attachment; filename="${fileNameBase}.csv"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(csvRows.join('\n'));

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

router.get('/clusters/:id/export', handleExport);
router.get('/export', handleExport);
router.post('/export', handleExport);

module.exports = router;
