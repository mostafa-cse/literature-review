/**
 * LITSPHERE ADMIN CONTROL CENTER CONTROLLER
 * Full multi-tab management: Telemetry, Researchers, Surveys, Templates, Audit Logs & Settings
 */

let currentAdminTab = 'overview';
let allUsersCache = [];
let allProjectsCache = [];
let allLogsCache = [];
let telemetryInterval = null;

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.initAdmin = async function() {
  const isAuth = await initNavbarUser();
  if (!isAuth) {
    window.location.href = '/login?redirect=/admin';
    return;
  }

  const cached = localStorage.getItem('litsphere_user');
  if (cached) {
    try {
      const u = JSON.parse(cached);
      if (u.role !== 'admin') {
        showToast('Access denied: Administrator privileges required.', 'error');
        window.location.href = '/dashboard';
        return;
      }
    } catch (e) {}
  }

  // Initial tab loading
  await loadAdminSystemHealth();
  await loadAdminUsersList();

  // Periodic Telemetry Refresh (every 30 seconds)
  if (telemetryInterval) clearInterval(telemetryInterval);
  telemetryInterval = setInterval(() => {
    if (currentAdminTab === 'overview') {
      loadAdminSystemHealth(true);
    }
  }, 30000);
};

window.refreshAdminData = async function() {
  showToast('Refreshing system telemetry & datasets...', 'info');
  await loadAdminSystemHealth();
  if (currentAdminTab === 'users') await loadAdminUsersList();
  if (currentAdminTab === 'projects') await loadAdminProjectsList();
  if (currentAdminTab === 'templates') await loadAdminTemplatesList();
  if (currentAdminTab === 'audit') await loadAdminAuditLogs();
  if (currentAdminTab === 'settings') await loadAdminSystemSettings();
  showToast('Data refreshed successfully.', 'success');
};

// ==========================================
// TAB NAVIGATION
// ==========================================
window.switchAdminTab = async function(tabName) {
  currentAdminTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });

  // Update tab views
  document.querySelectorAll('.admin-tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabName}`);
  });

  // Load view-specific data
  if (tabName === 'overview') await loadAdminSystemHealth();
  if (tabName === 'users') await loadAdminUsersList();
  if (tabName === 'projects') await loadAdminProjectsList();
  if (tabName === 'templates') await loadAdminTemplatesList();
  if (tabName === 'audit') await loadAdminAuditLogs();
  if (tabName === 'settings') await loadAdminSystemSettings();
};

// ==========================================
// 1. SYSTEM HEALTH & TELEMETRY
// ==========================================
window.loadAdminSystemHealth = async function(silent = false) {
  try {
    const res = await fetch('/api/admin/system/health', { headers: getAuthHeaders() });
    if (!res.ok) return;
    const data = await res.json();

    // 1. Update KPI Numbers
    if (document.getElementById('stat-admin-users')) {
      document.getElementById('stat-admin-users').textContent = data.db_counts?.users || 0;
    }
    if (document.getElementById('stat-admin-projects')) {
      document.getElementById('stat-admin-projects').textContent = data.db_counts?.projects || 0;
    }
    if (document.getElementById('stat-admin-clusters-sub')) {
      document.getElementById('stat-admin-clusters-sub').textContent = `${data.db_counts?.clusters || 0} Taxonomy Clusters`;
    }
    if (document.getElementById('stat-admin-papers')) {
      document.getElementById('stat-admin-papers').textContent = data.db_counts?.papers || 0;
    }
    if (document.getElementById('stat-admin-values-sub')) {
      document.getElementById('stat-admin-values-sub').textContent = `${data.db_counts?.column_values || 0} Extracted Values`;
    }
    if (document.getElementById('stat-admin-logs-count')) {
      document.getElementById('stat-admin-logs-count').textContent = data.db_counts?.audit_logs || 0;
    }

    // 2. Memory Heap & Meters
    if (data.process_memory) {
      const heapUsed = parseFloat(data.process_memory.heap_used_mb || 0);
      const heapTotal = parseFloat(data.process_memory.heap_total_mb || 1);
      const percent = Math.min(100, Math.round((heapUsed / heapTotal) * 100));

      if (document.getElementById('stat-admin-heap')) {
        document.getElementById('stat-admin-heap').textContent = `${heapUsed.toFixed(1)} MB`;
      }
      if (document.getElementById('stat-admin-heap-meter')) {
        document.getElementById('stat-admin-heap-meter').style.width = `${percent}%`;
      }
      if (document.getElementById('stat-admin-heap-sub')) {
        document.getElementById('stat-admin-heap-sub').textContent = `${data.process_memory.rss_mb} MB RSS (${percent}% Heap)`;
      }
    }

    // 3. Database Size & WAL
    if (data.database) {
      if (document.getElementById('stat-admin-db-size')) {
        document.getElementById('stat-admin-db-size').textContent = `${data.database.db_size_mb || 0} MB`;
      }
      if (document.getElementById('stat-admin-wal-sub')) {
        document.getElementById('stat-admin-wal-sub').textContent = `WAL: ${data.database.wal_size_mb || 0} MB (Healthy)`;
      }
    }

    // 4. Server Diagnostics
    if (data.system) {
      if (document.getElementById('diag-os-arch')) {
        document.getElementById('diag-os-arch').textContent = `${data.system.platform} (${data.system.arch})`;
      }
      if (document.getElementById('diag-cpu-cores')) {
        document.getElementById('diag-cpu-cores').textContent = `${data.system.cpu_cores} Logical Cores`;
      }
      if (document.getElementById('diag-sys-ram')) {
        document.getElementById('diag-sys-ram').textContent = `${data.system.free_memory_mb} MB Free / ${data.system.total_memory_mb} MB Total`;
      }
    }

    if (document.getElementById('diag-node-ver')) {
      document.getElementById('diag-node-ver').textContent = data.node_version || 'v22';
    }
    if (document.getElementById('admin-node-val')) {
      document.getElementById('admin-node-val').textContent = data.node_version || 'Node.js';
    }
    if (document.getElementById('diag-pid')) {
      document.getElementById('diag-pid').textContent = `PID ${data.pid || 1447} (Production Daemon)`;
    }

    // 5. Format Server Uptime
    if (data.uptime_seconds !== undefined) {
      const sec = data.uptime_seconds;
      const hrs = Math.floor(sec / 3600);
      const mins = Math.floor((sec % 3600) / 60);
      const uptimeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m ${sec % 60}s`;
      if (document.getElementById('admin-uptime-val')) {
        document.getElementById('admin-uptime-val').textContent = uptimeStr;
      }
    }

    // 6. Maintenance Mode Status
    const isMaint = !!data.maintenance_mode;
    const maintToggle = document.getElementById('toggle-maintenance-mode');
    if (maintToggle) maintToggle.checked = isMaint;

    const heartbeatPill = document.getElementById('admin-heartbeat-pill');
    const statusText = document.getElementById('admin-sys-status-text');
    if (heartbeatPill && statusText) {
      if (isMaint) {
        heartbeatPill.classList.add('maintenance');
        statusText.textContent = 'Maintenance Mode Active';
      } else {
        heartbeatPill.classList.remove('maintenance');
        statusText.textContent = 'All Systems Operational';
      }
    }
  } catch (err) {
    if (!silent) console.warn('[Admin] Telemetry retrieval failed:', err);
  }
};

window.toggleMaintenance = async function(checked) {
  try {
    const res = await fetch('/api/admin/system/maintenance', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ enabled: checked })
    });

    if (res.ok) {
      showToast(`Maintenance mode ${checked ? 'ENABLED' : 'DISABLED'}`, checked ? 'warning' : 'success');
      await loadAdminSystemHealth();
      await loadAdminAuditLogs();
    } else {
      throw new Error(await res.text());
    }
  } catch (err) {
    showToast('Failed to toggle maintenance mode: ' + err.message, 'error');
  }
};

window.updateMaintenanceMessage = async function() {
  const msgInput = document.getElementById('admin-maint-message');
  const msg = msgInput ? msgInput.value.trim() : '';

  try {
    const res = await fetch('/api/admin/system/maintenance', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ message: msg })
    });

    if (res.ok) {
      showToast('Maintenance announcement banner updated.', 'success');
    } else {
      throw new Error(await res.text());
    }
  } catch (err) {
    showToast('Failed to update maintenance banner: ' + err.message, 'error');
  }
};

// ==========================================
// 2. RESEARCHERS & SEAT GOVERNANCE
// ==========================================
window.loadAdminUsersList = async function() {
  const tbody = document.getElementById('admin-users-tbody');
  if (!tbody) return;

  const search = document.getElementById('admin-user-search-input')?.value || '';
  const role = document.getElementById('admin-user-role-filter')?.value || 'all';
  const status = document.getElementById('admin-user-status-filter')?.value || 'all';

  const params = new URLSearchParams();
  if (search.trim()) params.set('search', search.trim());
  if (role !== 'all') params.set('role', role);
  if (status !== 'all') params.set('status', status);

  try {
    const res = await fetch(`/api/admin/users?${params.toString()}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to retrieve user accounts');
    const data = await res.json();
    allUsersCache = data.users || [];

    const countBadge = document.getElementById('admin-users-table-count');
    if (countBadge) countBadge.textContent = `${allUsersCache.length} Researchers`;

    if (allUsersCache.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2rem; color:var(--text-tertiary);">No researcher accounts matching query.</td></tr>`;
      return;
    }

    tbody.innerHTML = allUsersCache.map((u, idx) => {
      const roleBadge = u.role === 'admin' ? 'badge-gold' : u.role === 'reviewer' ? 'badge-purple' : u.role === 'supervisor' ? 'badge-amber' : 'badge-blue';
      const statusBadge = u.status === 'active' ? 'badge-emerald' : u.status === 'banned' ? 'badge-rose' : 'badge-amber';
      const tokenRatio = `${(u.ai_tokens_used || 0).toLocaleString()} / ${(u.ai_token_quota || 100000).toLocaleString()}`;
      const storageRatio = `${(u.storage_used_mb || 0)} MB / ${(u.storage_quota_mb || 500)} MB`;

      return `
        <tr>
          <td style="font-family:var(--font-mono); color:var(--text-tertiary); font-weight:700;">${idx + 1}</td>
          <td>
            <div style="font-weight:700; color:var(--text-primary); font-size:0.9rem;">${escapeHtml(u.name || u.username)}</div>
            <div style="font-size:0.78rem; font-family:var(--font-mono); color:var(--text-tertiary);">${escapeHtml(u.email)}</div>
          </td>
          <td style="color:var(--text-secondary); font-size:0.84rem;">${escapeHtml(u.institution || 'Academic Institute')}</td>
          <td><span class="badge ${roleBadge}">${escapeHtml(u.role.toUpperCase())}</span></td>
          <td><span class="badge ${statusBadge}">${escapeHtml((u.status || 'active').toUpperCase())}</span></td>
          <td>
            <div style="font-size:0.78rem; font-family:var(--font-mono); color:var(--accent-primary);">${tokenRatio} Tokens</div>
            <div style="font-size:0.75rem; font-family:var(--font-mono); color:var(--text-tertiary);">${storageRatio}</div>
          </td>
          <td style="font-family:var(--font-mono); font-weight:700; color:var(--accent-gold);">${u.project_count || 0}</td>
          <td style="font-size:0.8rem; font-family:var(--font-mono); color:var(--text-tertiary);">${new Date(u.created_at).toLocaleDateString()}</td>
          <td style="text-align: right;">
            <div style="display:inline-flex; gap:0.35rem; justify-content:flex-end;">
              <button type="button" class="admin-btn-action" onclick="openEditUserModal(${u.id})" title="Edit Details & Quotas">
                ✎ Edit
              </button>
              <button type="button" class="admin-btn-action" onclick="openResetPasswordModal(${u.id}, '${escapeHtml(u.email)}')" title="Reset Password">
                🔑
              </button>
              <button type="button" class="admin-btn-action danger" onclick="openDeleteUserModal(${u.id}, '${escapeHtml(u.email)}')" title="Delete Account">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" style="color:var(--accent-rose); text-align:center; padding:1.5rem;">${err.message}</td></tr>`;
  }
};

window.handleUserSearch = function() {
  loadAdminUsersList();
};

window.openAddUserModal = function() {
  const modal = document.getElementById('admin-add-user-modal');
  if (modal) {
    modal.classList.add('active');
    document.getElementById('new-user-name')?.focus();
  }
};

window.handleCreateUserSubmit = async function(e) {
  e.preventDefault();
  const name = document.getElementById('new-user-name').value.trim();
  const email = document.getElementById('new-user-email').value.trim();
  const password = document.getElementById('new-user-password').value;
  const role = document.getElementById('new-user-role').value;
  const institution = document.getElementById('new-user-institution').value.trim();
  const ai_token_quota = parseInt(document.getElementById('new-user-tokens').value, 10) || 100000;
  const storage_quota_mb = parseInt(document.getElementById('new-user-storage').value, 10) || 500;

  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, email, password, role, institution, ai_token_quota, storage_quota_mb })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create user');

    showToast('Researcher account provisioned successfully.', 'success');
    closeModal('admin-add-user-modal');
    e.target.reset();
    await loadAdminUsersList();
    await loadAdminSystemHealth(true);
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.openEditUserModal = function(userId) {
  const user = allUsersCache.find(u => u.id === userId);
  if (!user) return;

  document.getElementById('edit-user-id').value = user.id;
  document.getElementById('edit-user-name').value = user.name || user.username || '';
  document.getElementById('edit-user-email').value = user.email || '';
  document.getElementById('edit-user-institution').value = user.institution || '';
  document.getElementById('edit-user-role').value = user.role || 'user';
  document.getElementById('edit-user-status').value = user.status || 'active';
  document.getElementById('edit-user-tokens').value = user.ai_token_quota || 100000;
  document.getElementById('edit-user-storage').value = user.storage_quota_mb || 500;

  const subtitle = document.getElementById('edit-user-subtitle');
  if (subtitle) subtitle.textContent = `Managing quotas & parameters for ${user.email}`;

  document.getElementById('admin-edit-user-modal')?.classList.add('active');
};

window.handleEditUserSubmit = async function(e) {
  e.preventDefault();
  const id = document.getElementById('edit-user-id').value;
  const name = document.getElementById('edit-user-name').value.trim();
  const institution = document.getElementById('edit-user-institution').value.trim();
  const role = document.getElementById('edit-user-role').value;
  const status = document.getElementById('edit-user-status').value;
  const ai_token_quota = parseInt(document.getElementById('edit-user-tokens').value, 10);
  const storage_quota_mb = parseInt(document.getElementById('edit-user-storage').value, 10);

  try {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, institution, role, status, ai_token_quota, storage_quota_mb })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update user profile');

    showToast('Researcher profile & quotas updated successfully.', 'success');
    closeModal('admin-edit-user-modal');
    await loadAdminUsersList();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.openResetPasswordModal = function(userId, email) {
  document.getElementById('reset-user-id').value = userId;
  document.getElementById('reset-new-password').value = '';
  document.getElementById('reset-confirm-password').value = '';
  const subtitle = document.getElementById('reset-password-subtitle');
  if (subtitle) subtitle.textContent = `Direct password override for ${email}`;
  document.getElementById('admin-reset-password-modal')?.classList.add('active');
};

window.handleResetPasswordSubmit = async function(e) {
  e.preventDefault();
  const id = document.getElementById('reset-user-id').value;
  const newPass = document.getElementById('reset-new-password').value;
  const confirmPass = document.getElementById('reset-confirm-password').value;

  if (newPass !== confirmPass) {
    showToast('Passwords do not match.', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ new_password: newPass })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to reset password');

    showToast('User password successfully reset.', 'success');
    closeModal('admin-reset-password-modal');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.openDeleteUserModal = function(userId, email) {
  document.getElementById('delete-user-id').value = userId;
  const label = document.getElementById('delete-user-email-label');
  if (label) label.textContent = email;
  document.getElementById('admin-delete-user-modal')?.classList.add('active');
};

window.confirmDeleteUser = async function() {
  const id = document.getElementById('delete-user-id').value;
  try {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete user');

    showToast(data.message || 'Researcher deleted successfully.', 'success');
    closeModal('admin-delete-user-modal');
    await loadAdminUsersList();
    await loadAdminSystemHealth(true);
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ==========================================
// 3. SURVEYS & CORPUS OVERSIGHT
// ==========================================
window.loadAdminProjectsList = async function() {
  const tbody = document.getElementById('admin-projects-tbody');
  if (!tbody) return;

  const search = document.getElementById('admin-project-search-input')?.value || '';
  const params = new URLSearchParams();
  if (search.trim()) params.set('search', search.trim());

  try {
    const res = await fetch(`/api/admin/projects?${params.toString()}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to retrieve survey projects');
    const data = await res.json();
    allProjectsCache = data.projects || [];

    const badge = document.getElementById('admin-projects-table-count');
    if (badge) badge.textContent = `${allProjectsCache.length} Surveys`;

    if (allProjectsCache.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-tertiary);">No systematic survey projects found.</td></tr>`;
      return;
    }

    tbody.innerHTML = allProjectsCache.map(p => `
      <tr>
        <td style="font-family:var(--font-mono); color:var(--text-tertiary); font-weight:700;">#${p.id}</td>
        <td>
          <div style="font-weight:700; color:var(--text-primary); font-size:0.92rem;">${escapeHtml(p.name)}</div>
          <div style="font-size:0.78rem; color:var(--text-secondary); max-width:340px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.description || 'No description')}</div>
        </td>
        <td><span class="badge badge-purple">${escapeHtml(p.domain || 'Uncategorized')}</span></td>
        <td>
          <div style="font-weight:600; color:var(--text-primary); font-size:0.85rem;">${escapeHtml(p.owner_name || 'Anonymous')}</div>
          <div style="font-size:0.76rem; font-family:var(--font-mono); color:var(--text-tertiary);">${escapeHtml(p.owner_email || '-')}</div>
        </td>
        <td>
          <div style="font-size:0.82rem; font-family:var(--font-mono); font-weight:700; color:var(--accent-emerald);">${p.paper_count || 0} Papers</div>
          <div style="font-size:0.75rem; font-family:var(--font-mono); color:var(--accent-primary);">${p.cluster_count || 0} Clusters</div>
        </td>
        <td style="font-size:0.8rem; font-family:var(--font-mono); color:var(--text-tertiary);">${new Date(p.created_at).toLocaleDateString()}</td>
        <td style="text-align: right;">
          <div style="display:inline-flex; gap:0.35rem; justify-content:flex-end;">
            <a href="/workspace?project=${p.id}" target="_blank" class="admin-btn-action" style="text-decoration:none;" title="Open Workspace">
              👁️ View
            </a>
            <button type="button" class="admin-btn-action danger" onclick="openDeleteProjectModal(${p.id}, decodeURIComponent('${encodeURIComponent(p.name)}'))" title="Purge Survey Project">
              🗑️ Purge
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:var(--accent-rose); text-align:center; padding:1.5rem;">${err.message}</td></tr>`;
  }
};

window.handleProjectSearch = function() {
  loadAdminProjectsList();
};

window.openDeleteProjectModal = function(projId, name) {
  document.getElementById('delete-project-id').value = projId;
  const label = document.getElementById('delete-project-name-label');
  if (label) label.textContent = name;
  document.getElementById('admin-delete-project-modal')?.classList.add('active');
};

window.confirmDeleteProject = async function() {
  const id = document.getElementById('delete-project-id').value;
  try {
    const res = await fetch(`/api/admin/projects/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to purge survey project');

    showToast(data.message || 'Survey project purged.', 'success');
    closeModal('admin-delete-project-modal');
    await loadAdminProjectsList();
    await loadAdminSystemHealth(true);
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ==========================================
// 4. MASTER TAXONOMY TEMPLATES
// ==========================================
window.loadAdminTemplatesList = async function() {
  const grid = document.getElementById('admin-templates-grid');
  if (!grid) return;

  try {
    const res = await fetch('/api/admin/templates', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to retrieve master templates');
    const data = await res.json();
    const templates = data.templates || [];

    const badge = document.getElementById('admin-templates-count');
    if (badge) badge.textContent = `${templates.length} Templates`;

    if (templates.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:2.5rem; color:var(--text-tertiary);">No master templates defined. Click "+ Create Master Template" to add one.</div>`;
      return;
    }

    grid.innerHTML = templates.map(t => {
      const clusters = Array.isArray(t.clusters) ? t.clusters : [];
      return `
        <div class="admin-template-card">
          <div>
            <div class="admin-template-header">
              <div class="admin-template-title">${escapeHtml(t.name)}</div>
              <span class="badge badge-gold">${escapeHtml(t.category)}</span>
            </div>
            <div class="admin-template-desc">${escapeHtml(t.description || 'Standard academic review taxonomy benchmark.')}</div>
            <div class="admin-template-clusters-chips">
              ${clusters.map(c => `
                <span class="template-chip" style="border-left: 2.5px solid ${c.color || '#38bdf8'};">
                  ${escapeHtml(c.name || 'Cluster')}
                </span>
              `).join('')}
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.85rem; padding-top:0.75rem; border-top:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:0.76rem; font-family:var(--font-mono); color:var(--text-tertiary);">${clusters.length} Initial Clusters</span>
            <button type="button" class="admin-btn-action danger" onclick="deleteTemplate(${t.id}, '${escapeHtml(t.name)}')" title="Delete Template">
              Delete
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    grid.innerHTML = `<div style="grid-column:1/-1; color:var(--accent-rose); text-align:center;">${err.message}</div>`;
  }
};

window.openCreateTemplateModal = function() {
  document.getElementById('admin-create-template-modal')?.classList.add('active');
};

window.handleCreateTemplateSubmit = async function(e) {
  e.preventDefault();
  const name = document.getElementById('new-template-name').value.trim();
  const category = document.getElementById('new-template-category').value.trim();
  const description = document.getElementById('new-template-description').value.trim();
  const clustersJson = document.getElementById('new-template-clusters-json').value.trim();

  let clusters = [];
  try {
    clusters = JSON.parse(clustersJson);
    if (!Array.isArray(clusters)) throw new Error('Clusters definition must be a JSON array of cluster objects.');
  } catch (jsonErr) {
    showToast('Invalid JSON structure: ' + jsonErr.message, 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/templates', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, category, description, clusters })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to publish template');

    showToast('Master taxonomy template published successfully.', 'success');
    closeModal('admin-create-template-modal');
    e.target.reset();
    await loadAdminTemplatesList();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.deleteTemplate = async function(id, name) {
  if (!confirm(`Are you sure you want to delete template "${name}"?`)) return;
  try {
    const res = await fetch(`/api/admin/templates/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (res.ok) {
      showToast(`Template "${name}" deleted.`, 'info');
      await loadAdminTemplatesList();
    } else {
      throw new Error(await res.text());
    }
  } catch (err) {
    showToast('Failed to delete template: ' + err.message, 'error');
  }
};

// ==========================================
// 5. SECURITY & AUDIT LOGS
// ==========================================
window.loadAdminAuditLogs = async function() {
  const tbody = document.getElementById('admin-audit-tbody');
  if (!tbody) return;

  const action = document.getElementById('admin-audit-action-filter')?.value || 'all';
  const status = document.getElementById('admin-audit-status-filter')?.value || 'all';

  const params = new URLSearchParams();
  if (action !== 'all') params.set('action', action);
  if (status !== 'all') params.set('status', status);
  params.set('limit', '75');

  try {
    const res = await fetch(`/api/admin/audit-logs?${params.toString()}`, { headers: getAuthHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    allLogsCache = data.logs || [];

    const badge = document.getElementById('admin-audit-table-count');
    if (badge) badge.textContent = `${allLogsCache.length} Events`;

    if (allLogsCache.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-tertiary);">No audit logs recorded matching criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = allLogsCache.map(l => {
      const statusClass = l.status === 'SUCCESS' ? 'badge-emerald' : l.status === 'WARNING' ? 'badge-amber' : 'badge-rose';
      return `
        <tr>
          <td style="font-family:var(--font-mono); font-size:0.78rem; color:var(--text-tertiary); white-space:nowrap;">
            ${new Date(l.created_at).toLocaleString()}
          </td>
          <td style="font-weight:700; color:var(--accent-primary); font-family:var(--font-mono); font-size:0.84rem;">
            ${escapeHtml(l.action)}
          </td>
          <td style="font-size:0.82rem; font-family:var(--font-mono); color:var(--text-primary);">
            ${escapeHtml(l.user_email || `User #${l.user_id || '-'}`)}
          </td>
          <td style="font-size:0.84rem; color:var(--text-secondary); max-width:380px;">
            ${escapeHtml(l.details || '-')}
          </td>
          <td style="font-family:var(--font-mono); font-size:0.78rem; color:var(--text-tertiary);">
            ${escapeHtml(l.ip_address || '127.0.0.1')}
          </td>
          <td>
            <span class="badge ${statusClass}">${escapeHtml(l.status || 'SUCCESS')}</span>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--accent-rose); text-align:center;">${err.message}</td></tr>`;
  }
};

window.exportAuditLogs = function(format) {
  if (!allLogsCache || allLogsCache.length === 0) {
    showToast('No audit logs to export.', 'info');
    return;
  }

  if (format === 'json') {
    const blob = new Blob([JSON.stringify(allLogsCache, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `litsphere_audit_logs_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Audit logs exported in JSON format.', 'success');
  } else if (format === 'csv') {
    const headers = ['ID', 'Timestamp', 'Action', 'User ID', 'User Email', 'Details', 'IP Address', 'Status'];
    const rows = allLogsCache.map(l => [
      l.id,
      `"${new Date(l.created_at).toISOString()}"`,
      `"${l.action}"`,
      l.user_id || '',
      `"${l.user_email || ''}"`,
      `"${(l.details || '').replace(/"/g, '""')}"`,
      `"${l.ip_address || ''}"`,
      `"${l.status || 'SUCCESS'}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `litsphere_audit_logs_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Audit logs exported in CSV format.', 'success');
  }
};

// ==========================================
// 6. GLOBAL SYSTEM SETTINGS
// ==========================================
window.loadAdminSystemSettings = async function() {
  try {
    const res = await fetch('/api/admin/system/settings', { headers: getAuthHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const settings = data.settings || {};

    if (settings.default_ai_token_quota && document.getElementById('setting-default-token-quota')) {
      document.getElementById('setting-default-token-quota').value = settings.default_ai_token_quota;
    }
    if (settings.default_storage_quota_mb && document.getElementById('setting-default-storage-quota')) {
      document.getElementById('setting-default-storage-quota').value = settings.default_storage_quota_mb;
    }
    if (settings.allow_registration && document.getElementById('setting-allow-registration')) {
      document.getElementById('setting-allow-registration').value = settings.allow_registration;
    }
    if (settings.public_share_links && document.getElementById('setting-public-share-links')) {
      document.getElementById('setting-public-share-links').value = settings.public_share_links;
    }
    if (settings.session_timeout_hours && document.getElementById('setting-session-timeout-hours')) {
      document.getElementById('setting-session-timeout-hours').value = settings.session_timeout_hours;
    }
    if (settings.maintenance_message && document.getElementById('admin-maint-message')) {
      document.getElementById('admin-maint-message').value = settings.maintenance_message;
    }
  } catch (err) {
    console.warn('[Admin] Failed to load system settings:', err);
  }
};

window.saveGlobalSettings = async function() {
  const tokenQuota = document.getElementById('setting-default-token-quota')?.value;
  const storageQuota = document.getElementById('setting-default-storage-quota')?.value;
  const allowReg = document.getElementById('setting-allow-registration')?.value;
  const publicShare = document.getElementById('setting-public-share-links')?.value;
  const timeoutHours = document.getElementById('setting-session-timeout-hours')?.value;

  const settings = {
    default_ai_token_quota: tokenQuota,
    default_storage_quota_mb: storageQuota,
    allow_registration: allowReg,
    public_share_links: publicShare,
    session_timeout_hours: timeoutHours
  };

  try {
    const res = await fetch('/api/admin/system/settings', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ settings })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update system settings');

    showToast('Global system policies & quotas updated successfully.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  window.initAdmin();
});

