/**
 * LITSPHERE PAPERS CARDS VIEW ENGINE
 * Renders academic card layouts, deep dive technical drawers, MathJax formulas, and props.
 */

window.renderCards = function(papers) {
  const container = document.getElementById('cards-container') || document.getElementById('papers-container');
  if (!container) return;
  container.innerHTML = '';

  if (papers.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 4rem 1rem; color: var(--text-tertiary);">
        <div style="margin-bottom: 0.75rem; color: var(--accent-primary); opacity: 0.8;"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div>
        <div style="font-size: 1.15rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.35rem;">No Research Papers Found</div>
        <p style="font-size: 0.9rem;">Add a new paper or ingest DOIs/PDFs to populate this workspace.</p>
      </div>
    `;
    return;
  }

  const role = (window.currentProjectRole || 'viewer').toLowerCase();
  const isOwner = role === 'owner';
  const isEditor = role === 'editor';
  const canModify = isOwner || isEditor;

  papers.forEach(p => {
    const card = document.createElement('div');
    card.className = 'paper-card';
    card.setAttribute('data-paper-id', p.id);

    const cl = allClusters.find(c => c.id === p.cluster_id);
    const clusterName = cl ? cl.name : 'Unassigned';
    const clusterColor = cl ? cl.color || 'var(--accent-primary)' : 'var(--text-muted)';
    const statusVal = p.status || 'unread';

    const pdfLink = p.pdf_url ? (p.pdf_url.startsWith('http') || p.pdf_url.startsWith('/') ? p.pdf_url : '/' + p.pdf_url) : '';

    const propsHtml = buildCardProps(p);
    const insightsHtml = buildCardInsights(p);
    const keywordsHtml = (p.keywords && p.keywords.length > 0)
      ? `<div class="keywords-row">${p.keywords.map(k => {
          const isSel = window.selectedKeywords && (window.selectedKeywords.has(k) || Array.from(window.selectedKeywords).some(sk => sk.toLowerCase() === k.toLowerCase()));
          return `<span class="kw-tag ${isSel ? 'active' : ''}" onclick="event.stopPropagation(); if (typeof window.toggleKeywordFilter === 'function') window.toggleKeywordFilter('${k.replace(/'/g, "\\'")}');" title="Click to filter papers by #${k}">#${k}</span>`;
        }).join('')}</div>`
      : '';

    const validAuthors = (p.authors && p.authors !== '-' && p.authors.trim() !== '') ? p.authors : 'Authors pending extraction';
    const validPub = (p.pub && p.pub !== '-' && p.pub.trim() !== '' && p.pub !== '—') ? p.pub : '';

    card.innerHTML = `
      <div>
        <div class="card-meta-row">
          <div class="meta-tag-group">
            <span class="domain-tag" style="font-family:var(--font-mono); font-weight:700; color:var(--accent-primary); background:rgba(56,189,248,0.12); border-color:rgba(56,189,248,0.3);" title="Static Paper Reference Number">#${p.serial_no || (typeof window.getPaperSerialNo === 'function' ? window.getPaperSerialNo(p.id) : '')}</span>
            <span class="subfamily-tag" style="background:${cl ? cl.color + '22' : 'var(--accent-muted)'}; color:${clusterColor}">${clusterName}</span>
            ${(() => {
              const doms = (p.domain && p.domain !== '-')
                ? p.domain.split(/[,;/]+/).map(d => d.trim()).filter(Boolean)
                : ['General'];
              const curDom = (window.currentDomain || '').toLowerCase().trim();
              return doms.map(d => {
                const isSel = curDom && curDom !== 'all' && curDom === d.toLowerCase();
                return `<span class="domain-tag ${isSel ? 'active' : ''}" onclick="event.stopPropagation(); if (typeof window.toggleDomainFilter === 'function') window.toggleDomainFilter('${escapeHtml(d)}');" title="Filter by Domain: ${escapeHtml(d)}">${escapeHtml(d)}</span>`;
              }).join('');
            })()}
            ${p.year && p.year !== '-' ? `<span class="domain-tag" style="font-family:var(--font-mono); font-weight:700;">${p.year}</span>` : ''}
          </div>
          <span class="status-badge status-${statusVal}" ${canModify ? `onclick="cyclePaperStatus(${p.id}, '${statusVal}', event)" style="cursor:pointer;" title="Click to cycle reading status"` : `style="cursor:default;" title="Reading Status: ${statusVal.replace('_', ' ')}"`}>${statusVal.replace('_', ' ')}</span>
        </div>

        <h3 class="paper-title" onclick="window.handlePaperTitleClick(${p.id}, event)" title="Click to view full paper in browser">${escapeHtml(p.title || 'Untitled Paper')}</h3>
        <div class="paper-authors">${escapeHtml(validAuthors)} ${validPub ? `• <span style="font-style:italic;">${escapeHtml(validPub)}</span>` : ''}</div>

        ${p.intuition ? `
          <div class="concept-box">
            <strong>Core Concept:</strong> ${p.intuition}
          </div>
        ` : ''}

        ${p.equation ? `
          <div class="formula-card">
            <div class="formula-header">Key Mathematical Formulation</div>
            <div>${p.equation}</div>
          </div>
        ` : ''}

        ${propsHtml}
        ${insightsHtml}
        ${keywordsHtml}
      </div>

      <div class="card-footer">
        <span class="dataset-tag">${p.doi ? `DOI: ${p.doi}` : (p.pdf_url ? 'PDF Linked' : 'Index Matrix')}</span>
        <div class="card-actions-group">
          <button class="btn-reader" onclick="openReaderModal(${p.id})">Deep Review</button>
          ${pdfLink ? `<a href="${pdfLink}" target="_blank" class="mini-btn gold" title="View PDF">PDF</a>` : ''}
          ${isOwner ? `
            <button class="mini-btn danger" onclick="deletePaper(${p.id}, event)" title="Delete Paper" style="display:inline-flex; align-items:center; justify-content:center; padding: 2px 5px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
          ` : ''}
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  if (typeof window.triggerMath === 'function') {
    window.triggerMath(container);
  }
};

function buildCardProps(p) {
  if (!p.custom_columns || Object.keys(p.custom_columns).length === 0) return '';
  const entries = Object.entries(p.custom_columns).filter(([k, v]) => v && v.trim());
  if (entries.length === 0) return '';

  return `
    <div class="card-props">
      ${entries.slice(0, 4).map(([k, v]) => `
        <div class="prop-item">
          <div class="prop-name">${k}</div>
          <div class="prop-val" title="${v}">${v}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function buildCardInsights(p) {
  const hasStrengths = p.strengths && p.strengths.trim();
  const hasGaps = p.gaps && p.gaps.trim();
  if (!hasStrengths && !hasGaps) return '';

  return `
    <details class="deep-dive-drawer">
      <summary class="drawer-summary">
        <span>Technical Insights & Limitations</span>
        <span style="font-size:0.75rem;">▼</span>
      </summary>
      <div class="drawer-content">
        ${hasStrengths ? `
          <div class="insight-block">
            <div class="insight-heading head-pro">Key Strengths</div>
            <p style="color:var(--text-secondary);">${p.strengths}</p>
          </div>
        ` : ''}
        ${hasGaps ? `
          <div class="insight-block">
            <div class="insight-heading head-gap">Limitations & Gaps</div>
            <p style="color:var(--text-secondary);">${p.gaps}</p>
          </div>
        ` : ''}
      </div>
    </details>
  `;
}

window.deletePaper = async function(paperId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (typeof currentProjectRole !== 'undefined' && ['reviewer', 'viewer'].includes(currentProjectRole)) {
    showToast(`[Read-Only] Role '${currentProjectRole.toUpperCase()}' cannot delete papers.`, 'info');
    return;
  }

  if (!confirm('⚠️ Are you sure you want to permanently delete this research paper from the survey?')) return;

  try {
    const res = await fetch(`/api/papers/${paperId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.ok) {
      showToast('Paper deleted successfully', 'success');
      if (typeof loadPapers === 'function') await loadPapers();
      if (typeof loadClusters === 'function') await loadClusters();
      if (typeof loadStats === 'function') await loadStats();
      if (typeof loadSynthesisInsights === 'function') await loadSynthesisInsights();
    } else {
      let errText = 'Failed to delete paper';
      try {
        const json = await res.json();
        if (json.error) errText = json.error;
      } catch (_) {
        errText = await res.text();
      }
      throw new Error(errText);
    }
  } catch (err) {
    showToast('Failed to delete paper: ' + err.message, 'error');
  }
};
