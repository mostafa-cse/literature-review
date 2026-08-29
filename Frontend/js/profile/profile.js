/**
 * LITNEXIS RESEARCHER PROFILE CONTROLLER
 * Manages profile information, profile picture, About dossier, multi-device security, and PDF storage telemetry.
 */

let currentAvatarDataUrl = '';

window.initProfile = async function() {
  const isAuth = await initNavbarUser();
  if (!isAuth) {
    window.location.href = '/login?redirect=/profile';
    return;
  }

  await loadUserProfileDetails();
  await loadLiveStorageStats();
  bindProfileListeners();
};

window.loadUserProfileDetails = async function() {
  try {
    const res = await fetch('/api/auth/me', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load profile');
    const data = await res.json();
    const u = data.user;

    // Hero Section
    const nameDisplay = document.getElementById('profile-display-name');
    const emailDisplay = document.getElementById('profile-display-email');
    const roleBadge = document.getElementById('profile-display-role');
    const instDisplay = document.getElementById('hero-inst');
    const createdDisplay = document.getElementById('hero-created');

    if (nameDisplay) nameDisplay.textContent = u.name || u.username;
    if (emailDisplay) emailDisplay.textContent = u.email;
    if (roleBadge) roleBadge.textContent = (u.role || 'researcher').toUpperCase();
    if (instDisplay) instDisplay.textContent = u.institution || 'Academic Institute';
    if (createdDisplay && u.created_at) {
      const d = new Date(u.created_at);
      createdDisplay.textContent = 'Joined ' + d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }

    // Avatar Handling
    currentAvatarDataUrl = u.avatar_url || '';
    renderAvatarDisplay(currentAvatarDataUrl, u.name || u.username || 'R');

    // Tab 1: Profile Form Inputs
    if (document.getElementById('input-profile-name')) document.getElementById('input-profile-name').value = u.name || '';
    if (document.getElementById('input-profile-email')) document.getElementById('input-profile-email').value = u.email || '';
    if (document.getElementById('input-profile-institution')) document.getElementById('input-profile-institution').value = u.institution || '';
    if (document.getElementById('inp-phone')) document.getElementById('inp-phone').value = u.phone || '';
    if (document.getElementById('input-profile-bio')) document.getElementById('input-profile-bio').value = u.bio || '';
    if (document.getElementById('input-profile-orcid')) document.getElementById('input-profile-orcid').value = u.orcid || '';
    if (document.getElementById('inp-scholar')) document.getElementById('inp-scholar').value = u.google_scholar || '';

    // Tab 1: Sidebar
    if (document.getElementById('sb-role')) document.getElementById('sb-role').textContent = (u.role || 'researcher').toUpperCase();
    if (document.getElementById('sb-last-login') && u.last_login) {
      const ll = new Date(u.last_login);
      document.getElementById('sb-last-login').textContent = ll.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    // Tab 2: About Dossier
    if (document.getElementById('about-display-inst')) document.getElementById('about-display-inst').textContent = u.institution || 'Academic Research Institute';
    if (document.getElementById('about-display-role-sub')) document.getElementById('about-display-role-sub').textContent = `${(u.role || 'Researcher').toUpperCase()} • Systematic Reviewer`;
    
    if (document.getElementById('about-display-orcid')) {
      document.getElementById('about-display-orcid').textContent = u.orcid || 'Not specified';
    }

    const scholarLink = document.getElementById('about-display-scholar-link');
    const scholarNone = document.getElementById('about-display-scholar-none');
    if (u.google_scholar && u.google_scholar.trim()) {
      if (scholarLink) {
        scholarLink.href = u.google_scholar.trim();
        scholarLink.style.display = 'inline';
      }
      if (scholarNone) scholarNone.style.display = 'none';
    } else {
      if (scholarLink) scholarLink.style.display = 'none';
      if (scholarNone) scholarNone.style.display = 'inline';
    }

    if (document.getElementById('about-display-bio')) {
      if (u.bio && u.bio.trim()) {
        document.getElementById('about-display-bio').textContent = `"${u.bio.trim()}"`;
      } else {
        document.getElementById('about-display-bio').textContent = '"No research biography specified yet. Click \'Edit Academic Info\' above to describe your domain objectives, PRISMA methodology, and survey focus."';
      }
    }

    if (document.getElementById('about-name-txt')) document.getElementById('about-name-txt').textContent = u.name || u.username;
    if (document.getElementById('about-email-txt')) document.getElementById('about-email-txt').textContent = u.email;
    if (document.getElementById('about-phone-txt')) document.getElementById('about-phone-txt').textContent = u.phone || 'Not specified';
    if (document.getElementById('about-joined-txt') && u.created_at) {
      const cd = new Date(u.created_at);
      document.getElementById('about-joined-txt').textContent = cd.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    }

  } catch (err) {
    if (typeof showToast === 'function') showToast('Profile load error: ' + err.message, 'error');
  }
};

function renderAvatarDisplay(avatarUrl, displayName) {
  const heroTxt = document.getElementById('profile-avatar-txt');
  const heroImg = document.getElementById('profile-avatar-img');
  const prevTxt = document.getElementById('profile-avatar-preview-txt');
  const prevImg = document.getElementById('profile-avatar-preview-img');
  const clearBtn = document.getElementById('btn-clear-avatar');

  const initial = (displayName || 'R')[0].toUpperCase();

  if (avatarUrl && avatarUrl.startsWith('data:image')) {
    if (heroTxt) heroTxt.style.display = 'none';
    if (heroImg) {
      heroImg.src = avatarUrl;
      heroImg.style.display = 'block';
    }
    if (prevTxt) prevTxt.style.display = 'none';
    if (prevImg) {
      prevImg.src = avatarUrl;
      prevImg.style.display = 'block';
    }
    if (clearBtn) clearBtn.style.display = 'inline-block';
  } else {
    if (heroTxt) {
      heroTxt.textContent = initial;
      heroTxt.style.display = 'flex';
    }
    if (heroImg) heroImg.style.display = 'none';
    if (prevTxt) {
      prevTxt.textContent = initial;
      prevTxt.style.display = 'flex';
    }
    if (prevImg) prevImg.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'none';
  }
}

window.handleAvatarFileSelected = function(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    if (typeof showToast === 'function') showToast('Please select a valid image file (PNG, JPG, WebP)', 'warning');
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    if (typeof showToast === 'function') showToast('Image file size must be under 5 MB', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = async function(evt) {
    currentAvatarDataUrl = evt.target.result;
    const name = document.getElementById('input-profile-name')?.value || 'R';
    renderAvatarDisplay(currentAvatarDataUrl, name);
    if (typeof showToast === 'function') showToast('Photo loaded! Click "Save Profile Changes" to persist.', 'info');
  };
  reader.readAsDataURL(file);
};

window.clearAvatarPhoto = function() {
  currentAvatarDataUrl = '';
  const name = document.getElementById('input-profile-name')?.value || 'R';
  renderAvatarDisplay('', name);
  const fileInput = document.getElementById('avatar-file-input');
  if (fileInput) fileInput.value = '';
  if (typeof showToast === 'function') showToast('Photo removed. Click "Save Profile Changes" to confirm.', 'info');
};

window.submitProfileUpdate = async function(e) {
  if (e) e.preventDefault();

  const name = document.getElementById('input-profile-name').value.trim();
  const email = document.getElementById('input-profile-email').value.trim();
  const orcid = document.getElementById('input-profile-orcid').value.trim();
  const bio = document.getElementById('input-profile-bio').value.trim();
  const institution = document.getElementById('input-profile-institution').value.trim();
  const phone = document.getElementById('inp-phone') ? document.getElementById('inp-phone').value.trim() : '';
  const google_scholar = document.getElementById('inp-scholar') ? document.getElementById('inp-scholar').value.trim() : '';

  if (!name || !email) {
    if (typeof showToast === 'function') showToast('Name and Email are required', 'warning');
    return;
  }

  const saveBtn = document.getElementById('btn-save-profile');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = 'Saving Changes…';
  }

  try {
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        name,
        email,
        orcid,
        bio,
        institution,
        phone,
        google_scholar,
        avatar_url: currentAvatarDataUrl
      })
    });

    const data = await res.json();
    if (res.ok) {
      if (data.token) localStorage.setItem('litnexis_token', data.token);
      if (typeof showToast === 'function') showToast('Profile details updated successfully!', 'success');
      await loadUserProfileDetails();
      await initNavbarUser();
    } else {
      throw new Error(data.error || 'Failed to update profile');
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;"><polyline points="20 6 9 17 4 12"></polyline></svg> Save Profile Changes';
    }
  }
};

window.submitPasswordChange = async function(e) {
  if (e) e.preventDefault();

  const currentPassword = document.getElementById('input-current-pass').value;
  const newPassword = document.getElementById('input-new-pass').value;
  const confirmPassword = document.getElementById('input-confirm-pass').value;

  if (!currentPassword || !newPassword) {
    if (typeof showToast === 'function') showToast('Please fill in all password fields', 'warning');
    return;
  }

  if (newPassword.length < 6) {
    if (typeof showToast === 'function') showToast('New password must be at least 6 characters', 'warning');
    return;
  }

  if (newPassword !== confirmPassword) {
    if (typeof showToast === 'function') showToast('New passwords do not match', 'error');
    return;
  }

  const saveBtn = document.getElementById('btn-save-password');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Updating…';
  }

  try {
    const res = await fetch('/api/auth/password', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await res.json();
    if (res.ok) {
      if (typeof showToast === 'function') showToast('Password updated successfully!', 'success');
      document.getElementById('form-change-password').reset();
      const meterBar = document.getElementById('pass-entropy-bar');
      if (meterBar) meterBar.style.width = '0%';
    } else {
      throw new Error(data.error || 'Failed to change password');
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Update Password';
    }
  }
};

window.revokeOtherSessions = async function() {
  if (!confirm('Are you sure you want to terminate all other active device logins? All other devices will be signed out immediately.')) {
    return;
  }

  const revokeBtn = document.getElementById('btn-revoke-sessions');
  if (revokeBtn) {
    revokeBtn.disabled = true;
    revokeBtn.textContent = 'Revoking sessions…';
  }

  try {
    const res = await fetch('/api/auth/revoke-sessions', {
      method: 'POST',
      headers: getAuthHeaders()
    });

    const data = await res.json();
    if (res.ok) {
      if (data.token) {
        localStorage.setItem('litnexis_token', data.token);
      }
      if (typeof showToast === 'function') {
        showToast(data.message || 'All other active device sessions have been revoked!', 'success');
      }
    } else {
      throw new Error(data.error || 'Failed to revoke device sessions');
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  } finally {
    if (revokeBtn) {
      revokeBtn.disabled = false;
      revokeBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg> Remove All Other Devices Access';
    }
  }
};

window.loadLiveStorageStats = async function() {
  const refreshBtn = document.getElementById('btn-refresh-storage');
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Syncing…';
  }

  try {
    const res = await fetch('/api/auth/storage-stats', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load storage telemetry');
    const data = await res.json();

    const usedMb = data.storage_used_mb || 0;
    const quotaMb = data.storage_quota_mb || 500;
    const percent = data.percent_used || Math.min(100, Math.round((usedMb / quotaMb) * 100));
    const totalPdfs = data.total_pdf_files || 0;
    const totalPapers = data.total_papers || 0;

    // Update Hero and Sidebar Stats
    if (document.getElementById('stat-storage-used')) {
      document.getElementById('stat-storage-used').textContent = `${usedMb.toFixed(2)} MB`;
    }
    if (document.getElementById('stat-total-papers-hero')) {
      document.getElementById('stat-total-papers-hero').textContent = totalPapers;
    }
    if (document.getElementById('stat-sidebar-pdfs')) {
      document.getElementById('stat-sidebar-pdfs').textContent = `${totalPdfs} PDFs`;
    }

    // Update Meter
    const meterTxt = document.getElementById('meter-storage-txt');
    const meterBar = document.getElementById('meter-storage-bar');
    const metaHint = document.getElementById('storage-meta-hint');

    if (meterTxt) {
      meterTxt.textContent = `${usedMb.toFixed(2)} MB / ${quotaMb} MB (${percent}%)`;
      if (percent > 85) meterTxt.style.color = 'var(--accent-rose)';
      else if (percent > 60) meterTxt.style.color = 'var(--accent-gold)';
      else meterTxt.style.color = 'var(--accent-emerald)';
    }

    if (meterBar) {
      meterBar.style.width = `${Math.max(1, percent)}%`;
      if (percent > 85) meterBar.className = 'meter-fill red';
      else if (percent > 60) meterBar.className = 'meter-fill gold';
      else meterBar.className = 'meter-fill green';
    }

    if (metaHint) {
      metaHint.innerHTML = `<span><strong>${totalPdfs}</strong> PDF documents stored across <strong>${totalPapers}</strong> indexed survey papers.</span>`;
    }

    // Render Project Breakdown Table
    const tbody = document.getElementById('storage-breakdown-tbody');
    if (tbody) {
      const breakdown = data.projects_breakdown || [];
      if (breakdown.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="padding:1.5rem; text-align:center; color:var(--text-tertiary);">No research survey projects created yet.</td></tr>`;
      } else {
        tbody.innerHTML = breakdown.map(p => `
          <tr style="border-bottom:1px solid var(--border-base);">
            <td style="padding:0.75rem 0.85rem; font-weight:600; color:var(--text-primary);">
              <a href="/workspace?project_id=${p.project_id}" style="color:var(--text-primary); text-decoration:none;" onmouseover="this.style.color='var(--accent-primary)'" onmouseout="this.style.color='var(--text-primary)'">
                ${escapeHtml(p.project_name)}
              </a>
            </td>
            <td style="padding:0.75rem 0.85rem; text-align:center; color:var(--text-secondary);">${p.total_papers}</td>
            <td style="padding:0.75rem 0.85rem; text-align:center; font-weight:600; color:${p.total_pdfs > 0 ? 'var(--accent-emerald)' : 'var(--text-tertiary)'};">${p.total_pdfs}</td>
            <td style="padding:0.75rem 0.85rem; text-align:right; font-family:'JetBrains Mono',monospace; font-weight:600; color:var(--text-primary);">${p.mb_used.toFixed(2)} MB</td>
          </tr>
        `).join('');
      }
    }

  } catch (err) {
    console.warn('Storage sync error:', err.message);
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Sync Storage';
    }
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bindProfileListeners() {
  const newPassInput = document.getElementById('input-new-pass');
  const meterBar = document.getElementById('pass-entropy-bar');

  if (newPassInput && meterBar) {
    newPassInput.addEventListener('input', (e) => {
      const val = e.target.value;
      let score = 0;
      if (val.length >= 8) score += 25;
      if (/[A-Z]/.test(val)) score += 25;
      if (/[0-9]/.test(val)) score += 25;
      if (/[^A-Za-z0-9]/.test(val)) score += 25;

      meterBar.style.width = `${score}%`;
      if (score <= 25) meterBar.style.backgroundColor = 'var(--accent-rose)';
      else if (score <= 50) meterBar.style.backgroundColor = 'var(--accent-amber)';
      else if (score <= 75) meterBar.style.backgroundColor = 'var(--accent-primary)';
      else meterBar.style.backgroundColor = 'var(--accent-emerald)';
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.initProfile();
});
