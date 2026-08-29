/**
 * LITNEXIS ADMIN CONTROL CENTER CONTROLLER
 * Manages system telemetry, user accounts, audit logging, and maintenance mode.
 */

window.initAdmin = async function() {
  const isAuth = await initNavbarUser();
  if (!isAuth) {
    window.location.href = '/login?redirect=/admin';
    return;
  }

  const cached = localStorage.getItem('litnexis_user');
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

  await loadAdminSystemHealth();
  await loadAdminUsersList();
  await loadAdminAuditLogs();
};

window.loadAdminSystemHealth = async function() {
  try {
    const res = await fetch('/api/admin/system/health', { headers: getAuthHeaders() });
    if (!res.ok) return;
    const data = await res.json();

    if (document.getElementById('stat-admin-users')) document.getElementById('stat-admin-users').textContent = data.db_counts ? data.db_counts.users : 0;
    if (document.getElementById('stat-admin-papers')) document.getElementById('stat-admin-papers').textContent = data.db_counts ? data.db_counts.papers : 0;
    if (document.getElementById('stat-admin-projects')) document.getElementById('stat-admin-projects').textContent = data.db_counts ? data.db_counts.projects : 0;
    if (document.getElementById('stat-admin-heap')) document.getElementById('stat-admin-heap').textContent = `${(data.memory.heapUsed / (1024 * 1024)).toFixed(1)} MB`;

    const maintToggle = document.getElementById('toggle-maintenance-mode');
    if (maintToggle) maintToggle.checked = !!data.maintenance_mode;
  } catch (err) {
    console.warn('[Admin] Health load error:', err);
  }
};

window.loadAdminUsersList = async function() {
  const tbody = document.getElementById('admin-users-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/users', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load user accounts');
    const data = await res.json();
    const users = data.users || [];

    tbody.innerHTML = users.map((u, idx) => `
      <tr>
        <td style="font-family:var(--font-mono); color:var(--text-tertiary);">${idx + 1}</td>
        <td style="font-weight:600; color:var(--text-primary);">${u.name || u.username}</td>
        <td style="font-family:var(--font-mono); color:var(--text-secondary);">${u.email}</td>
        <td><span class="badge ${u.role === 'admin' ? 'badge-gold' : 'badge-blue'}">${u.role}</span></td>
        <td style="font-size:0.85rem; color:var(--text-tertiary);">${new Date(u.created_at).toLocaleDateString()}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--accent-rose); text-align:center;">${err.message}</td></tr>`;
  }
};

window.loadAdminAuditLogs = async function() {
  const tbody = document.getElementById('admin-audit-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/audit-logs', { headers: getAuthHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const logs = data.logs || [];

    tbody.innerHTML = logs.map(l => `
      <tr>
        <td style="font-family:var(--font-mono); font-size:0.8rem; color:var(--text-tertiary);">${new Date(l.created_at).toLocaleTimeString()}</td>
        <td style="font-weight:600; color:var(--accent-primary); font-family:var(--font-mono); font-size:0.84rem;">${l.action}</td>
        <td style="font-size:0.88rem; color:var(--text-secondary);">${l.details || '-'}</td>
        <td style="font-family:var(--font-mono); font-size:0.8rem; color:var(--text-tertiary);">${l.ip_address || '127.0.0.1'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.warn('[Admin] Audit load error:', err);
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
      showToast(`Maintenance mode ${checked ? 'ENABLED' : 'DISABLED'}`, 'info');
      await loadAdminAuditLogs();
    } else {
      throw new Error(await res.text());
    }
  } catch (err) {
    showToast('Failed to toggle maintenance: ' + err.message, 'error');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  window.initAdmin();
});
