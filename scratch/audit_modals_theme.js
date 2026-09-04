const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const { generateToken } = require(path.join(__dirname, '../Backend/src/utils/auth'));

const ARTIFACTS_DIR = '/Users/mostafakamal/.gemini/antigravity-ide/brain/5ceff95b-7b94-4426-b8cf-54555277da86';
const chromePaths = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
];
const executablePath = chromePaths.find(p => fs.existsSync(p));

(async () => {
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const adminUser = {
    id: 1,
    username: 'M0stafa',
    name: 'Mostafa Kamal',
    email: 'mostafakamal.cse2022@gmail.com',
    role: 'admin',
    institution: 'Jashore University of Science and Technology'
  };
  const token = generateToken(adminUser);

  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    await page.evaluateOnNewDocument((t, u, thm) => {
      localStorage.setItem('litsphere_auth_token', t);
      localStorage.setItem('litsphere_user', JSON.stringify(u));
      localStorage.setItem('litsphere_theme', thm);
      document.documentElement.setAttribute('data-theme', thm);
      if (thm === 'light') {
        document.documentElement.classList.add('light-mode');
        document.body?.classList.add('light-mode');
      }
    }, token, adminUser, theme);

    await page.goto('http://localhost:3000/workspace.html?project=10&cluster=145', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.evaluate((thm) => {
      document.documentElement.setAttribute('data-theme', thm);
      if (thm === 'light') {
        document.documentElement.classList.add('light-mode');
        document.body.classList.add('light-mode');
      } else {
        document.documentElement.classList.remove('light-mode');
        document.body.classList.remove('light-mode');
      }
    }, theme);

    const modals = [
      { id: 'add-paper-modal', name: 'add_paper' },
      { id: 'team-modal-overlay', name: 'team' },
      { id: 'export-modal-overlay', name: 'export' },
      { id: 'add-cluster-modal', name: 'add_cluster' }
    ];

    for (const m of modals) {
      await page.evaluate((modalId) => {
        if (typeof window.openModal === 'function') {
          window.openModal(modalId);
        } else {
          const el = document.getElementById(modalId);
          if (el) el.classList.add('active', 'show');
        }
      }, m.id);
      await new Promise(r => setTimeout(r, 600));

      const shotPath = path.join(ARTIFACTS_DIR, `modal_${m.name}_${theme}.png`);
      await page.screenshot({ path: shotPath });
      console.log(`Saved modal_${m.name}_${theme}.png`);

      await page.evaluate((modalId) => {
        if (typeof window.closeModal === 'function') {
          window.closeModal(modalId);
        } else {
          const el = document.getElementById(modalId);
          if (el) el.classList.remove('active', 'show');
        }
      }, m.id);
      await new Promise(r => setTimeout(r, 300));
    }

    await page.close();
  }

  await browser.close();
  console.log('=== ALL MODALS CAPTURED AND AUDITED ===');
})();
