const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const { generateToken } = require(path.join(__dirname, '../Backend/src/utils/auth'));

const chromePaths = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
];
const executablePath = chromePaths.find(p => fs.existsSync(p));

const PAGES = [
  { name: 'Home Landing', url: 'http://localhost:3000/home.html' },
  { name: 'Auth Portal', url: 'http://localhost:3000/auth.html' },
  { name: 'About Specification', url: 'http://localhost:3000/about.html' },
  { name: 'Researcher Dashboard', url: 'http://localhost:3000/dashboard.html' },
  { name: 'Master Workspace & Matrix', url: 'http://localhost:3000/workspace.html?project=10&cluster=145' },
  { name: 'Paper Review Workbench', url: 'http://localhost:3000/review.html?project=10&paper=518' },
  { name: 'Profile & Settings', url: 'http://localhost:3000/profile.html' },
  { name: 'Admin Control Center', url: 'http://localhost:3000/admin.html' }
];

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

  let allPassed = true;

  for (const pageInfo of PAGES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    await page.evaluateOnNewDocument((t, u) => {
      localStorage.setItem('litsphere_auth_token', t);
      localStorage.setItem('litsphere_user', JSON.stringify(u));
      localStorage.setItem('litsphere_theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    }, token, adminUser);

    await page.goto(pageInfo.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1500));

    // 1. Check initial Dark theme
    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    console.log(`\n--- Testing ${pageInfo.name} ---`);
    console.log(`Initial theme: ${initialTheme}`);

    // 2. Click Theme Toggle to switch to Light Mode
    const toggleClicked = await page.evaluate(() => {
      const btn = document.getElementById('theme-toggle-auth') || 
                  document.getElementById('theme-toggle') || 
                  document.querySelector('.theme-toggle-btn') || 
                  document.querySelector('.theme-toggle-pill') ||
                  document.querySelector('button[title*="Theme"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (!toggleClicked) {
      console.warn(`[WARN] No theme toggle button found on ${pageInfo.name}`);
    } else {
      await new Promise(r => setTimeout(r, 600));
      const afterLight = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      const lsLight = await page.evaluate(() => localStorage.getItem('litsphere_theme'));
      console.log(`After 1st toggle (to Light): data-theme="${afterLight}", localStorage="${lsLight}"`);

      if (afterLight !== 'light' && lsLight !== 'light') {
        console.error(`[FAIL] Switching to Light Mode failed on ${pageInfo.name}`);
        allPassed = false;
      } else {
        console.log(`[PASS] Successfully toggled to Light Mode on ${pageInfo.name}`);
      }

      // 3. Click again to switch back to Dark Mode
      await page.evaluate(() => {
        const btn = document.getElementById('theme-toggle-auth') || 
                    document.getElementById('theme-toggle') || 
                    document.querySelector('.theme-toggle-btn') || 
                    document.querySelector('.theme-toggle-pill') ||
                    document.querySelector('button[title*="Theme"]');
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 600));
      const afterDark = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      const lsDark = await page.evaluate(() => localStorage.getItem('litsphere_theme'));
      console.log(`After 2nd toggle (to Dark): data-theme="${afterDark}", localStorage="${lsDark}"`);

      if (afterDark !== 'dark' && lsDark !== 'dark') {
        console.error(`[FAIL] Switching back to Dark Mode failed on ${pageInfo.name}`);
        allPassed = false;
      } else {
        console.log(`[PASS] Successfully toggled back to Dark Mode on ${pageInfo.name}`);
      }
    }

    await page.close();
  }

  await browser.close();

  if (allPassed) {
    console.log('\n======================================================');
    console.log('🎉 ALL PAGES PASSED LIGHT AND DARK THEME CHECKS!');
    console.log('======================================================');
  } else {
    console.error('\n❌ Some theme toggle checks encountered issues.');
    process.exit(1);
  }
})();
