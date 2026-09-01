/**
 * LITSPHERE UNIFIED PRESTIGE FOOTER ENGINE (footer.js)
 * Single source of truth for footer rendering across all LitSphere pages.
 * Handles:
 *  - Unified academic multi-column footer HTML generation
 *  - Automated injection into <footer> or #site-footer or #footer-mount
 *  - Dynamic copyright year
 *  - Dark / Light mode toggle integration
 *  - Smooth back-to-top scrolling
 */

(function() {
  'use strict';

  function buildFooterHtml() {
    const currentYear = new Date().getFullYear();

    return `
    <div class="footer-top-grid">
      <!-- Brand & Mission Column -->
      <div class="footer-brand-col">
        <div class="footer-brand-header">
          <div class="brand-logo-crest" style="width: 38px; height: 38px; font-size: 1.05rem;">LS</div>
          <div class="brand-title-wrap">
            <span class="brand-name" style="font-size: 1.15rem;">LitSphere Inc.</span>
            <span class="brand-subtitle" style="font-size: 0.72rem;">Academic Intelligence</span>
          </div>
        </div>
        <p class="footer-brand-desc">
          The next-generation literature intelligence and systematic synthesis platform for universities, biomedical institutes, and enterprise R&amp;D laboratories. Accelerating scientific discovery with split-screen citation grounding, high-density matrix benchmarking, and camera-ready LaTeX synthesis.
        </p>
      </div>

      <!-- Column 1: Navigation -->
      <div>
        <h4 class="footer-col-title">Navigation</h4>
        <ul class="footer-list">
          <li><a href="/">Home Overview</a></li>
          <li><a href="/about">About Platform</a></li>
          <li><a href="/dashboard">Surveys Dashboard</a></li>
          <li><a href="/workspace">Interactive Matrix</a></li>
          <li><a href="/profile">Profile &amp; Settings</a></li>
        </ul>
      </div>

      <!-- Column 2: Solutions & Research -->
      <div>
        <h4 class="footer-col-title">Solutions</h4>
        <ul class="footer-list">
          <li><a href="/dashboard">Systematic Survey Engine</a></li>
          <li><a href="/workspace">Smart PDF Ingestion &amp; DOI</a></li>
          <li><a href="/workspace">Split-Screen Grounding</a></li>
          <li><a href="/workspace">KaTeX Math Formula Matrix</a></li>
          <li><a href="/workspace">Multi-Level XLSX Export</a></li>
          <li><a href="/dashboard">PRISMA 2020 Screening</a></li>
        </ul>
      </div>

      <!-- Column 3: Engine Specs & Security -->
      <div>
        <h4 class="footer-col-title">Engine Specs</h4>
        <ul class="footer-list">
          <li><a href="javascript:void(0)">Node.js &amp; Express REST</a></li>
          <li><a href="javascript:void(0)">SQLite WAL Persistence</a></li>
          <li><a href="javascript:void(0)">KaTeX LaTeX Rendering</a></li>
          <li><a href="javascript:void(0)">SheetJS Multi-Level XLSX</a></li>
          <li><a href="/api/stats" target="_blank">Live REST API Stats</a></li>
        </ul>
      </div>

      <!-- Column 4: Preferences & Access -->
      <div>
        <h4 class="footer-col-title">Preferences</h4>
        <ul class="footer-list">
          <li><a href="/admin" id="footer-admin-link" style="color: var(--accent-rose); font-weight: 600;">Enterprise Admin Center</a></li>
          <li><a href="javascript:void(0)" onclick="typeof toggleTheme === 'function' ? toggleTheme() : window.toggleTheme()">Switch Dark/Light Theme</a></li>
          <li><a href="javascript:void(0)" onclick="window.scrollTo({top: 0, behavior: 'smooth'})">Back to Top ↑</a></li>
        </ul>
      </div>
    </div>

    <!-- Bottom Sub-Footer Bar -->
    <div class="footer-bottom-bar">
      <div class="footer-copyright">
        © ${currentYear} <strong>LitSphere Technologies Inc.</strong> All rights reserved. Precision Literature Benchmarking &amp; Research Matrix Systems.
      </div>
      <div class="footer-badge-group">
        <span style="font-size: 0.85rem; color: var(--text-tertiary); font-family: 'JetBrains Mono', monospace; font-weight: 500;">developed by Mostafa Kamal @ Cyber Security Lab, JUST</span>
      </div>
    </div>`;
  }

  function renderFooter() {
    let footer = document.querySelector('footer') || document.getElementById('site-footer') || document.getElementById('footer-mount');
    if (!footer) {
      footer = document.createElement('footer');
      footer.id = 'site-footer';
      document.body.appendChild(footer);
    } else {
      footer.id = 'site-footer';
    }
    footer.innerHTML = buildFooterHtml();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderFooter);
  } else {
    renderFooter();
  }
})();
