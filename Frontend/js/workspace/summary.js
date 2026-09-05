/**
 * LITSPHERE CLUSTER INSIGHTS & UNIQUE VALUE SUMMARY ENGINE
 * =======================================================================
 * Auto-renders below the master matrix table for every cluster page and full survey.
 * - Prioritizes 3 essential columns first:
 *     1. Advantages
 *     2. Criticism
 *     3. Future Research Direction
 *   followed by remaining columns (Cluster, Year, Publisher, Authors, Domain, etc.)
 * - Full Drag-and-Drop support to reorder single summary tables anywhere in the grid
 * - Persists custom table arrangement per survey in localStorage
 * - 65% / 35% Split View (Unique Value / Ref Papers)
 * - Available seamlessly across all clusters and filtered subsets
 * - Direct paper viewer trigger on serial badge click
 * - "Copy for Thesis" Markdown synthesis export
 */

(function () {
  'use strict';

  let isSummaryCollapsed = false;
  window._summaryColumnSearchQuery = '';

  /* ────────────────────────────────────────────────────────────────
     SEARCH / FILTER COLUMNS IN CLUSTER SUMMERY
  ──────────────────────────────────────────────────────────────── */
  window.handleSummaryColumnSearch = function (query) {
    window._summaryColumnSearchQuery = query || '';
    var q = (query || '').trim().toLowerCase();
    var clearBtn = document.getElementById('btn-clear-summary-search');
    if (clearBtn) clearBtn.style.display = q ? 'inline-flex' : 'none';

    var container = document.getElementById('summary-cards-container');
    if (!container) return;

    // If section was collapsed and user searches, uncollapse so results are visible
    if (q && isSummaryCollapsed && typeof window.toggleSummaryCollapse === 'function') {
      window.toggleSummaryCollapse();
    }

    var cards = container.querySelectorAll('.summary-col-card');
    var visibleCount = 0;

    cards.forEach(function (card) {
      if (!q) {
        card.style.display = '';
        visibleCount++;
        return;
      }
      var colName = (card.getAttribute('data-col-name') || '').toLowerCase();
      var colKey = (card.getAttribute('data-col-key') || '').toLowerCase();
      var colType = (card.getAttribute('data-col-type') || '').toLowerCase();
      var subNames = (card.getAttribute('data-sub-names') || '').toLowerCase();

      var match = colName.indexOf(q) !== -1 || colKey.indexOf(q) !== -1 || colType.indexOf(q) !== -1 || subNames.indexOf(q) !== -1;
      if (match) {
        card.style.display = '';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    var colPill = document.getElementById('summary-telemetry-cols');
    if (colPill) {
      if (q) {
        colPill.innerHTML = '<strong>' + visibleCount + '</strong> of ' + cards.length + ' Columns';
        colPill.classList.add('active-filter');
      } else {
        colPill.innerHTML = '<strong>' + cards.length + '</strong> Columns';
        colPill.classList.remove('active-filter');
      }
    }

    var emptyNotice = document.getElementById('summary-search-empty-notice');
    if (q && visibleCount === 0) {
      if (!emptyNotice) {
        emptyNotice = document.createElement('div');
        emptyNotice.id = 'summary-search-empty-notice';
        emptyNotice.className = 'summary-search-empty-notice';
        container.appendChild(emptyNotice);
      }
      emptyNotice.style.display = 'block';
      emptyNotice.innerHTML = '<div style="padding:2.5rem 1.5rem;text-align:center;color:var(--text-secondary);grid-column:1/-1;">' +
        '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:0.75rem;opacity:0.6;color:var(--text-tertiary);"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>' +
        '<div style="font-weight:700;font-size:1rem;color:var(--text-primary);margin-bottom:0.35rem;">No matching columns found</div>' +
        '<div style="font-size:0.84rem;color:var(--text-tertiary);margin-bottom:1rem;">No column matching "<strong>' + esc(q) + '</strong>" in Cluster Summery.</div>' +
        '<button type="button" class="mini-btn" onclick="window.clearSummaryColumnSearch()" style="margin:0 auto;display:inline-flex;">Clear Search</button>' +
      '</div>';
    } else if (emptyNotice) {
      emptyNotice.style.display = 'none';
    }
  };

  window.clearSummaryColumnSearch = function () {
    window._summaryColumnSearchQuery = '';
    var input = document.getElementById('summary-column-search-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    window.handleSummaryColumnSearch('');
  };

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
     APPLY COLUMNS ORDERING (Default: Advantages, Criticism, Future Directions)
  ──────────────────────────────────────────────────────────────── */
  function applySummaryColumnsOrdering(colsSummary, projId) {
    var pId = projId || (new URLSearchParams(window.location.search).get('project') || 1);
    var storageKey = 'litsphere_summary_order_' + pId;
    var savedOrder = null;
    try {
      var raw = localStorage.getItem(storageKey);
      if (raw) savedOrder = JSON.parse(raw);
    } catch (e) {
      savedOrder = null;
    }

    if (Array.isArray(savedOrder) && savedOrder.length > 0) {
      // Ensure 'domain' and 'keywords' are not pushed to index 999 if missing from savedOrder
      if (!savedOrder.includes('domain')) {
        var cIdx = savedOrder.indexOf('cluster');
        if (cIdx !== -1) savedOrder.splice(cIdx + 1, 0, 'domain');
        else savedOrder.push('domain');
      }
      if (!savedOrder.includes('keywords')) {
        var fIdx = savedOrder.indexOf('future_directions');
        if (fIdx !== -1) savedOrder.splice(fIdx + 1, 0, 'keywords');
        else savedOrder.push('keywords');
      }
      var orderMap = new Map();
      savedOrder.forEach(function (k, idx) { orderMap.set(String(k).toLowerCase(), idx); });
      return colsSummary.slice().sort(function (a, b) {
        var idxA = orderMap.has(String(a.key).toLowerCase()) ? orderMap.get(String(a.key).toLowerCase()) : 999;
        var idxB = orderMap.has(String(b.key).toLowerCase()) ? orderMap.get(String(b.key).toLowerCase()) : 999;
        return idxA - idxB;
      });
    }

    // Default Priority: 1. Advantages, 2. Criticism, 3. Future Research Direction, 4. Domain, 5. Keywords, followed by others
    var priorityKeys = ['advantages', 'criticism', 'future_directions', 'domain', 'keywords'];
    return colsSummary.slice().sort(function (a, b) {
      var pIdxA = priorityKeys.indexOf(String(a.key).toLowerCase());
      var pIdxB = priorityKeys.indexOf(String(b.key).toLowerCase());
      if (pIdxA !== -1 && pIdxB !== -1) return pIdxA - pIdxB;
      if (pIdxA !== -1) return -1;
      if (pIdxB !== -1) return 1;
      return 0;
    });
  }

  /* ────────────────────────────────────────────────────────────────
     DRAG AND DROP HANDLERS FOR SUMMARY TABLES
  ──────────────────────────────────────────────────────────────── */
  window.handleSummaryCardDragStart = function (e, colKey) {
    window._draggedSummaryKey = colKey;
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', colKey);
      e.dataTransfer.effectAllowed = 'move';
    }
    var card = e.currentTarget.closest('.summary-col-card') || e.currentTarget;
    if (card) {
      setTimeout(function () {
        card.classList.add('is-dragging');
      }, 0);
    }
  };

  window.handleSummaryCardDragOver = function (e) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  };

  window.handleSummaryCardDragEnter = function (e, cardEl) {
    e.preventDefault();
    if (cardEl && cardEl.getAttribute('data-col-key') !== window._draggedSummaryKey) {
      cardEl.classList.add('drag-target-over');
    }
  };

  window.handleSummaryCardDragLeave = function (e, cardEl) {
    if (cardEl) {
      cardEl.classList.remove('drag-target-over');
    }
  };

  window.handleSummaryCardDrop = function (e, targetKey) {
    e.preventDefault();
    e.stopPropagation();

    document.querySelectorAll('.summary-col-card').forEach(function (c) {
      c.classList.remove('drag-target-over');
      c.classList.remove('is-dragging');
    });

    var draggedKey = window._draggedSummaryKey || (e.dataTransfer ? e.dataTransfer.getData('text/plain') : null);
    if (!draggedKey || String(draggedKey).toLowerCase() === String(targetKey).toLowerCase()) return;

    var snap = window._lastSummaryData;
    if (!snap || !snap.columnsSummary) return;

    var cols = snap.columnsSummary;
    var fromIdx = cols.findIndex(function (c) { return String(c.key).toLowerCase() === String(draggedKey).toLowerCase(); });
    var toIdx = cols.findIndex(function (c) { return String(c.key).toLowerCase() === String(targetKey).toLowerCase(); });

    if (fromIdx === -1 || toIdx === -1) return;

    var item = cols.splice(fromIdx, 1)[0];
    cols.splice(toIdx, 0, item);

    var projId = (typeof activeProjectId !== 'undefined' && activeProjectId)
      ? activeProjectId
      : (new URLSearchParams(window.location.search).get('project') || 1);

    var newOrder = cols.map(function (c) { return c.key; });
    try {
      localStorage.setItem('litsphere_summary_order_' + projId, JSON.stringify(newOrder));
    } catch (err) {
      console.warn('Could not save summary order to localStorage:', err);
    }

    // Smoothly re-render summary cards grid
    var gridContainer = document.getElementById('summary-cards-container');
    if (gridContainer) {
      gridContainer.innerHTML = renderSummaryCardsHtml(cols, snap.paperIndex);
      if (typeof window.triggerMath === 'function') window.triggerMath(gridContainer);
    }

    if (typeof showToast === 'function') {
      showToast('Summary table reordered', 'info');
    }
  };

  window.handleSummaryCardDragEnd = function (e) {
    window._draggedSummaryKey = null;
    document.querySelectorAll('.summary-col-card').forEach(function (c) {
      c.classList.remove('drag-target-over');
      c.classList.remove('is-dragging');
    });
  };

  window.resetSummaryCardsOrder = function () {
    var projId = (typeof activeProjectId !== 'undefined' && activeProjectId)
      ? activeProjectId
      : (new URLSearchParams(window.location.search).get('project') || 1);
    try {
      localStorage.removeItem('litsphere_summary_order_' + projId);
    } catch (e) {}
    if (typeof window.renderClusterSummary === 'function') {
      window.renderClusterSummary();
    }
    if (typeof showToast === 'function') {
      showToast('Summary tables reset to default order (Advantages, Criticism, Future Directions first)', 'info');
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
          if (col.key === 'advantages') {
            var advRaw = p.advantages || p.strengths || (p.custom_columns && (p.custom_columns['Advantages'] || p.custom_columns['advantages'] || p.custom_columns['Strengths'])) || '';
            extractItems(advRaw).forEach(addVal);
          } else if (col.key === 'criticism') {
            var critRaw = p.criticism || p.gaps || (p.custom_columns && (p.custom_columns['Criticism'] || p.custom_columns['criticism'] || p.custom_columns['Gaps'])) || '';
            extractItems(critRaw).forEach(addVal);
          } else if (col.key === 'future_directions') {
            var futRaw = p.future_directions || p.future_research_direction || (p.custom_columns && (p.custom_columns['Future Research Direction'] || p.custom_columns['future_directions'] || p.custom_columns['Future Directions'])) || '';
            extractItems(futRaw).forEach(addVal);
          } else if (col.key === 'authors' && p.authors) {
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
          } else if (col.key === 'keywords') {
            var kwList = [];
            if (Array.isArray(p.keywords)) {
              kwList = p.keywords;
            } else if (typeof p.keywords === 'string' && p.keywords.trim()) {
              try {
                var parsedKw = JSON.parse(p.keywords);
                if (Array.isArray(parsedKw)) kwList = parsedKw;
                else kwList = p.keywords.split(/[,;\n]+/);
              } catch (e) {
                kwList = p.keywords.split(/[,;\n]+/);
              }
            }
            kwList.forEach(function (k) {
              var clean = String(k || '').trim().replace(/^#/, '');
              if (clean) addVal('#' + clean);
            });
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

    var projId = (typeof activeProjectId !== 'undefined' && activeProjectId)
      ? activeProjectId
      : (new URLSearchParams(window.location.search).get('project') || 1);

    // Apply Priority Ordering (Advantages, Criticism, Future Directions) or Custom Stored Drag-Drop Order
    columnsSummary = applySummaryColumnsOrdering(columnsSummary, projId);

    container.innerHTML = buildSummaryHtml(papers, columnsSummary, clusterTitle, clusterColor, totalDistinctCount, paperIndex);
    if (typeof window.triggerMath === 'function') window.triggerMath(container);
    window._lastSummaryData = { papers: papers, columnsSummary: columnsSummary, clusterTitle: clusterTitle, paperIndex: paperIndex };
    if (window._summaryColumnSearchQuery) {
      window.handleSummaryColumnSearch(window._summaryColumnSearchQuery);
    }
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
     BUILD FULL SUMMARY HTML
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
              '<h3 class="cluster-summary-heading">Cluster Summery</h3>' +
              '<span class="cluster-badge" style="background:' + clusterColor + '22;color:' + clusterColor + ';border:1px solid ' + clusterColor + '55;font-size:0.78rem;font-weight:700;padding:0.2rem 0.65rem;border-radius:20px;">' + esc(clusterTitle) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="cluster-summary-actions">' +
          '<div class="summary-columns-search-box" id="summary-columns-search-box">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="summary-search-icon">' +
              '<circle cx="11" cy="11" r="8"></circle>' +
              '<line x1="21" y1="21" x2="16.65" y2="16.65"></line>' +
            '</svg>' +
            '<input type="text" id="summary-column-search-input" class="summary-search-input" placeholder="Search columns..." value="' + esc(window._summaryColumnSearchQuery || '') + '" autocomplete="off" oninput="window.handleSummaryColumnSearch(this.value)" onkeydown="if(event.key===\'Escape\') window.clearSummaryColumnSearch()">' +
            '<button type="button" class="summary-search-clear" id="btn-clear-summary-search" onclick="window.clearSummaryColumnSearch()" style="' + (window._summaryColumnSearchQuery ? 'display:inline-flex;' : 'display:none;') + '" title="Clear search">✕</button>' +
          '</div>' +
          '<div class="summary-telemetry-pills">' +
            '<span class="summary-telemetry-chip"><strong>' + papers.length + '</strong> Papers</span>' +
            '<span class="summary-telemetry-chip" id="summary-telemetry-cols"><strong>' + columnsSummary.length + '</strong> Columns</span>' +
            '<span class="summary-telemetry-chip gold"><strong>' + totalDistinctCount + '</strong> Unique Values</span>' +
          '</div>' +
          '<div style="display:flex;gap:0.45rem;align-items:center;">' +
            '<button type="button" class="mini-btn" id="btn-reset-summary-order" onclick="window.resetSummaryCardsOrder()" title="Reset summary cards order to default (Advantages, Criticism, Future Directions first)">' +
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:3px;"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>' +
              'Reset Order' +
            '</button>' +
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

      /* Cards 65/35 grid */
      '<div class="cluster-summary-grid" id="summary-cards-container" style="' + (isSummaryCollapsed ? 'display:none;' : 'display:grid;') + '">' +
        gridHtml +
      '</div>' +

      '</div>';
  }

  /* ────────────────────────────────────────────────────────────────
     RENDER ALL COLUMN CARDS (65% / 35% SPLIT VIEW & DRAG-AND-DROP)
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
    else if (col.key === 'advantages') { badgeType = 'Core'; badgeColor = 'var(--accent-emerald, #10b981)'; }
    else if (col.key === 'criticism') { badgeType = 'Core'; badgeColor = 'var(--accent-rose, #f43f5e)'; }
    else if (col.key === 'future_directions') { badgeType = 'Core'; badgeColor = 'var(--accent-amber, #f59e0b)'; }
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

    return '<div class="summary-col-card" ' +
      'draggable="true" ' +
      'data-col-key="' + esc(col.key) + '" ' +
      'data-col-name="' + esc(col.name).toLowerCase() + '" ' +
      'data-col-type="' + esc(badgeType).toLowerCase() + '" ' +
      (col.isSplit && col.subEntries ? 'data-sub-names="' + esc(col.subEntries.map(function (s) { return s.subKey; }).join(' ')).toLowerCase() + '" ' : '') +
      'ondragstart="window.handleSummaryCardDragStart(event, \'' + esc(col.key) + '\')" ' +
      'ondragover="window.handleSummaryCardDragOver(event)" ' +
      'ondragenter="window.handleSummaryCardDragEnter(event, this)" ' +
      'ondragleave="window.handleSummaryCardDragLeave(event, this)" ' +
      'ondrop="window.handleSummaryCardDrop(event, \'' + esc(col.key) + '\')" ' +
      'ondragend="window.handleSummaryCardDragEnd(event)">' +
      '<div class="summary-col-card-header">' +
        '<div style="display:flex;align-items:flex-start;gap:0.45rem;min-width:0;flex:1;">' +
          '<span class="summary-drag-handle" title="Drag to reorder summary table" style="margin-top:2px;">' +
            '<svg width="10" height="14" viewBox="0 0 10 16" fill="currentColor"><circle cx="3" cy="3" r="1.5"/><circle cx="7" cy="3" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="7" cy="8" r="1.5"/><circle cx="3" cy="13" r="1.5"/><circle cx="7" cy="13" r="1.5"/></svg>' +
          '</span>' +
          '<h4 class="summary-col-name" title="' + esc(col.name) + '">' + esc(col.name) + '</h4>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:0.35rem;flex-shrink:0;">' +
          '<span class="summary-distinct-count">' + distinctTotal + ' Distinct</span>' +
          '<button type="button" class="summary-card-toggle-btn" onclick="window.toggleCardRowExpand(this, event)" title="Expand / Collapse all rows in this card">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>' +
          '</button>' +
          '<button type="button" class="summary-card-export-btn" onclick="window.exportSingleColumnToExcel(\'' + esc(col.key) + '\',\'' + esc(col.name) + '\', event)" title="Export ' + esc(col.name) + ' to Excel (.xlsx)">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
            '<span>Excel</span>' +
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

    var text = colName + ' — ' + snap.clusterTitle + ':\n' + lines.join('\n');
    navigator.clipboard.writeText(text).then(function () {
      if (typeof showToast === 'function')
        showToast('"' + colName + '" unique values with paper references copied!', 'success');
    }).catch(function (err) {
      if (typeof showToast === 'function') showToast('Failed to copy: ' + err.message, 'error');
    });
  };

  /* ────────────────────────────────────────────────────────────────
     EXPORT SPECIFIC COLUMN TO EXCEL (.xlsx)
  ──────────────────────────────────────────────────────────────── */
  window.exportSingleColumnToExcel = async function (colKey, colName, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    var snap = window._lastSummaryData;
    if (!snap || !snap.columnsSummary) {
      if (typeof showToast === 'function') showToast('No summary data available for export', 'warning');
      return;
    }

    var col = snap.columnsSummary.find(function (c) {
      return String(c.key).toLowerCase() === String(colKey).toLowerCase();
    });
    if (!col) {
      if (typeof showToast === 'function') showToast('Column data not found for export', 'warning');
      return;
    }

    var clusterTitle = snap.clusterTitle || 'Cluster Summary';
    var papers = snap.papers || [];
    var paperIndex = snap.paperIndex || new Map();

    // Ensure SheetJS is available
    if (typeof XLSX === 'undefined') {
      try {
        await loadScriptAsync('/vendor/xlsx.full.min.js');
      } catch (err) {
        var projId = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : 1;
        var clusterId = (typeof activeClusterId !== 'undefined' && activeClusterId) ? activeClusterId : 'all';
        window.location.href = '/api/export?project_id=' + projId + '&cluster_id=' + clusterId + '&format=xlsx&cols=' + encodeURIComponent(colKey);
        return;
      }
    }

    try {
      var wb = XLSX.utils.book_new();

      /* ── Sheet 1: Unique Values & Reference Papers ── */
      var isSplit = col.isSplit && Array.isArray(col.subEntries);
      var totalDistinct = isSplit
        ? col.subEntries.reduce(function (acc, s) { return acc + (s.valItems ? s.valItems.length : 0); }, 0)
        : (col.valItems ? col.valItems.length : 0);

      var summaryRows = [
        ['Survey Cluster', clusterTitle],
        ['Column Name', col.name],
        ['Total Distinct Values', totalDistinct],
        ['Total Survey Papers', papers.length],
        []
      ];

      if (isSplit) {
        summaryRows.push(['#', 'Sub-Category', 'Unique Value / Tag', 'Paper Count', 'Ref Paper Codes', 'Paper Citations & Details']);
        var sNum = 1;
        col.subEntries.forEach(function (sub) {
          (sub.valItems || []).forEach(function (item) {
            var refCitations = (item.refs || []).map(function (refCode) {
              var p = paperIndex.get(refCode);
              return p ? (refCode + ': ' + (p.authors ? p.authors + ', ' : '') + '"' + (p.title || '') + '" (' + (p.year || '') + ')') : refCode;
            }).join(';\r\n');

            summaryRows.push([
              sNum++,
              sub.subKey,
              item.value,
              (item.refs || []).length,
              (item.refs || []).join(', '),
              refCitations
            ]);
          });
        });
      } else {
        var valHeader = col.key === 'keywords' ? 'Keyword / Tag' : (col.colType === 'formula' ? 'Formula' : 'Unique Value');
        summaryRows.push(['#', valHeader, 'Paper Count', 'Ref Paper Codes', 'Paper Citations & Details']);
        var num = 1;
        (col.valItems || []).forEach(function (item) {
          var refCitations = (item.refs || []).map(function (refCode) {
            var p = paperIndex.get(refCode);
            return p ? (refCode + ': ' + (p.authors ? p.authors + ', ' : '') + '"' + (p.title || '') + '" (' + (p.year || '') + ')') : refCode;
          }).join(';\r\n');

          summaryRows.push([
            num++,
            item.value,
            (item.refs || []).length,
            (item.refs || []).join(', '),
            refCitations
          ]);
        });
      }

      /* ── Column width auto-fitting to cell maximum size ── */
      function getVisualCharLength(str) {
        if (!str) return 0;
        var len = 0;
        for (var i = 0; i < str.length; i++) {
          var code = str.charCodeAt(i);
          if ((code >= 0x1100 && code <= 0x115f) ||
              (code >= 0x2e80 && code <= 0xa4cf) ||
              (code >= 0xac00 && code <= 0xd7a3) ||
              (code >= 0xf900 && code <= 0xfaff) ||
              (code >= 0xfe10 && code <= 0xfe19) ||
              (code >= 0xfe30 && code <= 0xfe6f) ||
              (code >= 0xff00 && code <= 0xff60) ||
              (code >= 0xffe0 && code <= 0xffe6)) {
            len += 2;
          } else {
            len += 1;
          }
        }
        return len;
      }

      function autoFitCols(rows, options) {
        options = options || {};
        var padding = options.padding !== undefined ? options.padding : 4;
        var minWidth = options.minWidth || 8;
        var maxWidth = options.maxWidth || 250;
        var colMaxLens = [];

        rows.forEach(function (row) {
          if (!Array.isArray(row)) return;
          row.forEach(function (val, cIdx) {
            if (val === null || val === undefined) return;
            var str = String(val);
            var lines = str.split(/\r?\n/);
            var maxLenInCell = 0;
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i].trim();
              var visualLen = getVisualCharLength(line);
              if (visualLen > maxLenInCell) maxLenInCell = visualLen;
            }
            if (!colMaxLens[cIdx] || maxLenInCell > colMaxLens[cIdx]) {
              colMaxLens[cIdx] = maxLenInCell;
            }
          });
        });

        return colMaxLens.map(function (maxLen) {
          var w = (maxLen || 0) + padding;
          if (w < minWidth) w = minWidth;
          if (maxWidth && w > maxWidth) w = maxWidth;
          return { wch: w };
        });
      }

      var wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      wsSummary['!cols'] = autoFitCols(summaryRows, { minWidth: 8, padding: 4, maxWidth: 250 });
      wsSummary['!rows'] = [
        { hpt: 22 }, // Survey Cluster
        { hpt: 20 }, // Column Name
        { hpt: 20 }, // Total Distinct Values
        { hpt: 20 }, // Total Survey Papers
        { hpt: 12 }, // Spacer row
        { hpt: 26 }  // Table Header row
      ];
      wsSummary['!views'] = [{ state: 'frozen', ySplit: 6 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Unique Values');

      /* ── Sheet 2: Papers Breakdown ── */
      var paperRows = [
        ['#', 'Paper ID', 'Paper Title', 'Authors', 'Year', 'Venue', 'Cluster', col.name + ' (Extracted Content)']
      ];

      papers.forEach(function (p, idx) {
        var paperCode = '';
        var idxInfo = paperIndex.get(p.id);
        if (idxInfo && idxInfo.shortRef) paperCode = idxInfo.shortRef;
        else paperCode = '#' + (idx + 1);

        var rawContent = '';
        if (col.key === 'advantages') {
          rawContent = p.advantages || p.strengths || (p.custom_columns && (p.custom_columns['Advantages'] || p.custom_columns['advantages'] || p.custom_columns['Strengths'])) || '';
        } else if (col.key === 'criticism') {
          rawContent = p.criticism || p.gaps || (p.custom_columns && (p.custom_columns['Criticism'] || p.custom_columns['criticism'] || p.custom_columns['Gaps'])) || '';
        } else if (col.key === 'future_directions') {
          rawContent = p.future_directions || p.future_research_direction || (p.custom_columns && (p.custom_columns['Future Research Direction'] || p.custom_columns['future_directions'] || p.custom_columns['Future Directions'])) || '';
        } else if (col.key === 'authors') {
          rawContent = p.authors || '';
        } else if (col.key === 'year') {
          rawContent = String(p.year || '');
        } else if (col.key === 'domain') {
          rawContent = p.domain || '';
        } else if (col.key === 'pub') {
          rawContent = p.pub || '';
        } else if (col.key === 'status') {
          rawContent = (p.status || '').replace(/_/g, ' ').toUpperCase();
        } else if (col.key === 'cluster') {
          rawContent = p.cluster_name || '';
        } else if (col.key === 'keywords') {
          if (Array.isArray(p.keywords)) rawContent = p.keywords.join(', ');
          else rawContent = p.keywords || '';
        } else if (col.key === 'doi') {
          rawContent = p.doi || p.pdf_url || '';
        } else if (col.isDynamic) {
          var customCols = p.custom_columns || {};
          rawContent = customCols[col.name] !== undefined ? customCols[col.name]
            : (col.id && customCols[col.id] !== undefined ? customCols[col.id] : '');
          if (typeof rawContent === 'object') {
            rawContent = JSON.stringify(rawContent);
          }
        }

        paperRows.push([
          idx + 1,
          paperCode,
          p.title || 'Untitled',
          p.authors || '',
          p.year || '',
          p.pub || '',
          p.cluster_name || clusterTitle,
          String(rawContent || '')
        ]);
      });

      var wsPapers = XLSX.utils.aoa_to_sheet(paperRows);
      wsPapers['!cols'] = autoFitCols(paperRows, { minWidth: 8, padding: 4, maxWidth: 250 });
      wsPapers['!rows'] = [{ hpt: 26 }]; // Header row
      wsPapers['!views'] = [{ state: 'frozen', ySplit: 1 }];
      XLSX.utils.book_append_sheet(wb, wsPapers, 'Papers');

      wb.Props = {
        Title: col.name + ' - ' + clusterTitle,
        Subject: 'Cluster Summary (' + col.name + ')',
        Author: 'Literature Review Workspace',
        CreatedDate: new Date()
      };

      var cleanColName = col.name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/__+/g, '_');
      var cleanCluster = clusterTitle.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/__+/g, '_');
      var fileName = cleanCluster + '_' + cleanColName + '_Summary.xlsx';

      XLSX.writeFile(wb, fileName);
      if (typeof showToast === 'function') {
        showToast('Exported "' + col.name + '" to Excel successfully (' + fileName + ')', 'success');
      }
    } catch (exportErr) {
      console.error('Single column Excel export error:', exportErr);
      if (typeof showToast === 'function') {
        showToast('Export error: ' + exportErr.message, 'error');
      }
    }
  };

  function loadScriptAsync(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) {
        resolve();
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

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

