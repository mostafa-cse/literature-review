/**
 * LITSPHERE MASTER PRESTIGE NAVBAR ENGINE (navbar.js)
 * Single source of truth for navigation across all LitSphere pages.
 * Handles:
 *  - Unified Oxford/Overleaf prestige academic header rendering
 *  - Active link auto-detection based on current route
 *  - Guest vs. Authenticated state toggling
 *  - Dark / Light theme toggle with icon synchronizer
 *  - Account dropdown menu & session verification
 *  - Mobile responsive hamburger toggle & slide drawer
 *  - Sticky elevation scroll shadow
 *  - Role-based admin link visibility
 */

(function() {
  'use strict';

  const SUN_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  const MOON_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  /**
   * Determine current active page key
   */
  function getCurrentPageKey() {
    const path = window.location.pathname.toLowerCase();
    if (path === '/' || path === '/home' || path === '/index.html' || path === '/overview') return 'home';
    if (path.startsWith('/about')) return 'about';
    if (path.startsWith('/dashboard')) return 'dashboard';
    if (path.startsWith('/workspace')) return 'workspace';
    if (path.startsWith('/admin')) return 'admin';
    if (path.startsWith('/profile')) return 'profile';
    if (path.startsWith('/login') || path.startsWith('/signin') || path.startsWith('/auth')) return 'login';
    if (path.startsWith('/register') || path.startsWith('/signup')) return 'register';
    return '';
  }

  /**
   * Generate Unified Navbar HTML
   */
  function buildNavbarHtml() {
    const activeKey = getCurrentPageKey();

    return `
    <div class="nav-container">
      <!-- Left: Logo Crest + Brand Title -->
      <a href="/" class="brand-group" title="LitSphere - Home">
        <div class="brand-logo-crest">LS</div>
        <div class="brand-title-wrap">
          <span class="brand-name">LitSphere</span>
          <span class="brand-subtitle">Academic Intelligence</span>
        </div>
      </a>

      <!-- Right: Desktop Guest Group (Displayed when unauthenticated) -->
      <div id="nav-guest-group" class="nav-actions desktop-nav" style="display: none; align-items: center; gap: 0.6rem;">
        <a href="/" class="nav-link-academic ${activeKey === 'home' ? 'active' : ''}" data-nav="home">Home</a>
        <a href="/about" class="nav-link-academic ${activeKey === 'about' ? 'active' : ''}" data-nav="about">About</a>
        <button type="button" class="theme-toggle-academic theme-toggle-pill" id="theme-toggle" onclick="toggleTheme()" title="Toggle Dark/Light Mode" aria-label="Toggle Theme">
          <span id="theme-icon">${SUN_ICON}</span>
        </button>
        <a href="/login" class="nav-link-academic ${activeKey === 'login' ? 'active' : ''}" data-nav="login">Sign In</a>
        <a href="/register" class="nav-link-academic nav-cta-btn ${activeKey === 'register' ? 'active' : ''}" data-nav="register">Create Account</a>
      </div>

      <!-- Right: Desktop Authenticated Group (Displayed when logged in) -->
      <div id="nav-auth-group" class="nav-actions desktop-nav" style="display: none; align-items: center; gap: 0.65rem;">
        <a href="/" class="nav-link-academic ${activeKey === 'home' ? 'active' : ''}" id="nav-link-home" data-nav="home">Home</a>
        <a href="/about" class="nav-link-academic ${activeKey === 'about' ? 'active' : ''}" id="nav-link-about" data-nav="about">About</a>
        <a href="/dashboard" class="nav-link-academic ${activeKey === 'dashboard' ? 'active' : ''}" id="nav-link-dashboard" data-nav="dashboard">Dashboard</a>
        <a href="/admin" id="nav-admin-link" class="nav-link-academic ${activeKey === 'admin' ? 'active' : ''}" data-nav="admin" style="display: none; color: var(--accent-rose);">Admin</a>

        <button type="button" class="theme-toggle-academic theme-toggle-pill" id="theme-toggle-auth" onclick="toggleTheme()" title="Toggle Dark/Light Mode" aria-label="Toggle Theme">
          <span class="theme-icon-indicator" id="theme-icon-auth">${SUN_ICON}</span>
        </button>

        <!-- Account / Researcher Academic Dropdown -->
        <div class="account-dropdown-wrapper" id="account-dropdown-wrap">
          <button type="button" class="account-academic-btn" id="account-dropdown-toggle" onclick="toggleAccountDropdown(event)" aria-haspopup="true" aria-expanded="false" title="Account Menu">
            <span id="nav-user-name">Researcher</span>
            <span style="font-size: 0.72rem; margin-left: 0.2rem; opacity: 0.7;">▼</span>
          </button>

          <div class="account-dropdown-menu" id="account-dropdown-menu">
            <div class="dropdown-user-header">
              <div class="dropdown-user-name">
                <span id="dropdown-user-name-txt">Researcher</span>
                <span id="nav-user-role-badge" class="role-badge-pill role-user">USER</span>
              </div>
              <div class="dropdown-user-email" id="dropdown-user-email-txt">researcher@litsphere.ac</div>
            </div>

            <a href="/profile" class="dropdown-item ${activeKey === 'profile' ? 'active' : ''}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.85;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              <span>Profile &amp; Settings</span>
            </a>

            <a href="/dashboard" class="dropdown-item ${activeKey === 'dashboard' ? 'active' : ''}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.85;"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
              <span>Surveys Dashboard</span>
            </a>

            <a href="/admin" class="dropdown-item ${activeKey === 'admin' ? 'active' : ''}" id="dropdown-admin-link" style="display: none; color: var(--accent-rose);">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.85;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
              <span>Admin Console</span>
            </a>

            <button type="button" class="dropdown-item danger" onclick="handleLogout()">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.85;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Mobile Hamburger Button (<= 900px) -->
      <button type="button" class="mobile-nav-toggle" id="mobile-nav-toggle" onclick="toggleMobileNav(event)" aria-label="Toggle Mobile Navigation">
        <span></span>
        <span></span>
        <span></span>
      </button>
    </div>

    <!-- Mobile Navigation Drawer -->
    <div class="mobile-nav-drawer" id="mobile-nav-drawer">
      <div id="mobile-user-profile-box" class="mobile-user-profile-bar" style="display: none;">
        <div>
          <div style="font-weight: 700; color: var(--text-primary);" id="mobile-user-name-txt">Researcher</div>
          <div style="font-size: 0.78rem; color: var(--text-secondary); font-family: 'JetBrains Mono', monospace;" id="mobile-user-email-txt">researcher@litsphere.ac</div>
        </div>
        <span id="mobile-user-role-badge" class="role-badge-pill role-user">USER</span>
      </div>

      <div class="mobile-nav-links">
        <a href="/" class="${activeKey === 'home' ? 'active' : ''}">Home <span>→</span></a>
        <a href="/about" class="${activeKey === 'about' ? 'active' : ''}">About <span>→</span></a>
        <a href="/dashboard" id="mobile-link-dashboard" class="${activeKey === 'dashboard' ? 'active' : ''}" style="display: none;">Dashboard <span>→</span></a>
        <a href="/profile" id="mobile-link-profile" class="${activeKey === 'profile' ? 'active' : ''}" style="display: none;">Profile &amp; Settings <span>→</span></a>
        <a href="/admin" id="mobile-link-admin" class="${activeKey === 'admin' ? 'active' : ''}" style="display: none; color: var(--accent-rose);">Admin Console <span>→</span></a>
        
        <!-- Unauthenticated links -->
        <a href="/login" id="mobile-link-login" class="${activeKey === 'login' ? 'active' : ''}">Sign In <span>→</span></a>
        <a href="/register" id="mobile-link-register" class="${activeKey === 'register' ? 'active' : ''}" style="color: var(--accent-gold); font-weight: 700;">Create Account <span>→</span></a>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.75rem; border-top: 1px solid var(--border-base, rgba(255,255,255,0.08)); margin-top: 0.25rem;">
        <button type="button" class="mini-btn" onclick="toggleTheme()" style="gap: 0.5rem; padding: 0.45rem 0.85rem;">
          <span id="mobile-theme-icon">${SUN_ICON}</span>
          <span>Switch Theme</span>
        </button>
        <button type="button" id="mobile-btn-logout" class="mini-btn danger" onclick="handleLogout()" style="display: none; gap: 0.4rem; padding: 0.45rem 0.85rem;">
          <span>Sign Out</span>
        </button>
      </div>
    </div>`;
  }

  /**
   * Mount Navbar into DOM
   */
  function renderNavbar() {
    let header = document.querySelector('header.site-header') || document.getElementById('site-header') || document.getElementById('navbar-mount');
    if (!header) {
      header = document.createElement('header');
      header.className = 'site-header';
      header.id = 'site-header';
      document.body.insertBefore(header, document.body.firstChild);
    } else {
      header.className = 'site-header';
      header.id = 'site-header';
    }
    header.innerHTML = buildNavbarHtml();
  }

  /**
   * Mobile Nav Drawer Toggle
   */
  window.toggleMobileNav = function(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const btn = document.getElementById('mobile-nav-toggle');
    const drawer = document.getElementById('mobile-nav-drawer');
    if (!drawer) return;

    const isOpen = drawer.classList.contains('open');
    if (isOpen) {
      drawer.classList.remove('open');
      if (btn) btn.classList.remove('open');
    } else {
      drawer.classList.add('open');
      if (btn) btn.classList.add('open');
    }
  };

  /**
   * Theme Logic
   */
  window.initTheme = function() {
    const savedTheme = localStorage.getItem('litsphere_theme') || 'dark';
    const icon1 = document.getElementById('theme-icon');
    const icon2 = document.getElementById('theme-icon-auth');
    const icon3 = document.getElementById('mobile-theme-icon');
    const symbol = savedTheme === 'light' ? SUN_ICON : MOON_ICON;

    if (savedTheme === 'light') {
      document.body.classList.add('light-mode');
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.body.classList.remove('light-mode');
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    if (icon1) icon1.innerHTML = symbol;
    if (icon2) icon2.innerHTML = symbol;
    if (icon3) icon3.innerHTML = symbol;
  };

  window.toggleTheme = function() {
    const isLight = document.body.classList.toggle('light-mode');
    const theme = isLight ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('litsphere_theme', theme);

    const icon1 = document.getElementById('theme-icon');
    const icon2 = document.getElementById('theme-icon-auth');
    const icon3 = document.getElementById('mobile-theme-icon');
    const symbol = isLight ? SUN_ICON : MOON_ICON;

    if (icon1) icon1.innerHTML = symbol;
    if (icon2) icon2.innerHTML = symbol;
    if (icon3) icon3.innerHTML = symbol;
  };

  /**
   * Account Dropdown Toggle
   */
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

  /**
   * Global Logout Handler
   */
  window.handleLogout = function() {
    localStorage.removeItem('litsphere_auth_token');
    localStorage.removeItem('litsphere_user');
    localStorage.removeItem('litnexis_auth_token');
    localStorage.removeItem('litnexis_user');
    sessionStorage.clear();
    window.location.href = '/login';
  };

  window.handleHomeLogout = window.handleLogout;
  window.workspaceLogout = window.handleLogout;
  window.dashboardLogout = window.handleLogout;

  /**
   * Update User Elements in DOM
   */
  function updateNavbarElements(user) {
    if (!user) return;
    const displayName = user.username || (user.name ? user.name.split(' ')[0] : 'Researcher');
    const role = (user.role || 'user').toUpperCase();

    // Name elements
    const nameSelectors = ['#user-nav-name', '#nav-user-name', '#user-name-display', '#mobile-user-name-txt'];
    nameSelectors.forEach(sel => {
      const el = document.querySelector(sel);
      if (el) el.textContent = displayName;
    });

    // Dropdown details
    const ddName = document.getElementById('dropdown-user-name-txt');
    if (ddName) ddName.textContent = user.name || displayName;

    const ddEmail = document.getElementById('dropdown-user-email-txt');
    if (ddEmail) ddEmail.textContent = user.email || 'researcher@litsphere.ac';

    const mobileEmail = document.getElementById('mobile-user-email-txt');
    if (mobileEmail) mobileEmail.textContent = user.email || 'researcher@litsphere.ac';

    // Role Badges
    const badgeSelectors = ['#nav-user-role-badge', '#user-role-badge', '#mobile-user-role-badge'];
    badgeSelectors.forEach(sel => {
      const el = document.querySelector(sel);
      if (el) {
        el.textContent = role;
        el.className = `role-badge-pill role-${(user.role || 'user').toLowerCase()}`;
      }
    });

    // Admin links
    const isAdmin = (user.role === 'admin');
    const adminLink = document.getElementById('nav-admin-link');
    if (adminLink) adminLink.style.display = isAdmin ? 'inline-flex' : 'none';

    const ddAdminLink = document.getElementById('dropdown-admin-link');
    if (ddAdminLink) ddAdminLink.style.display = isAdmin ? 'flex' : 'none';

    const mobileAdmin = document.getElementById('mobile-link-admin');
    if (mobileAdmin) mobileAdmin.style.display = isAdmin ? 'flex' : 'none';
  }

  /**
   * Set Authentication View State
   */
  function setNavAuthState(isAuthenticated) {
    const guestGroup = document.getElementById('nav-guest-group');
    const authGroup = document.getElementById('nav-auth-group');
    const heroAuthBanner = document.getElementById('hero-overleaf-auth');

    // Mobile specific controls
    const mobileProfileBox = document.getElementById('mobile-user-profile-box');
    const mobileLinkDashboard = document.getElementById('mobile-link-dashboard');
    const mobileLinkProfile = document.getElementById('mobile-link-profile');
    const mobileLinkLogin = document.getElementById('mobile-link-login');
    const mobileLinkRegister = document.getElementById('mobile-link-register');
    const mobileBtnLogout = document.getElementById('mobile-btn-logout');

    if (isAuthenticated) {
      if (guestGroup) guestGroup.style.display = 'none';
      if (authGroup) authGroup.style.display = 'flex';
      if (heroAuthBanner) heroAuthBanner.style.display = 'none';

      if (mobileProfileBox) mobileProfileBox.style.display = 'flex';
      if (mobileLinkDashboard) mobileLinkDashboard.style.display = 'flex';
      if (mobileLinkProfile) mobileLinkProfile.style.display = 'flex';
      if (mobileLinkLogin) mobileLinkLogin.style.display = 'none';
      if (mobileLinkRegister) mobileLinkRegister.style.display = 'none';
      if (mobileBtnLogout) mobileBtnLogout.style.display = 'inline-flex';
    } else {
      if (guestGroup) guestGroup.style.display = 'flex';
      if (authGroup) authGroup.style.display = 'none';
      if (heroAuthBanner) heroAuthBanner.style.display = 'block';

      if (mobileProfileBox) mobileProfileBox.style.display = 'none';
      if (mobileLinkDashboard) mobileLinkDashboard.style.display = 'none';
      if (mobileLinkProfile) mobileLinkProfile.style.display = 'none';
      if (mobileLinkLogin) mobileLinkLogin.style.display = 'flex';
      if (mobileLinkRegister) mobileLinkRegister.style.display = 'flex';
      if (mobileBtnLogout) mobileBtnLogout.style.display = 'none';
    }
  }

  /**
   * Authentication State Synchronization
   */
  window.initNavbarUser = async function() {
    const token = typeof window.getAuthToken === 'function' 
      ? window.getAuthToken() 
      : (localStorage.getItem('litsphere_auth_token') || localStorage.getItem('litnexis_auth_token'));

    if (!token) {
      setNavAuthState(false);
      return false;
    }

    // Eagerly show authenticated UI
    setNavAuthState(true);

    const cachedUserStr = localStorage.getItem('litsphere_user') || localStorage.getItem('litnexis_user');
    if (cachedUserStr) {
      try {
        const cached = JSON.parse(cachedUserStr);
        updateNavbarElements(cached);
      } catch (e) {}
    }

    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const user = data.user;
        localStorage.setItem('litsphere_user', JSON.stringify(user));
        updateNavbarElements(user);
        setNavAuthState(true);
        return true;
      } else {
        localStorage.removeItem('litsphere_auth_token');
        localStorage.removeItem('litsphere_user');
        localStorage.removeItem('litnexis_auth_token');
        localStorage.removeItem('litnexis_user');
        setNavAuthState(false);
        return false;
      }
    } catch (err) {
      console.warn('[Navbar] Session verification warning:', err);
      // Keep cached state on transient network errors
      return true;
    }
  };

  /**
   * Sticky Header Scroll Listener for Elevation Shadow
   */
  function setupScrollListener() {
    const header = document.querySelector('header.site-header');
    if (!header) return;

    window.addEventListener('scroll', () => {
      if (window.scrollY > 20) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }, { passive: true });
  }

  /**
   * Bootstrapping on DOM Ready
   */
  function initNavbar() {
    renderNavbar();
    window.initTheme();
    window.initNavbarUser();
    setupScrollListener();

    // Close dropdown and mobile drawer on click outside
    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('account-dropdown-wrap');
      if (wrap && !wrap.contains(e.target)) {
        const menu = document.getElementById('account-dropdown-menu');
        const btn = document.getElementById('account-dropdown-toggle');
        if (menu) menu.classList.remove('show');
        if (btn) btn.classList.remove('open');
      }

      const mobileDrawer = document.getElementById('mobile-nav-drawer');
      const mobileToggle = document.getElementById('mobile-nav-toggle');
      if (mobileDrawer && mobileToggle && !mobileDrawer.contains(e.target) && !mobileToggle.contains(e.target)) {
        mobileDrawer.classList.remove('open');
        mobileToggle.classList.remove('open');
      }
    });

    // Close mobile drawer on resize to desktop
    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) {
        const mobileDrawer = document.getElementById('mobile-nav-drawer');
        const mobileToggle = document.getElementById('mobile-nav-toggle');
        if (mobileDrawer) mobileDrawer.classList.remove('open');
        if (mobileToggle) mobileToggle.classList.remove('open');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavbar);
  } else {
    initNavbar();
  }
})();
