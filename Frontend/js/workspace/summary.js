/**
 * LITNEXIS CLUSTER INSIGHTS & UNIQUE VALUE SUMMARY ENGINE
 * =======================================================================
 * Auto-renders below the master matrix table for every cluster page.
 * - Aggregates distinct unique values across ALL columns (standard, dynamic, split)
 * - 65% / 35% Split View:
 *     - Col 1 (65%): Unique Value (clamped to max 2 lines in collapsed view)
 *     - Col 2 (35%): Reference Papers Serial Numbers (clamped to max 2 lines in collapsed view)
 * - Interactive row-level and card-level expand/collapse toggles to view all details
 * - Direct paper viewer trigger on serial badge click
 * - "Copy for Thesis" Markdown synthesis export
 */

(function () {
  'use strict';

  let isSummaryCollapsed = false;

  /* ────────────────────────────────────────────────────────────────
     TOGGLE COLLAPSE / EXPAND SECTION
  ──────────────────────────────────────────────────────────────── */
  window.toggleSummaryCollapse = function () {
    isSummaryCollapsed = !isSummaryCollapsed;
    const body = document.getElementById('summary-cards-container');
    const icon = document.getElementById('summary-toggle-icon');
    if (body) body.style.display = isSummaryCollapsed ? 'none' : 'grid';
    if (icon) icon.style.transform = isSummaryCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
  };

  /* ────────────────────────────────────────────────────────────────
     TOGGLE EXPAND / COLLAPSE ALL ROWS IN A SINGLE CARD
  ──────────────────────────────────────────────────────────────── */
  window.toggleCardRowExpand = function (btn, event) {
    if (event) event.stopPropagation();
    var card = btn.closest('.summary-col-card');
    if (!card) return;
    var isExpanded = card.classList.toggle('expanded');
    btn.classList.toggle('active', isExpanded);
    btn.title = isExpanded ? 'Collapse all rows in this card' : 'Expand all rows in this card';
    var icon = btn.querySelector('svg');
    if (icon) {
      icon.innerHTML = isExpanded
        ? '<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>'
        : '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>';
    }
  };

  /* ────────────────────────────────────────────────────────────────
     MAIN RENDER ENTRY POINT
  ──────────────────────────────────────────────────────────────── */
  window.renderClusterSummary = function (papersToAnalyze) {
    var container = document.getElementById('cluster-summary-section');
    if (!container) return;

    var papers = Array.isArray(papersToAnalyze) ? papersToAnalyze : (window.allPapers || []);
    var activeClusterId = window.currentClusterId || 'all';

    if (!papersToAnalyze && activeClusterId && activeClusterId !== 'all') {
      papers = (window.allPapers || []).filter(function (p) {
        return String(p.cluster_id) === String(activeClusterId);
      });
    }

    if (papers.length === 0) { container.innerHTML = ''; return; }

    var paperIndex = buildPaperIndex(papers);
    var allClusters = window.allClusters || [];
    var clusterObj = allClusters.find(function (c) { return String(c.id) === String(activeClusterId); });
    var clusterTitle = clusterObj
      ? clusterObj.name
      : (activeClusterId === 'all' ? 'All Taxonomy Clusters (Entire Survey)' : 'Unassigned Papers');
    var clusterColor = clusterObj ? (clusterObj.color || 'var(--accent-primary)') : 'var(--accent-primary)';

    var orderedCols = (typeof window.getOrderedColumnsList === 'function') ? window.getOrderedColumnsList() : [];
    var rawAllCols = window.activeDataColumns || window.activeClusterColumns || [];

    var columnsSummary = [];
    var totalDistinctCount = 0;

    orderedCols.forEach(function (col) {
      var subCols = col.isDynamic ? rawAllCols.filter(function (c) {
        return c.parent_column_id &&
          (c.parent_column_id === col.id ||
           (c.parent_column_name && c.parent_column_name.toLowerCase() === col.name.toLowerCase()));
      }) : [];
      var isSplitCol = col.col_type === 'split' || subCols.length > 0;

      if (isSplitCol) {
        var subKeyMap = new Map();
        papers.forEach(function (p) {
          var idx = paperIndex.get(p.id);
          if (!idx) return;
          var customCols = p.custom_columns || {};
          var rawVal = customCols[col.name] !== undefined ? customCols[col.name]
            : (col.id && customCols[col.id] !== undefined ? customCols[col.id] : '');
          var splitPairs = (typeof window.parseSplitData === 'function') ? window.parseSplitData(rawVal) : null;
          if (Array.isArray(splitPairs)) {
            splitPairs.forEach(function (pair) {
              var k = (pair.key || '').trim();
              var v = (pair.value || '').trim();
              if (k && v) {
                if (!subKeyMap.has(k)) subKeyMap.set(k, new Map());
                var valMap = subKeyMap.get(k);
                extractItems(v).forEach(function (item) {
                  if (!valMap.has(item)) valMap.set(item, new Set());
                  valMap.get(item).add(idx.shortRef);
                });
              }
            });
          }
        });
        subCols.forEach(function (s) {
          var shortK = (s.name.match(/\(([^)]+)\)$/) || [])[1] || s.name;
          if (!subKeyMap.has(shortK)) subKeyMap.set(shortK, new Map());
        });
        var subEntries = [];
        subKeyMap.forEach(function (valMap, k) {
          var valItems = [];
          valMap.forEach(function (refSet, val) {
            totalDistinctCount++;
            valItems.push({ value: val, refs: sortRefs(refSet) });
          });
          subEntries.push({ subKey: k, valItems: valItems });
        });
        columnsSummary.push({ key: col.key, name: col.name, colType: 'split', isDynamic: true, isSplit: true, subEntries: subEntries });

      } else if (col.isDynamic) {
        var valMap2 = new Map();
        papers.forEach(function (p) {
          var idx = paperIndex.get(p.id);
          if (!idx) return;
          var customCols = p.custom_columns || {};
          var rawVal = customCols[col.name] !== undefined ? customCols[col.name]
            : (col.id && customCols[col.id] !== undefined ? customCols[col.id] : '');
          if (rawVal) {
            extractItems(rawVal).forEach(function (item) {
              if (!valMap2.has(item)) valMap2.set(item, new Set());
              valMap2.get(item).add(idx.shortRef);
            });
          }
        });
        var valItems2 = [];
        valMap2.forEach(function (refSet, val) {
          totalDistinctCount++;
          valItems2.push({ value: val, refs: sortRefs(refSet) });
        });
        columnsSummary.push({ key: col.key, name: col.name, colType: col.col_type || 'text', isDynamic: true, isSplit: false, valItems: valItems2 });

      } else {
        var valMap3 = new Map();
        papers.forEach(function (p) {
          var idx = paperIndex.get(p.id);
          if (!idx) return;
          function addVal(v) {
            var k = String(v).trim();
            if (!k) return;
            if (!valMap3.has(k)) valMap3.set(k, new Set());
            valMap3.get(k).add(idx.shortRef);
          }
          if (col.key === 'authors' && p.authors) {
            p.authors.split(/[,;&]|\band\b/i).map(function (a) { return a.trim(); }).filter(Boolean).forEach(addVal);
          } else if (col.key === 'year' && p.year) {
            addVal(String(p.year));
          } else if (col.key === 'domain' && p.domain) {
            extractItems(p.domain).forEach(addVal);
          } else if (col.key === 'pub' && p.pub) {
            addVal(p.pub.trim());
          } else if (col.key === 'status' && p.status) {
            addVal(p.status.replace(/_/g, ' ').toUpperCase());
          } else if (col.key === 'cluster' && p.cluster_name) {
            addVal(p.cluster_name.trim());
          } else if (col.key === 'keywords' && Array.isArray(p.keywords)) {
            p.keywords.forEach(function (k) { if (k) addVal(k.startsWith('#') ? k : '#' + k); });
          } else if (col.key === 'doi' && p.doi) {
            addVal(p.doi.trim());
          }
        });
        var valItems3 = [];
        valMap3.forEach(function (refSet, val) {
          totalDistinctCount++;
          valItems3.push({ value: val, refs: sortRefs(refSet) });
        });
        if (col.key === 'year') {
          valItems3.sort(function (a, b) { return parseInt(a.value, 10) - parseInt(b.value, 10); });
        }
        columnsSummary.push({ key: col.key, name: col.name, colType: 'standard', isDynamic: false, isSplit: false, valItems: valItems3 });
      }
    });

    container.innerHTML = buildSummaryHtml(papers, columnsSummary, clusterTitle, clusterColor, totalDistinctCount, paperIndex);
    if (typeof window.triggerMath === 'function') window.triggerMath(container);
    window._lastSummaryData = { papers: papers, columnsSummary: columnsSummary, clusterTitle: clusterTitle, paperIndex: paperIndex };
  };

  /* ────────────────────────────────────────────────────────────────
     BUILD PAPER INDEX MAP  (id → { index, shortRef, shortTitle, fullTitle })
  ──────────────────────────────────────────────────────────────── */
  function buildPaperIndex(papers) {
    var map = new Map();
    papers.forEach(function (p, i) {
      var num = p.serial_no || (typeof window.getPaperSerialNo === 'function' ? window.getPaperSerialNo(p.id) : (i + 1));
      var title = p.title ? p.title.trim() : ('Paper ' + num);
      var shortTitle = title.length > 58 ? title.substring(0, 55) + '\u2026' : title;
      map.set(p.id, { index: num, shortRef: '#' + num, shortTitle: shortTitle, fullTitle: title, id: p.id });
    });
    return map;
  }

  function sortRefs(refSet) {
    return Array.from(refSet).sort(function (a, b) {
      var na = parseInt(String(a).replace(/[^0-9]/g, ''), 10) || 0;
      var nb = parseInt(String(b).replace(/[^0-9]/g, ''), 10) || 0;
      return na - nb;
    });
  }

  /* ────────────────────────────────────────────────────────────────
     EXTRACT ITEMS FROM RAW VALUE STRING
  ──────────────────────────────────────────────────────────────── */
  function extractItems(raw) {
    if (!raw) return [];
    if (typeof raw !== 'string') return [String(raw)];
    var t = raw.trim();
    if (t.startsWith('$') && t.endsWith('$')) return [t];
    if (t.includes('\n') || t.includes(';') || (t.includes(',') && !t.includes('{'))) {
      return t.split(/[\r\n;]+|(?<!\w\.\w+),(?!\d)/)
        .map(function (s) { return s.replace(/^[-\u2022*]\s*/, '').trim(); })
        .filter(function (s) { return s && s.length > 0 && s !== '-'; });
    }
    return [t];
  }

  /* ────────────────────────────────────────────────────────────────
     BUILD FULL SUMMARY HTML (WITHOUT PAPER REFERENCE INDEX)
  ──────────────────────────────────────────────────────────────── */
  function buildSummaryHtml(papers, columnsSummary, clusterTitle, clusterColor, totalDistinctCount, paperIndex) {
    var gridHtml = renderSummaryCardsHtml(columnsSummary, paperIndex);

    return '<div class="cluster-summary-wrapper">' +

      /* Header */
      '<div class="cluster-summary-header">' +
        '<div class="cluster-summary-title-area">' +
          '<div class="cluster-summary-crest" style="background:' + clusterColor + '18;border:1.5px solid ' + clusterColor + '55;color:' + clusterColor + ';">' +
            '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>' +
              '<polyline points="3.27 6.96 12 12.01 20.73 6.96"/>' +
              '<line x1="12" y1="22.08" x2="12" y2="12"/>' +
            '</svg>' +
          '</div>' +
          '<div>' +
            '<div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">' +
              '<h3 class="cluster-summary-heading">Cluster Insights &amp; Unique Value Summary</h3>' +
              '<span class="cluster-badge" style="background:' + clusterColor + '22;color:' + clusterColor + ';border:1px solid ' + clusterColor + '55;font-size:0.78rem;font-weight:700;padding:0.2rem 0.65rem;border-radius:20px;">' + esc(clusterTitle) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="cluster-summary-actions">' +
          '<div class="summary-telemetry-pills">' +
            '<span class="summary-telemetry-chip"><strong>' + papers.length + '</strong> Papers</span>' +
            '<span class="summary-telemetry-chip"><strong>' + columnsSummary.length + '</strong> Columns</span>' +
            '<span class="summary-telemetry-chip gold"><strong>' + totalDistinctCount + '</strong> Unique Values</span>' +
          '</div>' +
          '<div style="display:flex;gap:0.45rem;align-items:center;">' +
            '<button type="button" class="mini-btn gold" onclick="window.copyFullClusterSummaryToClipboard()" title="Copy Markdown synthesis with paper references">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
              'Copy for Thesis' +
            '</button>' +
            '<button type="button" class="mini-btn" id="btn-toggle-summary-collapse" onclick="window.toggleSummaryCollapse()" title="Collapse / Expand">' +
              '<svg id="summary-toggle-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition:transform 0.2s ease;"><polyline points="6 9 12 15 18 9"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* Cards 65/35 grid (Paper reference legend removed per requirement) */
      '<div class="cluster-summary-grid" id="summary-cards-container" style="' + (isSummaryCollapsed ? 'display:none;' : 'display:grid;') + '">' +
        gridHtml +
      '</div>' +

      '</div>';
  }

  /* ────────────────────────────────────────────────────────────────
     RENDER ALL COLUMN CARDS (65% / 35% SPLIT VIEW)
  ──────────────────────────────────────────────────────────────── */
  function renderSummaryCardsHtml(columnsSummary, paperIndex) {
    if (columnsSummary.length === 0) {
      return '<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--text-tertiary);">No matrix columns configured for this cluster.</div>';
    }
    return columnsSummary.map(function (col) { return buildCardHtml(col, paperIndex); }).join('');
  }

  function buildCardHtml(col, paperIndex) {
    var badgeType = 'Standard';
    var badgeColor = 'var(--text-tertiary)';
    if (col.isSplit) { badgeType = 'Split'; badgeColor = 'var(--accent-purple)'; }
    else if (col.isDynamic) {
      badgeType = col.colType === 'formula' ? 'Formula' : (col.colType === 'tags' ? 'Tags' : 'Custom');
      badgeColor = 'var(--accent-primary)';
    }

    var bodyHtml = '';
    var distinctTotal = 0;

    if (col.isSplit) {
      distinctTotal = (col.subEntries || []).reduce(function (a, e) { return a + e.valItems.length; }, 0);
      if (distinctTotal === 0) {
        bodyHtml = '<div class="summary-empty-state">No sub-values recorded yet</div>';
      } else {
        bodyHtml = '<div class="summary-split-subgroups">' +
          (col.subEntries || []).map(function (sub) {
            return '<div class="summary-split-subgroup">' +
              '<div class="summary-subgroup-title">' + esc(sub.subKey) + ' <span style="opacity:0.7;font-size:0.72rem;font-weight:normal;">(' + sub.valItems.length + ')</span></div>' +
              (sub.valItems.length > 0
                ? '<div class="summary-table-header">' +
                    '<div class="summary-th-val">Unique Value</div>' +
                    '<div class="summary-th-refs">Ref Papers</div>' +
                  '</div>' +
                  '<div class="summary-table-body">' +
                    sub.valItems.map(function (item) {
                      return buildRowHtml(item.value, item.refs, paperIndex, false, false);
                    }).join('') +
                  '</div>'
                : '<div class="summary-empty-sub">No values</div>'
              ) + '</div>';
          }).join('') + '</div>';
      }
    } else {
      distinctTotal = (col.valItems || []).length;
      if (distinctTotal === 0) {
        bodyHtml = '<div class="summary-empty-state">No values recorded yet in this cluster</div>';
      } else {
        var isFormula = col.colType === 'formula';
        var isTag = col.key === 'keywords' || col.colType === 'tags';
        var valHeaderLabel = isFormula ? 'Formula' : (isTag ? 'Keyword / Tag' : 'Unique Value');

        bodyHtml = '<div class="summary-table-header">' +
            '<div class="summary-th-val">' + valHeaderLabel + '</div>' +
            '<div class="summary-th-refs">Ref Papers</div>' +
          '</div>' +
          '<div class="summary-table-body">' +
            (col.valItems || []).map(function (item) {
              return buildRowHtml(item.value, item.refs, paperIndex, isFormula, isTag);
            }).join('') +
          '</div>';
      }
    }

    return '<div class="summary-col-card" data-col-key="' + esc(col.key) + '">' +
      '<div class="summary-col-card-header">' +
        '<div style="display:flex;align-items:center;gap:0.5rem;overflow:hidden;flex:1;">' +
          '<h4 class="summary-col-name" title="' + esc(col.name) + '">' + esc(col.name) + '</h4>' +
          '<span class="summary-type-pill" style="color:' + badgeColor + ';border-color:' + badgeColor + '44;background:' + badgeColor + '11;">' + badgeType + '</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:0.35rem;flex-shrink:0;">' +
          '<span class="summary-distinct-count">' + distinctTotal + ' Distinct</span>' +
          '<button type="button" class="summary-card-toggle-btn" onclick="window.toggleCardRowExpand(this, event)" title="Expand / Collapse all rows in this card">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>' +
          '</button>' +
          '<button type="button" class="summary-card-copy-btn" onclick="window.copySingleColumnSummary(\'' + esc(col.key) + '\',\'' + esc(col.name) + '\')" title="Copy ' + esc(col.name) + ' with paper references">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="summary-col-card-body">' + bodyHtml + '</div>' +
      '</div>';
  }

  /* ────────────────────────────────────────────────────────────────
     BUILD 65/35 ROW HTML (2-LINE CLAMPED VALUE & REF LIST)
  ──────────────────────────────────────────────────────────────── */
  function buildRowHtml(valueText, refs, paperIndex, isFormula, isTag) {
    var valContent = '';
    if (isFormula) {
      valContent = '<div class="summary-formula-val">$$' + esc(valueText.replace(/^\$\$|\$\$$/g, '')) + '$$</div>';
    } else if (isTag) {
      valContent = '<span class="summary-tag-chip">' + esc(valueText) + '</span>';
    } else {
      valContent = '<span class="summary-val-text">' + esc(valueText) + '</span>';
    }

    var refsHtml = buildRefBadges(refs, paperIndex);

    return '<div class="summary-table-row" onclick="this.classList.toggle(\'expanded\')" title="Click row to expand / collapse details">' +
      '<div class="summary-cell-val">' +
        '<div class="summary-val-clamp-2">' + valContent + '</div>' +
      '</div>' +
      '<div class="summary-cell-refs">' +
        '<div class="summary-refs-clamp-2">' + refsHtml + '</div>' +
      '</div>' +
    '</div>';
  }

  function buildRefBadges(refs, paperIndex) {
    if (!refs || refs.length === 0) return '<span style="color:var(--text-tertiary);font-size:0.74rem;">-</span>';
    return refs.map(function (r) {
      var num = String(r).replace(/^#|^P/, '');
      var info = null;
      if (paperIndex) {
        paperIndex.forEach(function(p) {
          if (String(p.index) === String(num)) info = p;
        });
      }
      var tooltip = info ? ('Paper #' + info.index + ': ' + esc(info.fullTitle) + ' (Click to review)') : ('Paper ' + r);
      var paperIdAttr = info ? (' data-paper-id="' + info.id + '"') : '';
      return '<span class="paper-ref-badge" title="' + tooltip + '"' + paperIdAttr + ' onclick="event.stopPropagation(); if (typeof window.openReaderModal === \'function\' && this.dataset.paperId) window.openReaderModal(this.dataset.paperId);">' + esc(r) + '</span>';
    }).join('');
  }

  /* ────────────────────────────────────────────────────────────────
     COPY FULL CLUSTER SUMMARY (Markdown synthesis)
  ──────────────────────────────────────────────────────────────── */
  window.copyFullClusterSummaryToClipboard = function () {
    var snap = window._lastSummaryData;
    if (!snap || !snap.columnsSummary) {
      if (typeof showToast === 'function') showToast('No summary available to copy', 'warning');
      return;
    }
    var papers = snap.papers;
    var columnsSummary = snap.columnsSummary;
    var clusterTitle = snap.clusterTitle;
    var paperIndex = snap.paperIndex;
    var date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    var md = '# Literature Review Synthesis\n';
    md += '**Cluster:** ' + clusterTitle + '\n';
    md += '**Papers Analyzed:** ' + papers.length + '\n';
    md += '**Date:** ' + date + '\n\n---\n\n';

    columnsSummary.forEach(function (col) {
      md += '## ' + col.name + '\n';
      if (col.isSplit) {
        (col.subEntries || []).forEach(function (sub) {
          md += '### ' + sub.subKey + '\n';
          if (sub.valItems && sub.valItems.length > 0) {
            sub.valItems.forEach(function (item) {
              md += '- ' + item.value + '  *(' + item.refs.join(', ') + ')*\n';
            });
          } else { md += '*No values recorded*\n'; }
        });
      } else {
        if (col.valItems && col.valItems.length > 0) {
          col.valItems.forEach(function (item) {
            md += '- ' + item.value + '  *(' + item.refs.join(', ') + ')*\n';
          });
        } else { md += '*No values recorded in this cluster*\n'; }
      }
      md += '\n';
    });

    navigator.clipboard.writeText(md.trim()).then(function () {
      if (typeof showToast === 'function')
        showToast('Summary for "' + clusterTitle + '" copied to clipboard (Markdown)!', 'success');
    }).catch(function (err) {
      if (typeof showToast === 'function') showToast('Failed to copy: ' + err.message, 'error');
    });
  };

  /* ────────────────────────────────────────────────────────────────
     COPY SINGLE COLUMN SUMMARY
  ──────────────────────────────────────────────────────────────── */
  window.copySingleColumnSummary = function (colKey, colName) {
    var snap = window._lastSummaryData;
    if (!snap) return;
    var col = snap.columnsSummary.find(function (c) { return c.key === colKey; });
    if (!col) return;

    var lines = [];
    if (col.isSplit) {
      (col.subEntries || []).forEach(function (sub) {
        lines.push(sub.subKey + ':');
        (sub.valItems || []).forEach(function (item) {
          lines.push('  \u2022 ' + item.value + '  (' + item.refs.join(', ') + ')');
        });
      });
    } else {
      (col.valItems || []).forEach(function (item) {
        lines.push('\u2022 ' + item.value + '  (' + item.refs.join(', ') + ')');
      });
    }

    if (lines.length === 0) {
      if (typeof showToast === 'function') showToast('No values to copy for "' + colName + '"', 'info');
      return;
    }

    var text = colName + ' \u2014 ' + snap.clusterTitle + ':\n' + lines.join('\n');
    navigator.clipboard.writeText(text).then(function () {
      if (typeof showToast === 'function')
        showToast('"' + colName + '" unique values with paper references copied!', 'success');
    }).catch(function (err) {
      if (typeof showToast === 'function') showToast('Failed to copy: ' + err.message, 'error');
    });
  };

  /* ────────────────────────────────────────────────────────────────
     UTILITY: HTML escape
  ──────────────────────────────────────────────────────────────── */
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();

