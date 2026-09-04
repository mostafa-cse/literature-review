const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { generateToken } = require('../Backend/src/utils/auth');

const OUT_DIR = path.join(__dirname, '..', 'presentation_screenshots');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function captureAll() {
  console.log('Launching headless Chrome for crisp presentation screenshots...');
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

  async function injectAuth() {
    await page.evaluate((t, u) => {
      localStorage.setItem('litsphere_auth_token', t);
      localStorage.setItem('litsphere_user', JSON.stringify(u));
      localStorage.setItem('litsphere_theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    }, token, adminUser);
  }

  // 1. Home Hero
  console.log('1/12: 01_home_hero.png...');
  await page.goto('http://localhost:3000/home.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(OUT_DIR, '01_home_hero.png') });

  // 2. Architecture & Subsystems
  console.log('2/12: 02_architecture_subsystems.png...');
  await page.goto('http://localhost:3000/about.html', { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.scrollBy(0, 520));
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(OUT_DIR, '02_architecture_subsystems.png') });

  // 3. Auth Portal
  console.log('3/12: 03_auth_security.png...');
  await page.goto('http://localhost:3000/auth.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(OUT_DIR, '03_auth_security.png') });

  // 4. Dashboard Surveys
  console.log('4/12: 04_dashboard_surveys.png...');
  await page.goto('http://localhost:3000/home.html', { waitUntil: 'networkidle0' });
  await injectAuth();
  await page.goto('http://localhost:3000/dashboard.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(OUT_DIR, '04_dashboard_surveys.png') });

  // 5. Paper Ingestion Modal
  console.log('5/12: 05_paper_ingestion_modal.png...');
  await page.goto('http://localhost:3000/workspace.html?project=10', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => {
    if (window.openAddPaperModal) window.openAddPaperModal('single');
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(OUT_DIR, '05_paper_ingestion_modal.png') });

  // 6. Master Matrix Grid
  console.log('6/12: 06_master_matrix_grid.png...');
  await page.goto('http://localhost:3000/workspace.html?project=10', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => {
    const el = document.getElementById('table-container');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(OUT_DIR, '06_master_matrix_grid.png') });

  // 7. Dynamic Column Split Modal
  console.log('7/12: 07_dynamic_column_split.png...');
  await page.goto('http://localhost:3000/workspace.html?project=10', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => {
    if (window.openSplitColumnModal) window.openSplitColumnModal();
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(OUT_DIR, '07_dynamic_column_split.png') });

  // 8. Split-Screen Reviewer
  console.log('8/12: 08_splitscreen_reviewer.png...');
  await page.goto('http://localhost:3000/review.html?project=10&paper=111', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 3500));
  await page.screenshot({ path: path.join(OUT_DIR, '08_splitscreen_reviewer.png') });

  // 9. PRISMA Screening & Comments
  console.log('9/12: 09_prisma_screening.png...');
  await page.evaluate(() => {
    const pane = document.querySelector('.review-right-pane') || document.querySelector('.meta-panel-body') || window;
    pane.scrollBy({ top: 350, behavior: 'instant' });
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, '09_prisma_screening.png') });

  // 10. Collaboration RBAC Modal
  console.log('10/12: 10_collaboration_rbac.png...');
  await page.goto('http://localhost:3000/workspace.html?project=10', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => {
    if (window.openTeamModal) window.openTeamModal();
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(OUT_DIR, '10_collaboration_rbac.png') });

  // 11. Export Survey Modal
  console.log('11/12: 11_export_modal.png...');
  await page.goto('http://localhost:3000/workspace.html?project=10', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => {
    if (window.openExportModal) window.openExportModal();
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(OUT_DIR, '11_export_modal.png') });

  // 12. Admin Telemetry & Control Center
  console.log('12/12: 12_admin_telemetry.png...');
  await page.goto('http://localhost:3000/admin.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(OUT_DIR, '12_admin_telemetry.png') });

  await browser.close();
  console.log('All 12 screenshots updated successfully!');
}

captureAll().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
