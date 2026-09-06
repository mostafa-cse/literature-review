const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { generateToken } = require('../Backend/src/utils/auth');

const OUT_DIR = path.join(__dirname, '..', 'Report', 'figures');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function run() {
  console.log('Launching Chrome to capture publication-grade LIGHT MODE screenshots...');
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080',
      '--disable-web-security',
      '--font-render-hinting=none'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1.5 });

  const adminUser = {
    id: 1,
    username: 'M0stafa',
    name: 'Mostafa Kamal',
    email: 'mostafakamal.cse2022@gmail.com',
    role: 'admin',
    institution: 'Jashore University of Science and Technology'
  };
  const token = generateToken(adminUser);

  async function applyLightModeAndAuth() {
    await page.evaluate((t, u) => {
      localStorage.setItem('litsphere_auth_token', t);
      localStorage.setItem('litsphere_user', JSON.stringify(u));
      localStorage.setItem('litsphere_theme', 'light');
      localStorage.setItem('lr_platform_theme', 'light');
      localStorage.setItem('fs_theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
      document.body.classList.add('light-mode');
    }, token, adminUser);
  }

  // 1. Login Interface (Sign In Tab) (Light Mode)
  console.log('Capturing fig5_01_login_interface.png (Light Mode)...');
  await page.goto('http://localhost:3000/auth.html', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    localStorage.setItem('litsphere_theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
    document.body.classList.add('light-mode');
    if (window.setAuthMode) window.setAuthMode('login');
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(OUT_DIR, 'fig5_01_login_interface.png') });

  // 2. Create Account Interface (Register Tab) (Light Mode)
  console.log('Capturing fig5_02_create_account_interface.png (Light Mode)...');
  await page.evaluate(() => {
    if (window.setAuthMode) window.setAuthMode('register');
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(OUT_DIR, 'fig5_02_create_account_interface.png') });

  // 3. Dashboard Overview (Light Mode)
  console.log('Capturing fig5_03_dashboard_overview.png (Light Mode)...');
  await page.goto('http://localhost:3000/home.html', { waitUntil: 'networkidle0' });
  await applyLightModeAndAuth();
  await page.goto('http://localhost:3000/dashboard.html', { waitUntil: 'networkidle0' });
  await applyLightModeAndAuth();
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(OUT_DIR, 'fig5_03_dashboard_overview.png') });

  // 4. Create New Survey Modal (Light Mode)
  console.log('Capturing fig5_04_create_survey_modal.png (Light Mode)...');
  await page.evaluate(() => {
    if (window.openCreateSurveyModal) {
      window.openCreateSurveyModal();
    } else {
      const m = document.getElementById('modal-create-survey');
      if (m) m.classList.add('active');
    }
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(OUT_DIR, 'fig5_04_create_survey_modal.png') });

  // Close survey modal
  await page.evaluate(() => {
    if (window.closeCreateSurveyModal) window.closeCreateSurveyModal();
    const m = document.getElementById('modal-create-survey');
    if (m) m.classList.remove('active');
  });

  // 5. Project Workspace Overview (Light Mode)
  console.log('Capturing fig5_05_project_workspace.png (Light Mode)...');
  await page.goto('http://localhost:3000/workspace.html?project=10', { waitUntil: 'networkidle0' });
  await applyLightModeAndAuth();
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(OUT_DIR, 'fig5_05_project_workspace.png') });

  // 6. Add Papers Modal (Light Mode)
  console.log('Capturing fig5_06_add_papers_modal.png (Light Mode)...');
  await page.evaluate(() => {
    if (window.openAddPaperModal) window.openAddPaperModal('single');
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(OUT_DIR, 'fig5_06_add_papers_modal.png') });
  await page.evaluate(() => {
    if (window.closeModal) window.closeModal('upload-modal-overlay');
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('active'));
  });
  await new Promise(r => setTimeout(r, 600));

  // 7. Add Cluster Modal (Light Mode)
  console.log('Capturing fig5_07_add_cluster_modal.png (Light Mode)...');
  await page.evaluate(() => {
    if (window.openCreateClusterModal) window.openCreateClusterModal();
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(OUT_DIR, 'fig5_07_add_cluster_modal.png') });
  await page.evaluate(() => {
    if (window.closeModal) window.closeModal('cluster-modal-overlay');
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('active'));
  });
  await new Promise(r => setTimeout(r, 600));

  // 8. Dual-Pane Paper Reviewer (Left-Right Pan) (Light Mode)
  console.log('Capturing fig5_08_dual_pane_reviewer.png (Light Mode)...');
  await page.goto('http://localhost:3000/review.html?project=10&paper=111', { waitUntil: 'networkidle0' });
  await applyLightModeAndAuth();
  await new Promise(r => setTimeout(r, 3800));
  await page.screenshot({ path: path.join(OUT_DIR, 'fig5_08_dual_pane_reviewer.png') });

  // Return to workspace for scroll-targeted modules
  await page.goto('http://localhost:3000/workspace.html?project=10', { waitUntil: 'networkidle0' });
  await applyLightModeAndAuth();
  await new Promise(r => setTimeout(r, 2500));

  // 9. Cluster List (Light Mode)
  console.log('Capturing fig5_09_cluster_list.png (Light Mode)...');
  await page.evaluate(() => {
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('active'));
    const sec = document.querySelector('.clusters-section');
    if (sec) {
      sec.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(OUT_DIR, 'fig5_09_cluster_list.png') });

  // 10. Research Keywords & Topic Filtering Hub (Light Mode)
  console.log('Capturing fig5_10_keywords_hub.png (Light Mode)...');
  await page.evaluate(() => {
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('active'));
    const kw = document.getElementById('keywords-section');
    if (kw) {
      kw.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(OUT_DIR, 'fig5_10_keywords_hub.png') });

  // 11. Master Matrix Grid Table (Light Mode)
  console.log('Capturing fig5_11_matrix_grid_table.png (Light Mode)...');
  await page.evaluate(() => {
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('active'));
    const tbl = document.getElementById('table-container');
    if (tbl) {
      tbl.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  });
  await new Promise(r => setTimeout(r, 1800));
  await page.screenshot({ path: path.join(OUT_DIR, 'fig5_11_matrix_grid_table.png') });

  // 12. Cluster Summary Analytics Breakdown (Light Mode)
  console.log('Capturing fig5_12_cluster_summary.png (Light Mode)...');
  await page.evaluate(() => {
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('active'));
    const sum = document.getElementById('cluster-summary-section');
    if (sum) {
      sum.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  });
  await new Promise(r => setTimeout(r, 1800));
  await page.screenshot({ path: path.join(OUT_DIR, 'fig5_12_cluster_summary.png') });

  await browser.close();
  console.log('All 12 publication-grade LIGHT MODE screenshots captured successfully!');
}

run().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
