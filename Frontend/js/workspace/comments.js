/**
 * LITNEXIS REVIEW COMMENTS & PRISMA SCREENING ENGINE
 * Handles blind screening votes, exclusion criteria, quote attachments, and peer discussion timeline.
 */

window.loadScreeningStatus = async function(paperId) {
  try {
    const res = await fetch(`/api/papers/${paperId}/screening`, { headers: getAuthHeaders() });
    if (!res.ok) return;
    const data = await res.json();

    const currentDecision = data.my_decision || null;
    currentScreeningVote = currentDecision ? currentDecision.decision : null;

    updateScreeningButtonUI();

    const historyList = document.getElementById('screening-history-list');
    if (historyList && data.all_decisions) {
      historyList.innerHTML = data.all_decisions.map(d => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.35rem 0.6rem; background:var(--bg-surface-raised); border-radius:5px; margin-bottom:0.3rem; font-size:0.82rem;">
          <span><strong>${d.user_name || 'Reviewer'}</strong>: <span style="text-transform:uppercase; font-weight:700; color:${d.decision === 'include' ? 'var(--accent-emerald)' : (d.decision === 'exclude' ? 'var(--accent-rose)' : 'var(--accent-amber)')};">${d.decision}</span> ${d.reason ? `(${d.reason})` : ''}</span>
          <span style="color:var(--text-tertiary); font-size:0.75rem;">${new Date(d.created_at).toLocaleDateString()}</span>
        </div>
      `).join('');
    }
  } catch (err) {
    console.warn('Screening status error:', err);
  }
};

window.setScreeningVote = function(vote) {
  currentScreeningVote = vote;
  updateScreeningButtonUI();

  const reasonSelect = document.getElementById('screening-reason-select');
  if (reasonSelect) {
    reasonSelect.style.display = vote === 'exclude' ? 'block' : 'none';
  }
};

function updateScreeningButtonUI() {
  const btnInc = document.getElementById('btn-screen-include');
  const btnExc = document.getElementById('btn-screen-exclude');
  const btnUnc = document.getElementById('btn-screen-uncertain');

  if (btnInc) btnInc.className = `btn-screen ${currentScreeningVote === 'include' ? 'active-include' : ''}`;
  if (btnExc) btnExc.className = `btn-screen ${currentScreeningVote === 'exclude' ? 'active-exclude' : ''}`;
  if (btnUnc) btnUnc.className = `btn-screen ${currentScreeningVote === 'uncertain' ? 'active-uncertain' : ''}`;
}

window.submitScreeningDecision = async function() {
  if (!activePaper) return;
  if (!currentScreeningVote) {
    showToast('Please select a screening decision (Include, Exclude, or Uncertain)', 'warning');
    return;
  }

  const reasonSelect = document.getElementById('screening-reason-select');
  const reason = (currentScreeningVote === 'exclude' && reasonSelect) ? reasonSelect.value : null;

  try {
    const res = await fetch(`/api/papers/${activePaper.id}/screening`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ decision: currentScreeningVote, reason })
    });

    if (res.ok) {
      showToast('PRISMA Screening decision saved!', 'success');
      loadScreeningStatus(activePaper.id);
    } else {
      throw new Error(await res.text());
    }
  } catch (err) {
    showToast('Failed to save screening: ' + err.message, 'error');
  }
};

/* =========================================================
   PEER REVIEW COMMENTS & DISCUSSION TIMELINE
   ========================================================= */

window.loadPaperComments = async function(paperId) {
  const container = document.getElementById('comments-timeline-list');
  if (!container) return;
  container.innerHTML = '<span style="color:var(--text-tertiary); font-size:0.84rem;">Loading annotations & discussion...</span>';

  try {
    const res = await fetch(`/api/papers/${paperId}/comments`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load comments');
    currentPaperComments = await res.json();

    if (currentPaperComments.length === 0) {
      container.innerHTML = '<span style="color:var(--text-tertiary); font-size:0.84rem;">No peer review annotations or discussions yet.</span>';
      return;
    }

    container.innerHTML = currentPaperComments.map(c => `
      <div class="comment-item">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:700; font-size:0.86rem; color:var(--text-primary);">${c.user_name || 'Academic Reviewer'}</span>
          <span style="font-size:0.75rem; color:var(--text-tertiary);">${new Date(c.created_at).toLocaleDateString()}</span>
        </div>
        ${c.quote ? `
          <div class="comment-quote-box">
            "${c.quote}"
          </div>
        ` : ''}
        <div style="color:var(--text-secondary); line-height:1.5;">${c.comment}</div>
        <div style="display:flex; justify-content:flex-end;">
          <button class="mini-btn danger" style="padding:0.15rem 0.4rem; font-size:0.72rem;" onclick="deletePaperComment(${c.id})">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<span style="color:var(--accent-rose); font-size:0.84rem;">${err.message}</span>`;
  }
};

window.attachQuoteToComment = function(quoteText) {
  currentAttachedQuote = quoteText;
  const quotePreview = document.getElementById('comment-quote-preview');
  const quoteTextEl = document.getElementById('comment-quote-text');
  if (quoteTextEl) quoteTextEl.textContent = `"${quoteText}"`;
  if (quotePreview) quotePreview.style.display = 'block';
};

window.clearAttachedQuote = function() {
  currentAttachedQuote = null;
  const quotePreview = document.getElementById('comment-quote-preview');
  if (quotePreview) quotePreview.style.display = 'none';
};

window.submitPaperComment = async function() {
  if (!activePaper) return;
  const input = document.getElementById('comment-input-text');
  if (!input) return;
  const comment = input.value.trim();

  if (!comment) {
    showToast('Please type a comment or note', 'warning');
    return;
  }

  try {
    const res = await fetch(`/api/papers/${activePaper.id}/comments`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        comment,
        quote: currentAttachedQuote
      })
    });

    if (res.ok) {
      input.value = '';
      clearAttachedQuote();
      showToast('Annotation posted!', 'success');
      loadPaperComments(activePaper.id);
    } else {
      throw new Error(await res.text());
    }
  } catch (err) {
    showToast('Failed to post comment: ' + err.message, 'error');
  }
};

window.deletePaperComment = async function(commentId) {
  if (!confirm('Are you sure you want to delete this comment?')) return;
  try {
    const res = await fetch(`/api/comments/${commentId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.ok) {
      showToast('Comment deleted', 'success');
      if (activePaper) loadPaperComments(activePaper.id);
    } else {
      throw new Error(await res.text());
    }
  } catch (err) {
    showToast('Failed to delete comment: ' + err.message, 'error');
  }
};
