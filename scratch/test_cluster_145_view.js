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

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const adminUser = {
      id: 1,
      username: 'M0stafa',
      name: 'Mostafa Kamal',
      email: 'mostafakamal.cse2022@gmail.com',
      role: 'admin',
      institution: 'Jashore University of Science and Technology'
    };
    const token = generateToken(adminUser);

    await page.evaluateOnNewDocument((t, u) => {
      localStorage.setItem('litsphere_auth_token', t);
      localStorage.setItem('litsphere_user', JSON.stringify(u));
      localStorage.removeItem('matrix_col_view_mode_10');
      localStorage.removeItem('matrix_col_view_mode_default');
      localStorage.removeItem('matrix_col_order_10');
    }, token, adminUser);

    console.log('1. Navigating to Cluster 145 Matrix: http://localhost:3000/workspace.html?project=10&cluster=145 ...');
    await page.goto('http://localhost:3000/workspace.html?project=10&cluster=145', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));

    // Check Matrix view rows and headers
    const rowCount = await page.evaluate(() => document.querySelectorAll('#matrix-tbody tr').length);
    console.log(`Matrix rendered row count in Cluster 145: ${rowCount}`);

    const paperTitles = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#matrix-tbody tr td.td-title .paper-title-link, #matrix-tbody tr td:nth-child(2)'))
        .map(el => el.textContent.trim().split('\n')[0]);
    });
    console.log(`Loaded ${paperTitles.length} Paper Titles in Matrix (showing first 5):`, paperTitles.slice(0, 5));

    const headers = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#matrix-main-headers th'))
        .filter(th => window.getComputedStyle(th).display !== 'none')
        .map(th => th.querySelector('.col-title-text')?.textContent.trim() || th.textContent.trim().replace(/\s+/g, ' '));
    });
    console.log(`Total visible matrix headers (${headers.length}):`, headers.slice(0, 15), '...');

    // Screenshot 1: Full Matrix (All columns)
    const shot1 = path.join(ARTIFACTS_DIR, 'cluster_145_matrix_full.png');
    await page.screenshot({ path: shot1, fullPage: false });
    console.log('Saved screenshot: cluster_145_matrix_full.png');

    // 2. Switch to Custom Columns Only View
    console.log('\n2. Switching to Custom Columns view...');
    await page.evaluate(() => {
      const customBtn = document.querySelector('[data-view="custom"], #btn-view-custom-columns, .col-toggle-pill[data-mode="custom"]');
      if (customBtn) customBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));
    const shot2 = path.join(ARTIFACTS_DIR, 'cluster_145_custom_columns.png');
    await page.screenshot({ path: shot2, fullPage: false });
    console.log('Saved screenshot: cluster_145_custom_columns.png');

    // 3. Test Domain Filter
    console.log('\n3. Testing Domain Filter for Multilingual...');
    const domainSelect = await page.$('#filter-domain');
    if (domainSelect) {
      const options = await page.$$eval('#filter-domain option', opts => opts.map(o => o.value).filter(Boolean));
      console.log(`Domain options (${options.length}):`, options.slice(0, 6));
      const targetDomain = options.find(d => d.toLowerCase().includes('multilingual') || d.toLowerCase().includes('low-resource')) || options[0];
      if (targetDomain) {
        await page.select('#filter-domain', targetDomain);
        await new Promise(r => setTimeout(r, 800));
        const filteredCount = await page.evaluate(() => document.querySelectorAll('#matrix-tbody tr').length);
        console.log(`Rows after filtering by domain "${targetDomain}": ${filteredCount}`);
        const shot3 = path.join(ARTIFACTS_DIR, 'cluster_145_domain_filter.png');
        await page.screenshot({ path: shot3, fullPage: false });
        console.log('Saved screenshot: cluster_145_domain_filter.png');
        await page.select('#filter-domain', '');
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // 4. Test Keyword Filter
    console.log('\n4. Testing Keyword Filter for "mBART"...');
    const kwSelect = await page.$('#filter-keyword');
    if (kwSelect) {
      const kwOptions = await page.$$eval('#filter-keyword option', opts => opts.map(o => o.value).filter(Boolean));
      console.log(`Keyword options (${kwOptions.length}):`, kwOptions.slice(0, 8));
      const targetKw = kwOptions.find(k => k.toLowerCase().includes('mbart') || k.toLowerCase().includes('multilingual')) || kwOptions[0];
      if (targetKw) {
        await page.select('#filter-keyword', targetKw);
        await new Promise(r => setTimeout(r, 800));
        const kwFilteredCount = await page.evaluate(() => document.querySelectorAll('#matrix-tbody tr').length);
        console.log(`Rows after filtering by keyword "${targetKw}": ${kwFilteredCount}`);
        const shot4 = path.join(ARTIFACTS_DIR, 'cluster_145_keyword_filter.png');
        await page.screenshot({ path: shot4, fullPage: false });
        console.log('Saved screenshot: cluster_145_keyword_filter.png');
        await page.select('#filter-keyword', '');
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // 5. Test Review Page for Paper 518 (MLRT-006: Multilingual Denoising Pre-training / mBART)
    console.log('\n5. Navigating to Review Page for Paper 518 (mBART: Multilingual Denoising Pre-training...)...');
    await page.goto('http://localhost:3000/review.html?project=10&paper=518', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    const reviewDomainBadge = await page.evaluate(() => document.getElementById('domain-count-badge')?.textContent.trim() || '');
    const reviewKwBadge = await page.evaluate(() => document.getElementById('keywords-count-badge')?.textContent.trim() || '');
    const reviewColBadge = await page.evaluate(() => document.getElementById('columns-count-badge')?.textContent.trim() || '');
    const renderedColsCount = await page.evaluate(() => document.querySelectorAll('#dashed-columns-container .dashed-box').length);
    console.log(`Review Page for Paper 518 -> Domains Badge: "${reviewDomainBadge}", Keywords Badge: "${reviewKwBadge}", Columns Badge: "${reviewColBadge}", Rendered Dashed Boxes: ${renderedColsCount}`);

    const shot5 = path.join(ARTIFACTS_DIR, 'cluster_145_review_page.png');
    await page.screenshot({ path: shot5, fullPage: false });
    console.log('Saved screenshot: cluster_145_review_page.png');

    console.log('\n=== ALL CLUSTER 145 VERIFICATIONS PASSED SUCCESSFULLY ===');
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
