/**
 * LITNEXIS OXFORD / OVERLEAF PRESTIGE NAVBAR LOGIC
 * Synchronizes user identity, theme toggle, account dropdown, and logout.
 */

const SUN_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
const MOON_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

window.initTheme = function() {
  const savedTheme = localStorage.getItem('litnexis_theme') || 'dark';
  const icon = document.getElementById('theme-icon');
  const iconAuth = document.querySelector('.theme-icon-indicator');

  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
    document.documentElement.setAttribute('data-theme', 'light');
    if (icon) icon.innerHTML = SUN_ICON;
    if (iconAuth) iconAuth.innerHTML = SUN_ICON;
  } else {
    document.body.classList.remove('light-mode');
    document.documentElement.setAttribute('data-theme', 'dark');
    if (icon) icon.innerHTML = MOON_ICON;
    if (iconAuth) iconAuth.innerHTML = MOON_ICON;
  }
};

window.toggleTheme = function() {
  const isLight = document.body.classList.toggle('light-mode');
  const theme = isLight ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('litnexis_theme', theme);

  const icon = document.getElementById('theme-icon');
  const iconAuth = document.querySelector('.theme-icon-indicator');
  const symbol = isLight ? SUN_ICON : MOON_ICON;

  if (icon) icon.innerHTML = symbol;
  if (iconAuth) iconAuth.innerHTML = symbol;
};

window.toggleAccountDropdown = function(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const menu = document.getElementById('account-dropdown-menu');
  const btn = document.getElementById('account-dropdown-toggle');
  if (!menu) return;

  const isShown = menu.classList.contains('show');
  if (isShown) {
    menu.classList.remove('show');
    if (btn) btn.classList.remove('open');
  } else {
    menu.classList.add('show');
    if (btn) btn.classList.add('open');
  }
};

window.handleLogout = function() {
  localStorage.removeItem('litnexis_auth_token');
  localStorage.removeItem('litnexis_user');
  window.location.href = '/login';
};

window.workspaceLogout = window.handleLogout;
window.dashboardLogout = window.handleLogout;

function updateNavbarElements(user) {
  const displayName = user.username || (user.name ? user.name.split(' ')[0] : 'Researcher');
  const role = (user.role || 'user').toUpperCase();

  // Name elements
  const nameSelectors = ['#user-nav-name', '#nav-user-name', '#user-name-display'];
  nameSelectors.forEach(sel => {
    const el = document.querySelector(sel);
    if (el) el.textContent = displayName;
  });

  // Dropdown text
  const ddName = document.getElementById('dropdown-user-name-txt');
  if (ddName) ddName.textContent = user.name || displayName;

  const ddEmail = document.getElementById('dropdown-user-email-txt');
  if (ddEmail) ddEmail.textContent = user.email || '';

  // Role badges
  const badgeSelectors = ['#nav-user-role-badge', '#user-role-badge'];
  badgeSelectors.forEach(sel => {
    const el = document.querySelector(sel);
    if (el) {
      el.textContent = role;
      el.className = `role-badge-pill role-${(user.role || 'user').toLowerCase()}`;
    }
  });

  // Admin Links
  const adminLink = document.getElementById('nav-admin-link');
  if (adminLink) {
    adminLink.style.display = user.role === 'admin' ? 'inline-flex' : 'none';
  }

  const ddAdminLink = document.getElementById('dropdown-admin-link');
  if (ddAdminLink) {
    ddAdminLink.style.display = user.role === 'admin' ? 'flex' : 'none';
  }
}

window.initNavbarUser = async function() {
  const token = localStorage.getItem('litnexis_auth_token');

  // Eager render cached user info
  const cachedUserStr = localStorage.getItem('litnexis_user');
  if (cachedUserStr) {
    try {
      const cached = JSON.parse(cachedUserStr);
      updateNavbarElements(cached);
    } catch (e) {}
  }

  if (!token) return false;

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      const user = data.user;
      localStorage.setItem('litnexis_user', JSON.stringify(user));
      updateNavbarElements(user);
      return true;
    } else {
      localStorage.removeItem('litnexis_auth_token');
      localStorage.removeItem('litnexis_user');
      return false;
    }
  } catch (err) {
    console.warn('[Navbar] Session check error:', err);
    return false;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  window.initTheme();

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('account-dropdown-wrap') || document.querySelector('.account-dropdown-wrapper');
    if (wrap && !wrap.contains(e.target)) {
      const menu = document.getElementById('account-dropdown-menu');
      const btn = document.getElementById('account-dropdown-toggle') || document.querySelector('.account-academic-btn');
      if (menu) menu.classList.remove('show');
      if (btn) btn.classList.remove('open');
    }
  });
});
