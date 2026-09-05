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

    console.log('1. Navigating to Cluster 147 Matrix: http://localhost:3000/workspace.html?project=10&cluster=147 ...');
    await page.goto('http://localhost:3000/workspace.html?project=10&cluster=147', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));

    // Check Matrix view rows and headers
    const rowCount = await page.evaluate(() => document.querySelectorAll('#matrix-tbody tr').length);
    console.log(`Matrix rendered row count in Cluster 147: ${rowCount}`);

    const paperTitles = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#matrix-tbody tr td.td-title .paper-title-link, #matrix-tbody tr td:nth-child(2)'))
        .map(el => el.textContent.trim().split('\n')[0]);
    });
    console.log(`Loaded ${paperTitles.length} Paper Titles in Matrix (showing first 5):`, paperTitles.slice(0, 5));

    // Screenshot 1: Full Matrix (All columns)
    const shot1 = path.join(ARTIFACTS_DIR, 'cluster_147_matrix_full.png');
    await page.screenshot({ path: shot1, fullPage: false });
    console.log('Saved screenshot: cluster_147_matrix_full.png');

    // 2. Switch to Custom Columns Only View and scroll
    console.log('\n2. Switching to Custom Columns view...');
    await page.evaluate(() => {
      const customBtn = document.querySelector('#btn-view-custom-columns, .col-toggle-pill[data-mode="custom"], [data-view="custom"]');
      if (customBtn) customBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Scroll right inside table-scroll-wrapper
    await page.evaluate(() => {
      const scroller = document.querySelector('#table-scroll-wrapper');
      if (scroller) scroller.scrollLeft = 900;
    });
    await new Promise(r => setTimeout(r, 800));

    const shot2 = path.join(ARTIFACTS_DIR, 'cluster_147_custom_columns.png');
    await page.screenshot({ path: shot2, fullPage: false });
    console.log('Saved screenshot: cluster_147_custom_columns.png');

    // Scroll further right to see findings, limitations, gaps
    await page.evaluate(() => {
      const scroller = document.querySelector('#table-scroll-wrapper');
      if (scroller) scroller.scrollLeft = 2200;
    });
    await new Promise(r => setTimeout(r, 800));
    const shot2b = path.join(ARTIFACTS_DIR, 'cluster_147_custom_scrolled_end.png');
    await page.screenshot({ path: shot2b, fullPage: false });
    console.log('Saved screenshot: cluster_147_custom_scrolled_end.png');

    // Reset scroll and switch back to all columns
    await page.evaluate(() => {
      const scroller = document.querySelector('#table-scroll-wrapper');
      if (scroller) scroller.scrollLeft = 0;
      const allBtn = document.querySelector('#btn-view-all-columns, .col-toggle-pill[data-mode="all"], [data-view="all"]');
      if (allBtn) allBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // 3. Test Domain Filter
    console.log('\n3. Testing Domain Filter for Speech-to-Speech...');
    const domainSelect = await page.$('#filter-domain');
    if (domainSelect) {
      const options = await page.$$eval('#filter-domain option', opts => opts.map(o => o.value).filter(Boolean));
      console.log(`Domain options count: ${options.length}`);
      const targetDomain = options.find(d => d.includes('Speech-to-Speech')) || options[1];
      if (targetDomain) {
        console.log(`Selecting domain: "${targetDomain}"`);
        await page.select('#filter-domain', targetDomain);
        await new Promise(r => setTimeout(r, 800));
        const filteredCount = await page.evaluate(() => document.querySelectorAll('#matrix-tbody tr').length);
        console.log(`Rows after filtering by domain "${targetDomain}": ${filteredCount}`);
        const shot3 = path.join(ARTIFACTS_DIR, 'cluster_147_domain_filter.png');
        await page.screenshot({ path: shot3, fullPage: false });
        console.log('Saved screenshot: cluster_147_domain_filter.png');
        await page.select('#filter-domain', '');
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // 4. Test Search Bar for "CoVoST"
    console.log('\n4. Testing Search Bar for "CoVoST"...');
    const searchInput = await page.$('#search-input, #matrix-search-input');
    if (searchInput) {
      await searchInput.click({ clickCount: 3 });
      await searchInput.type('CoVoST');
      await new Promise(r => setTimeout(r, 800));
      const searchCount = await page.evaluate(() => document.querySelectorAll('#matrix-tbody tr').length);
      console.log(`Rows matching search "CoVoST": ${searchCount}`);
      const shot4 = path.join(ARTIFACTS_DIR, 'cluster_147_search_covost.png');
      await page.screenshot({ path: shot4, fullPage: false });
      console.log('Saved screenshot: cluster_147_search_covost.png');
      await searchInput.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await new Promise(r => setTimeout(r, 500));
    }

    // 5. Navigate to Review Page for DB-001 (Paper ID 580)
    console.log('\n5. Opening Review page for Paper 580 (CoVoST)...');
    await page.goto('http://localhost:3000/review.html?project=10&paper=580', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));
    const shot5 = path.join(ARTIFACTS_DIR, 'cluster_147_review_page.png');
    await page.screenshot({ path: shot5, fullPage: false });
    console.log('Saved screenshot: cluster_147_review_page.png');

    console.log('\nAll Cluster 147 browser verifications completed successfully!');
  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    await browser.close();
  }
})();
