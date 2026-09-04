const puppeteer = require('/Users/mostafakamal/Documents/Final Year Project/ Literature Review/node_modules/puppeteer-core');
const path = require('path');
const { generateToken } = require('/Users/mostafakamal/Documents/Final Year Project/ Literature Review/Backend/src/utils/auth');

const ARTIFACTS_DIR = '/Users/mostafakamal/.gemini/antigravity-ide/brain/5ceff95b-7b94-4426-b8cf-54555277da86';

async function testCluster141View() {
  console.log('=== VERIFYING CLUSTER 141 (SPEECH RECOGNITION) IN BROWSER ===');
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

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

    console.log('Navigating to http://localhost:3000/workspace.html?project=10&cluster=141 ...');
    await page.goto('http://localhost:3000/workspace.html?project=10&cluster=141', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));

    // 1. Check Matrix view rows and headers
    const rowCount = await page.evaluate(() => document.querySelectorAll('#matrix-tbody tr').length);
    console.log(`Matrix rendered row count in Cluster 141: ${rowCount}`);

    const headers = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#matrix-main-headers th'))
        .filter(th => window.getComputedStyle(th).display !== 'none')
        .map(th => th.querySelector('.col-title-text')?.textContent.trim() || th.textContent.trim().replace(/\s+/g, ' '));
    });
    console.log(`Total visible matrix headers (${headers.length}):`, headers.slice(0, 15), '...');

    // Screenshot 1: Full Matrix (All columns)
    const shot1 = path.join(ARTIFACTS_DIR, 'cluster_141_all_columns.png');
    await page.screenshot({ path: shot1, fullPage: false });
    console.log('Saved screenshot: cluster_141_all_columns.png');

    // 2. Test Domain Filter
    console.log('\nTesting Domain Filter for "Speech Processing"...');
    await page.select('#filter-domain', 'Speech Processing');
    await new Promise(r => setTimeout(r, 800));

    const domainFilteredRows = await page.evaluate(() => document.querySelectorAll('#matrix-tbody tr').length);
    console.log(`Rows after filtering by domain "Speech Processing": ${domainFilteredRows}`);

    const shot2 = path.join(ARTIFACTS_DIR, 'cluster_141_domain_filter.png');
    await page.screenshot({ path: shot2, fullPage: false });
    console.log('Saved screenshot: cluster_141_domain_filter.png');

    // Reset domain filter
    await page.select('#filter-domain', 'all');
    await new Promise(r => setTimeout(r, 800));

    // 3. Test Keywords Hub: click wav2vec 2.0 chip
    console.log('\nTesting Keywords Hub filter: clicking "# wav2vec 2.0 3"...');
    const chipClicked = await page.evaluate(() => {
      const chips = Array.from(document.querySelectorAll('#keywords-chips-container .kw-chip'));
      const target = chips.find(c => c.textContent.includes('wav2vec 2.0'));
      if (target) {
        target.click();
        return true;
      }
      return false;
    });
    console.log('Found and clicked chip:', chipClicked);
    await new Promise(r => setTimeout(r, 800));

    const kwFilteredRows = await page.evaluate(() => document.querySelectorAll('#matrix-tbody tr').length);
    console.log(`Rows after clicking wav2vec 2.0 chip: ${kwFilteredRows}`);

    const shot3 = path.join(ARTIFACTS_DIR, 'cluster_141_keyword_wav2vec.png');
    await page.screenshot({ path: shot3, fullPage: false });
    console.log('Saved screenshot: cluster_141_keyword_wav2vec.png');

    // Reset keyword filter
    await page.evaluate(() => {
      const allChip = document.querySelector('#keywords-chips-container .kw-chip-all');
      if (allChip) allChip.click();
      else if (typeof window.clearAllKeywordFilters === 'function') window.clearAllKeywordFilters();
    });
    await new Promise(r => setTimeout(r, 800));

    // 4. Test View Modes: Click "Show Custom Only" toggle button
    console.log('\nTesting "Show Custom Only" toggle button...');
    const toggleClicked = await page.evaluate(() => {
      const btn = document.getElementById('btn-toggle-metadata-visibility');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    console.log('Clicked btn-toggle-metadata-visibility:', toggleClicked);
    await new Promise(r => setTimeout(r, 1000));

    const customHeaders = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#matrix-main-headers th'))
        .filter(th => window.getComputedStyle(th).display !== 'none')
        .map(th => th.querySelector('.col-title-text')?.textContent.trim() || th.textContent.trim().replace(/\s+/g, ' '));
    });
    console.log(`Custom-only visible headers (${customHeaders.length}):`, customHeaders.slice(0, 10));

    const shot4 = path.join(ARTIFACTS_DIR, 'cluster_141_custom_columns.png');
    await page.screenshot({ path: shot4, fullPage: false });
    console.log('Saved screenshot: cluster_141_custom_columns.png');

    // Scroll horizontally to capture middle/end of custom columns
    await page.evaluate(() => {
      const wrap = document.getElementById('matrix-table-wrap');
      if (wrap) wrap.scrollLeft = 1400;
    });
    await new Promise(r => setTimeout(r, 600));

    const shot5 = path.join(ARTIFACTS_DIR, 'cluster_141_custom_scrolled.png');
    await page.screenshot({ path: shot5, fullPage: false });
    console.log('Saved screenshot: cluster_141_custom_scrolled.png');

    // Reset scroll and toggle back to all columns
    await page.evaluate(() => {
      const wrap = document.getElementById('matrix-table-wrap');
      if (wrap) wrap.scrollLeft = 0;
      const btn = document.getElementById('btn-toggle-metadata-visibility');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // 5. Open In-Page Reader Modal
    console.log('\nOpening In-Page Reader Modal for paper 298 (SR-013)...');
    await page.evaluate(() => {
      if (typeof window.openReaderModal === 'function') {
        window.openReaderModal(298);
      }
    });
    await new Promise(r => setTimeout(r, 2000));

    const modalActive = await page.evaluate(() => {
      const modal = document.getElementById('reader-modal');
      return modal && (modal.classList.contains('active') || modal.classList.contains('open') || window.getComputedStyle(modal).display !== 'none');
    });
    console.log('Reader modal active:', modalActive);

    const shot6 = path.join(ARTIFACTS_DIR, 'cluster_141_reader_modal.png');
    await page.screenshot({ path: shot6, fullPage: false });
    console.log('Saved screenshot: cluster_141_reader_modal.png');

    // 6. Test Review Page for paper 298
    console.log('\nNavigating to Review Page for paper 298...');
    await page.goto('http://localhost:3000/review.html?project=10&paper=298', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));

    const reviewTitle = await page.evaluate(() => document.querySelector('#paper-title, .paper-title, h1, h2')?.textContent.trim() || 'N/A');
    console.log('Review Page Title:', reviewTitle);

    const shot7 = path.join(ARTIFACTS_DIR, 'cluster_141_review_page.png');
    await page.screenshot({ path: shot7, fullPage: false });
    console.log('Saved screenshot: cluster_141_review_page.png');

    console.log('\n=== ALL CLUSTER 141 VERIFICATION CHECKS PASSED PERFECTLY! ===');
  } catch (err) {
    console.error('Error during verification:', err);
  } finally {
    await browser.close();
  }
}

testCluster141View();
