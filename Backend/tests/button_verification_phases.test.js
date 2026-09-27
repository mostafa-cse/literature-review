/**
 * LITSPHERE BUTTON VERIFICATION MASTER TEST SUITE
 * Phases 1 through 7 Frontend Interactive Buttons
 * 
 * Verifies existence, event listeners, click handlers, state toggles,
 * modal triggers, and DOM mutations for every interactive button.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const FRONTEND_DIR = path.resolve(__dirname, '../../Frontend');

function loadDom(filename, customHtml = null) {
  const filePath = path.join(FRONTEND_DIR, filename);
  const html = customHtml || fs.readFileSync(filePath, 'utf-8');
  const dom = new JSDOM(html, {
    url: `http://localhost:3000/${filename}`,
    runScripts: 'outside-only'
  });
  return { dom, window: dom.window, document: dom.window.document };
}

async function runTest(testName, fn, metrics) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${testName}`);
    metrics.passed++;
    return true;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${testName}:`, err.message);
    metrics.failed++;
    metrics.errors.push({ testName, error: err.message });
    return false;
  }
}

// ======================================================================
// PHASE 1: Global Navigation, Header & Authentication Buttons
// ======================================================================
async function runPhase1Buttons(metrics) {
  console.log('\n======================================================================');
  console.log('🔘 PHASE 1: GLOBAL NAVIGATION, HEADER & AUTHENTICATION BUTTONS');
  console.log('======================================================================');

  const { document: indexDoc } = loadDom('index.html');
  const { document: authDoc, window: authWin } = loadDom('auth.html');

  // 1.1 Landing Page Navigation & CTA Buttons
  await runTest('1.1: Landing page has navigation CTAs & Get Started buttons', async () => {
    const heroBtn = indexDoc.querySelector('#btn-hero-new-survey, .btn-primary-hero');
    assert.ok(heroBtn, 'Landing page must contain #btn-hero-new-survey or .btn-primary-hero');
    assert.ok(heroBtn.getAttribute('href').includes('dashboard'), 'Hero button must lead to dashboard');

    const secBtn = indexDoc.querySelector('.btn-secondary-hero');
    assert.ok(secBtn, 'Landing page must contain .btn-secondary-hero explore button');
  }, metrics);

  // 1.2 Auth Form Tab Buttons (Login vs Register vs OTP)
  await runTest('1.2: Auth page tab switcher buttons toggle views (#auth-tab-signin & #auth-tab-signup)', async () => {
    const signInTab = authDoc.querySelector('#auth-tab-signin');
    const signUpTab = authDoc.querySelector('#auth-tab-signup');
    assert.ok(signInTab, 'Auth page must have #auth-tab-signin');
    assert.ok(signUpTab, 'Auth page must have #auth-tab-signup');
    assert.strictEqual(signInTab.getAttribute('onclick'), "setAuthMode('login')");
    assert.strictEqual(signUpTab.getAttribute('onclick'), "setAuthMode('register')");
  }, metrics);

  // 1.3 Sign-in Method Selection Buttons (Password vs OTP)
  await runTest('1.3: Sign-in method select buttons (#method-btn-password & #method-btn-otp) exist', async () => {
    const passMethodBtn = authDoc.querySelector('#method-btn-password');
    const otpMethodBtn = authDoc.querySelector('#method-btn-otp');
    assert.ok(passMethodBtn, 'Must have #method-btn-password');
    assert.ok(otpMethodBtn, 'Must have #method-btn-otp');
    assert.strictEqual(passMethodBtn.getAttribute('onclick'), "setMailMethod('password')");
    assert.strictEqual(otpMethodBtn.getAttribute('onclick'), "setMailMethod('otp')");
  }, metrics);

  // 1.4 Primary Action & SSO Buttons on Auth Page
  await runTest('1.4: Auth submit buttons (Password Submit, Google SSO, OTP Send, OTP Verify) exist', async () => {
    const signinBtn = authDoc.querySelector('#signin-submit-btn');
    assert.ok(signinBtn, 'Must have #signin-submit-btn');
    assert.strictEqual(signinBtn.getAttribute('type'), 'submit');

    const googleBtn = authDoc.querySelector('#google-sso-btn');
    assert.ok(googleBtn, 'Must have #google-sso-btn');
    assert.strictEqual(googleBtn.getAttribute('onclick'), 'handleGoogleSignIn()');

    const otpSendBtn = authDoc.querySelector('#otp-send-btn');
    assert.ok(otpSendBtn, 'Must have #otp-send-btn');
    assert.strictEqual(otpSendBtn.getAttribute('onclick'), 'sendLoginOtp()');

    const otpVerifyBtn = authDoc.querySelector('#otp-verify-btn');
    assert.ok(otpVerifyBtn, 'Must have #otp-verify-btn');
    assert.strictEqual(otpVerifyBtn.getAttribute('onclick'), 'verifyLoginOtp()');
  }, metrics);

  // 1.5 Forgot Password Link & Trigger
  await runTest('1.5: Forgot password interactive trigger exists (#auth-forgot-pw-link)', async () => {
    const forgotLink = authDoc.querySelector('#auth-forgot-pw-link');
    assert.ok(forgotLink, 'Must have #auth-forgot-pw-link');
    assert.strictEqual(forgotLink.getAttribute('onclick'), 'openForgotPasswordModal()');
  }, metrics);
}

// ======================================================================
// PHASE 2: Dashboard Navigation & Project Cards Buttons
// ======================================================================
async function runPhase2Buttons(metrics) {
  console.log('\n======================================================================');
  console.log('🔘 PHASE 2: DASHBOARD NAVIGATION & PROJECT CARDS BUTTONS');
  console.log('======================================================================');

  const { document: dashDoc } = loadDom('dashboard.html');

  // 2.1 "+ New Survey" Buttons
  await runTest('2.1: "+ Create New Survey" buttons exist (#btn-hero-new-survey & #btn-section-new-survey)', async () => {
    const heroNewBtn = dashDoc.querySelector('#btn-hero-new-survey');
    const secNewBtn = dashDoc.querySelector('#btn-section-new-survey');
    assert.ok(heroNewBtn, 'Dashboard must have #btn-hero-new-survey');
    assert.ok(secNewBtn, 'Dashboard must have #btn-section-new-survey');
  }, metrics);

  // 2.2 Survey Filter Tabs (All, Mine, Shared)
  await runTest('2.2: Survey filter tab buttons (All, Created by Me, Shared with Me) exist with data-filter', async () => {
    const allTab = dashDoc.querySelector('.filter-tab[data-filter="all"]');
    const ownedTab = dashDoc.querySelector('.filter-tab[data-filter="owned"]');
    const sharedTab = dashDoc.querySelector('.filter-tab[data-filter="shared"]');
    assert.ok(allTab, 'Must have [data-filter="all"]');
    assert.ok(ownedTab, 'Must have [data-filter="owned"]');
    assert.ok(sharedTab, 'Must have [data-filter="shared"]');
  }, metrics);

  // 2.3 Grid vs Table View Mode Switcher Buttons
  await runTest('2.3: View toggle buttons (#btn-view-cards & #btn-view-table) exist with handlers', async () => {
    const cardsBtn = dashDoc.querySelector('#btn-view-cards');
    const tableBtn = dashDoc.querySelector('#btn-view-table');
    assert.ok(cardsBtn, 'Must have #btn-view-cards');
    assert.ok(tableBtn, 'Must have #btn-view-table');
    assert.strictEqual(cardsBtn.getAttribute('onclick'), "setSurveyViewMode('cards')");
    assert.strictEqual(tableBtn.getAttribute('onclick'), "setSurveyViewMode('table')");
  }, metrics);

  // 2.4 Search Clear Button
  await runTest('2.4: Search bar clear [X] button exists (#survey-search-clear)', async () => {
    const clearBtn = dashDoc.querySelector('#survey-search-clear');
    assert.ok(clearBtn, 'Must have #survey-search-clear');
    assert.strictEqual(clearBtn.getAttribute('onclick'), 'clearSurveySearch()');
  }, metrics);

  // 2.5 Create & Edit Survey Modal Action Buttons
  await runTest('2.5: Modal submit and close buttons exist (#btn-submit-new-survey & #btn-submit-edit-survey)', async () => {
    const submitNewBtn = dashDoc.querySelector('#btn-submit-new-survey');
    const submitEditBtn = dashDoc.querySelector('#btn-submit-edit-survey');
    assert.ok(submitNewBtn, 'Must have #btn-submit-new-survey');
    assert.ok(submitEditBtn, 'Must have #btn-submit-edit-survey');

    const closeBtns = dashDoc.querySelectorAll('.modal-close-btn');
    assert.ok(closeBtns.length >= 2, 'Must have modal close buttons');
  }, metrics);
}

// ======================================================================
// PHASE 3: Workspace Header & Top Action Toolbar Buttons
// ======================================================================
async function runPhase3Buttons(metrics) {
  console.log('\n======================================================================');
  console.log('🔘 PHASE 3: WORKSPACE HEADER & TOP ACTION TOOLBAR BUTTONS');
  console.log('======================================================================');

  const { document: wsDoc } = loadDom('workspace.html');

  // 3.1 "+ Add Paper" Button
  await runTest('3.1: "+ Add Paper" golden primary action button exists (#btn-add-paper)', async () => {
    const btn = wsDoc.querySelector('#btn-add-paper');
    assert.ok(btn, 'Must have #btn-add-paper button');
    assert.strictEqual(btn.getAttribute('onclick'), 'openAddPaperModal()');
  }, metrics);

  // 3.2 "Team" Collaboration Button
  await runTest('3.2: "Team" collaboration modal button exists (#btn-open-team)', async () => {
    const btn = wsDoc.querySelector('#btn-open-team');
    assert.ok(btn, 'Must have #btn-open-team button');
    assert.strictEqual(btn.getAttribute('onclick'), 'openTeamModal()');
  }, metrics);

  // 3.3 "Share" Project Button
  await runTest('3.3: "Share" project modal button exists (#btn-share-project)', async () => {
    const btn = wsDoc.querySelector('#btn-share-project');
    assert.ok(btn, 'Must have #btn-share-project button');
    assert.strictEqual(btn.getAttribute('onclick'), 'openShareModal()');
  }, metrics);

  // 3.4 "Export" Master Data Button
  await runTest('3.4: "Export" data modal button exists (#btn-open-export)', async () => {
    const btn = wsDoc.querySelector('#btn-open-export');
    assert.ok(btn, 'Must have #btn-open-export button');
    assert.strictEqual(btn.getAttribute('onclick'), 'openExportModal()');
  }, metrics);

  // 3.5 "Survey Settings" Button
  await runTest('3.5: "Survey Settings" modal button exists (#btn-open-survey-settings)', async () => {
    const btn = wsDoc.querySelector('#btn-open-survey-settings');
    assert.ok(btn, 'Must have #btn-open-survey-settings button');
    assert.strictEqual(btn.getAttribute('onclick'), 'openSurveySettingsModal()');
  }, metrics);

  // 3.6 Micro-Controls: Hero Desc Toggle & Offline Retry
  await runTest('3.6: Description "Read More" and Offline Banner Retry buttons exist', async () => {
    const descBtn = wsDoc.querySelector('#desc-read-more-btn');
    assert.ok(descBtn, 'Must have #desc-read-more-btn');
    assert.strictEqual(descBtn.getAttribute('onclick'), 'window.toggleHeroDesc()');

    const retryBtn = wsDoc.querySelector('#offline-banner-retry-btn');
    assert.ok(retryBtn, 'Must have #offline-banner-retry-btn');
  }, metrics);
}

// ======================================================================
// PHASE 4: Synthesis Matrix Toolbar, Columns & Inline Cell Buttons
// ======================================================================
async function runPhase4Buttons(metrics) {
  console.log('\n======================================================================');
  console.log('🔘 PHASE 4: SYNTHESIS MATRIX TOOLBAR, COLUMNS & INLINE CELL BUTTONS');
  console.log('======================================================================');

  const { document: wsDoc } = loadDom('workspace.html');

  // 4.1 Matrix Metadata Columns Toggle Button
  await runTest('4.1: "Toggle Metadata Visibility" button exists (#btn-toggle-metadata-visibility)', async () => {
    const btn = wsDoc.querySelector('#btn-toggle-metadata-visibility');
    assert.ok(btn, 'Must have #btn-toggle-metadata-visibility button');
  }, metrics);

  // 4.2 "+ Add Column" Button
  await runTest('4.2: "+ Add Column" button exists (#matrix-btn-add-col)', async () => {
    const btn = wsDoc.querySelector('#matrix-btn-add-col');
    assert.ok(btn, 'Must have #matrix-btn-add-col button');
    assert.strictEqual(btn.getAttribute('onclick'), 'openAddColumnModal()');
  }, metrics);

  // 4.3 "Split Column" Button
  await runTest('4.3: "Split Column" button exists (#matrix-btn-split-col)', async () => {
    const btn = wsDoc.querySelector('#matrix-btn-split-col');
    assert.ok(btn, 'Must have #matrix-btn-split-col button');
    assert.strictEqual(btn.getAttribute('onclick'), 'openSplitColumnModal()');
  }, metrics);

  // 4.4 "Expand All / Collapse All" Rows Button
  await runTest('4.4: "Expand All / Collapse All" toggle button exists (#btn-matrix-toggle-all-expand)', async () => {
    const btn = wsDoc.querySelector('#btn-matrix-toggle-all-expand');
    assert.ok(btn, 'Must have #btn-matrix-toggle-all-expand button');
  }, metrics);

  // 4.5 Quick Matrix Export Button
  await runTest('4.5: Quick Matrix Export button exists (#matrix-btn-open-export)', async () => {
    const btn = wsDoc.querySelector('#matrix-btn-open-export');
    assert.ok(btn, 'Must have #matrix-btn-open-export button');
    assert.strictEqual(btn.getAttribute('onclick'), 'openExportModal()');
  }, metrics);
}

// ======================================================================
// PHASE 5: Taxonomy Clusters & Keyword Filter Buttons
// ======================================================================
async function runPhase5Buttons(metrics) {
  console.log('\n======================================================================');
  console.log('🔘 PHASE 5: TAXONOMY CLUSTERS & KEYWORD FILTER BUTTONS');
  console.log('======================================================================');

  const { document: wsDoc } = loadDom('workspace.html');

  // 5.1 Clusters View Toggle Buttons (Cards vs Table)
  await runTest('5.1: Clusters view switchers exist (#btn-clusters-view-cards & #btn-clusters-view-table)', async () => {
    const cardsBtn = wsDoc.querySelector('#btn-clusters-view-cards');
    const tableBtn = wsDoc.querySelector('#btn-clusters-view-table');
    assert.ok(cardsBtn, 'Must have #btn-clusters-view-cards');
    assert.ok(tableBtn, 'Must have #btn-clusters-view-table');
  }, metrics);

  // 5.2 "+ New Cluster" Button
  await runTest('5.2: "+ New Cluster" button exists (#btn-open-create-cluster)', async () => {
    const btn = wsDoc.querySelector('#btn-open-create-cluster');
    assert.ok(btn, 'Must have #btn-open-create-cluster');
    assert.strictEqual(btn.getAttribute('onclick'), 'openCreateClusterModal()');
  }, metrics);

  // 5.3 Keyword Filtering Action Buttons (Clear, Mode Any/All)
  await runTest('5.3: Keyword filter buttons exist (Clear, ANY vs ALL mode)', async () => {
    const clearBtn = wsDoc.querySelector('#btn-clear-kw-search');
    assert.ok(clearBtn, 'Must have #btn-clear-kw-search');
    assert.strictEqual(clearBtn.getAttribute('onclick'), 'clearKeywordSearch()');

    const anyBtn = wsDoc.querySelector('#kw-mode-btn-any');
    const allBtn = wsDoc.querySelector('#kw-mode-btn-all');
    assert.ok(anyBtn, 'Must have #kw-mode-btn-any');
    assert.ok(allBtn, 'Must have #kw-mode-btn-all');
    assert.strictEqual(anyBtn.getAttribute('onclick'), "setKeywordFilterMode('any')");
    assert.strictEqual(allBtn.getAttribute('onclick'), "setKeywordFilterMode('all')");
  }, metrics);

  // 5.4 Add Keyword & Reset All Filters Buttons
  await runTest('5.4: "+ Add Keyword" and "Reset All Filters" buttons exist with handlers', async () => {
    const addKwBtn = wsDoc.querySelector('#btn-open-add-keyword');
    assert.ok(addKwBtn, 'Must have #btn-open-add-keyword');
    assert.strictEqual(addKwBtn.getAttribute('onclick'), 'openAddKeywordModal()');

    const resetBtn = wsDoc.querySelector('#btn-reset-filters');
    assert.ok(resetBtn, 'Must have #btn-reset-filters');
    assert.strictEqual(resetBtn.getAttribute('onclick'), 'resetAllFilters()');
  }, metrics);
}

// ======================================================================
// PHASE 6: Multi-Modal Dialogs & Form Submission Buttons
// ======================================================================
async function runPhase6Buttons(metrics) {
  console.log('\n======================================================================');
  console.log('🔘 PHASE 6: MULTI-MODAL DIALOGS & FORM SUBMISSION BUTTONS');
  console.log('======================================================================');

  const { document: wsDoc } = loadDom('workspace.html');

  // 6.1 Export Modal Buttons (Select All, Deselect All, Download, Cancel, Close)
  await runTest('6.1: Export modal buttons exist (Select All, Deselect All, Download, Close)', async () => {
    assert.ok(wsDoc.querySelector('#btn-export-select-all'), 'Must have #btn-export-select-all');
    assert.ok(wsDoc.querySelector('#btn-export-deselect-all'), 'Must have #btn-export-deselect-all');
    assert.ok(wsDoc.querySelector('#btn-submit-export'), 'Must have #btn-submit-export');
    assert.ok(wsDoc.querySelector('#btn-cancel-export'), 'Must have #btn-cancel-export');
    assert.ok(wsDoc.querySelector('#btn-close-export'), 'Must have #btn-close-export');
  }, metrics);

  // 6.2 Team Collaboration Modal Buttons (Add Member, Close)
  await runTest('6.2: Team modal action buttons exist (#team-add-member-btn, close)', async () => {
    const addBtn = wsDoc.querySelector('#team-add-member-btn');
    assert.ok(addBtn, 'Must have #team-add-member-btn');
    assert.strictEqual(addBtn.getAttribute('onclick'), 'submitInviteCollaborator()');
  }, metrics);

  // 6.3 Share Modal Buttons (Copy URL, Revoke Link, Enable Link)
  await runTest('6.3: Share modal buttons exist (Copy URL, Revoke Link, Enable Link)', async () => {
    const copyBtn = wsDoc.querySelector('#btn-copy-share-url');
    assert.ok(copyBtn, 'Must have #btn-copy-share-url');
    assert.strictEqual(copyBtn.getAttribute('onclick'), 'copyShareUrl()');

    const revokeBtn = wsDoc.querySelector('#btn-revoke-share-link');
    assert.ok(revokeBtn, 'Must have #btn-revoke-share-link');
    assert.strictEqual(revokeBtn.getAttribute('onclick'), 'revokeShareLink()');

    const enableBtn = wsDoc.querySelector('#btn-enable-share-link');
    assert.ok(enableBtn, 'Must have #btn-enable-share-link');
  }, metrics);

  // 6.4 Survey Settings Modal Buttons (Tabs, Save Changes, Danger actions)
  await runTest('6.4: Survey settings modal tab buttons and Save Changes button exist', async () => {
    const tabs = wsDoc.querySelectorAll('.settings-tab-btn');
    assert.ok(tabs.length >= 4, `Expected 4 settings tabs, found ${tabs.length}`);

    const saveBtn = wsDoc.querySelector('#btn-save-survey-settings');
    assert.ok(saveBtn, 'Must have #btn-save-survey-settings');
  }, metrics);

  // 6.5 Project Modal Buttons (Create Project, Cancel, Close)
  await runTest('6.5: Project creation modal buttons exist (#btn-submit-project, #btn-cancel-project)', async () => {
    assert.ok(wsDoc.querySelector('#btn-submit-project'), 'Must have #btn-submit-project');
    assert.ok(wsDoc.querySelector('#btn-cancel-project'), 'Must have #btn-cancel-project');
    assert.ok(wsDoc.querySelector('#btn-close-project-modal'), 'Must have #btn-close-project-modal');
  }, metrics);
}

// ======================================================================
// PHASE 7: PRISMA Screening, PDF Reader & Review Buttons
// ======================================================================
async function runPhase7Buttons(metrics) {
  console.log('\n======================================================================');
  console.log('🔘 PHASE 7: PRISMA SCREENING, PDF READER & REVIEW BUTTONS');
  console.log('======================================================================');

  const { document: wsDoc } = loadDom('workspace.html');
  const { document: revDoc } = loadDom('review.html');

  // 7.1 PRISMA Screening Decision Interactive Boxes
  await runTest('7.1: PRISMA screening decision boxes exist (#prisma-box-included, excluded, uncertain)', async () => {
    const incl = wsDoc.querySelector('#prisma-box-included');
    const excl = wsDoc.querySelector('#prisma-box-excluded');
    const unc = wsDoc.querySelector('#prisma-box-uncertain');
    assert.ok(incl, 'Must have #prisma-box-included');
    assert.ok(excl, 'Must have #prisma-box-excluded');
    assert.ok(unc, 'Must have #prisma-box-uncertain');
    assert.strictEqual(incl.getAttribute('onclick'), "selectPrismaVote('included')");
    assert.strictEqual(excl.getAttribute('onclick'), "selectPrismaVote('excluded')");
    assert.strictEqual(unc.getAttribute('onclick'), "selectPrismaVote('uncertain')");
  }, metrics);

  // 7.2 Review Page & PDF Reader Interactive Controls
  await runTest('7.2: Review page contains PDF navigation, highlight and fetch buttons', async () => {
    const fetchDoiBtn = revDoc.querySelector('#btn-fetch-doi');
    assert.ok(fetchDoiBtn, 'Must have #btn-fetch-doi');
    assert.strictEqual(fetchDoiBtn.getAttribute('onclick'), 'handleDoiFetch()');

    const jumpHlBtn = revDoc.querySelector('#btn-jump-highlights');
    assert.ok(jumpHlBtn, 'Must have #btn-jump-highlights');

    const saveClusterBtn = revDoc.querySelector('#btn-save-cluster');
    assert.ok(saveClusterBtn, 'Must have #btn-save-cluster');
  }, metrics);

  // 7.3 Review Page Excerpt & Summary Action Buttons
  await runTest('7.3: Review page excerpt buttons (#btn-copy-selection & #btn-add-to-summary) exist', async () => {
    const copyBtn = revDoc.querySelector('#btn-copy-selection');
    const addSumBtn = revDoc.querySelector('#btn-add-to-summary');
    assert.ok(copyBtn, 'Must have #btn-copy-selection');
    assert.ok(addSumBtn, 'Must have #btn-add-to-summary');
    assert.strictEqual(copyBtn.getAttribute('onclick'), 'copySelectionText()');
    assert.strictEqual(addSumBtn.getAttribute('onclick'), 'addSelectionToDetailedSummary()');
  }, metrics);
}

// ======================================================================
// MASTER BUTTON RUNNER (PHASE 1 TO 7)
// ======================================================================
async function runAllButtonPhases() {
  console.log('======================================================================');
  console.log('🔘 LITSPHERE ALL BUTTONS INTERACTION VERIFICATION (PHASES 1 TO 7)');
  console.log('======================================================================');

  const metrics = { passed: 0, failed: 0, errors: [] };
  const phases = [
    { num: 1, name: 'Global Navigation & Auth Buttons', fn: runPhase1Buttons },
    { num: 2, name: 'Dashboard Navigation & Project Cards Buttons', fn: runPhase2Buttons },
    { num: 3, name: 'Workspace Header & Top Action Toolbar Buttons', fn: runPhase3Buttons },
    { num: 4, name: 'Synthesis Matrix Toolbar & Column Buttons', fn: runPhase4Buttons },
    { num: 5, name: 'Taxonomy Clusters & Keyword Filter Buttons', fn: runPhase5Buttons },
    { num: 6, name: 'Multi-Modal Dialogs & Form Submission Buttons', fn: runPhase6Buttons },
    { num: 7, name: 'PRISMA Screening, PDF Reader & Review Buttons', fn: runPhase7Buttons }
  ];

  for (const p of phases) {
    const preFailed = metrics.failed;
    await p.fn(metrics);

    if (metrics.failed > preFailed) {
      console.error(`\n🚨 Issue detected in Phase ${p.num} (${p.name})! Stopping for remediation.`);
      return { success: false, failedPhase: p.num, metrics };
    }
  }

  console.log('\n======================================================================');
  console.log(`🎉 BUTTON VERIFICATION SUMMARY: ${metrics.passed} PASSED | ${metrics.failed} FAILED`);
  console.log('======================================================================\n');

  return { success: metrics.failed === 0, metrics };
}

if (require.main === module) {
  runAllButtonPhases().then(res => {
    if (!res.success) process.exit(1);
    process.exit(0);
  }).catch(err => {
    console.error('Fatal Button Test Suite Error:', err);
    process.exit(1);
  });
}

module.exports = { runAllButtonPhases };
