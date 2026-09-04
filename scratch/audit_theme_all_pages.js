const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const { generateToken } = require(path.join(__dirname, '../Backend/src/utils/auth'));

const ARTIFACTS_DIR = '/Users/mostafakamal/.gemini/antigravity-ide/brain/5ceff95b-7b94-4426-b8cf-54555277da86';
const chromePaths = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
];
const executablePath = chromePaths.find(p => fs.existsSync(p));

const PAGES = [
  { name: 'home', url: 'http://localhost:3000/home.html' },
  { name: 'auth', url: 'http://localhost:3000/auth.html' },
  { name: 'about', url: 'http://localhost:3000/about.html' },
  { name: 'dashboard', url: 'http://localhost:3000/dashboard.html' },
  { name: 'workspace', url: 'http://localhost:3000/workspace.html?project=10&cluster=145' },
  { name: 'review', url: 'http://localhost:3000/review.html?project=10&paper=518' },
  { name: 'profile', url: 'http://localhost:3000/profile.html' },
  { name: 'admin', url: 'http://localhost:3000/admin.html' }
];

(async () => {
  if (!executablePath) {
    console.error('No Chrome executable found!');
    process.exit(1);
  }

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

  const results = [];

  for (const pageInfo of PAGES) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });

      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });
      page.on('pageerror', err => {
        consoleErrors.push(err.message);
      });

      await page.evaluateOnNewDocument((t, u, thm) => {
        localStorage.setItem('litsphere_auth_token', t);
        localStorage.setItem('litsphere_user', JSON.stringify(u));
        localStorage.setItem('litsphere_theme', thm);
        localStorage.setItem('lr_platform_theme', thm);
        document.documentElement.setAttribute('data-theme', thm);
        if (thm === 'light') {
          document.documentElement.classList.add('light-mode');
          document.body?.classList.add('light-mode');
        }
      }, token, adminUser, theme);

      try {
        console.log(`Auditing [${theme.toUpperCase()}] ${pageInfo.name} -> ${pageInfo.url}...`);
        await page.goto(pageInfo.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 1800));

        // Enforce theme on DOM if script evaluated late
        await page.evaluate((thm) => {
          document.documentElement.setAttribute('data-theme', thm);
          localStorage.setItem('litsphere_theme', thm);
          if (thm === 'light') {
            document.documentElement.classList.add('light-mode');
            document.body.classList.add('light-mode');
          } else {
            document.documentElement.classList.remove('light-mode');
            document.body.classList.remove('light-mode');
          }
        }, theme);
        await new Promise(r => setTimeout(r, 600));

        const screenshotName = `theme_audit_${pageInfo.name}_${theme}.png`;
        const screenshotPath = path.join(ARTIFACTS_DIR, screenshotName);
        await page.screenshot({ path: screenshotPath, fullPage: false });

        // Check computed styles and colors for potential contrast bugs
        const pageMetrics = await page.evaluate(() => {
          const bodyStyle = window.getComputedStyle(document.body);
          const rootAttr = document.documentElement.getAttribute('data-theme');
          const bodyBg = bodyStyle.backgroundColor;
          const bodyColor = bodyStyle.color;
          const nav = document.querySelector('nav, header, .navbar, .top-bar, .header');
          const navBg = nav ? window.getComputedStyle(nav).backgroundColor : 'none';
          
          return {
            rootAttr,
            bodyBg,
            bodyColor,
            navBg
          };
        });

        results.push({
          page: pageInfo.name,
          theme,
          metrics: pageMetrics,
          errors: consoleErrors,
          screenshot: screenshotName
        });
        console.log(`  ✓ Finished ${pageInfo.name} (${theme}): Bg=${pageMetrics.bodyBg}, Color=${pageMetrics.bodyColor}`);
      } catch (err) {
        console.error(`  ✗ Failed auditing ${pageInfo.name} (${theme}):`, err.message);
        results.push({
          page: pageInfo.name,
          theme,
          error: err.message
        });
      } finally {
        await page.close();
      }
    }
  }

  await browser.close();

  console.log('\n=== THEME AUDIT SUMMARY ===');
  console.log(JSON.stringify(results, null, 2));
})();
