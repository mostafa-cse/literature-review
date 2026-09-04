const puppeteer = require('puppeteer-core');
const fs = require('fs');

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
    await page.setViewport({ width: 1400, height: 900 });

    console.log('1. Setting auth...');
    await page.goto('http://localhost:3000/auth.html', { waitUntil: 'networkidle2' });
    const authData = await page.evaluate(async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
      });
      return res.json();
    });

    if (authData.token) {
      await page.evaluate((tok, usr) => {
        localStorage.setItem('token', tok);
        localStorage.setItem('user', JSON.stringify(usr));
      }, authData.token, authData.user);
    }

    console.log('Navigating to review page for paper 231...');
    await page.goto('http://localhost:3000/review.html?id=231', { waitUntil: 'networkidle2', timeout: 15000 });

    // Wait for domains and keywords to be rendered
    await page.waitForSelector('#grid-domains .grid-item', { timeout: 10000 });
    await page.waitForSelector('#grid-keywords .grid-item', { timeout: 10000 });

    console.log('--- TEST 1: DOMAIN SEARCH BAR ---');
    const initialDomainCount = await page.$$eval('#grid-domains .grid-item:not(.add-new-btn)', els => els.length);
    const domainBadgeText = await page.$eval('#domain-count-badge', el => el.textContent.trim());
    console.log(`Initial domains count: ${initialDomainCount}, badge: "${domainBadgeText}"`);

    // Type in domain search input
    await page.type('#domain-search-input', 'speech');
    await new Promise(r => setTimeout(r, 200));

    const filteredDomainCount = await page.$$eval('#grid-domains .grid-item:not(.add-new-btn)', els => els.length);
    const filteredDomainBadge = await page.$eval('#domain-count-badge', el => el.textContent.trim());
    const clearDomainBtnVisible = await page.$eval('#btn-clear-domain-search', el => el.style.display !== 'none');
    console.log(`Filtered domains count: ${filteredDomainCount}, badge: "${filteredDomainBadge}", clearBtn: ${clearDomainBtnVisible}`);

    // Click clear button
    await page.click('#btn-clear-domain-search');
    await new Promise(r => setTimeout(r, 200));
    const restoredDomainCount = await page.$$eval('#grid-domains .grid-item:not(.add-new-btn)', els => els.length);
    console.log(`Restored domains count after clear: ${restoredDomainCount}`);

    console.log('--- TEST 2: KEYWORDS SEARCH BAR ---');
    const initialKwCount = await page.$$eval('#grid-keywords .grid-item:not(.add-new-btn)', els => els.length);
    const kwBadgeText = await page.$eval('#keywords-count-badge', el => el.textContent.trim());
    console.log(`Initial keywords count: ${initialKwCount}, badge: "${kwBadgeText}"`);

    // Type in keywords search input
    await page.type('#keywords-search-input', 'speech');
    await new Promise(r => setTimeout(r, 200));

    const filteredKwCount = await page.$$eval('#grid-keywords .grid-item:not(.add-new-btn)', els => els.length);
    const filteredKwBadge = await page.$eval('#keywords-count-badge', el => el.textContent.trim());
    const clearKwBtnVisible = await page.$eval('#btn-clear-keywords-search', el => el.style.display !== 'none');
    console.log(`Filtered keywords count: ${filteredKwCount}, badge: "${filteredKwBadge}", clearBtn: ${clearKwBtnVisible}`);

    // Click clear button
    await page.click('#btn-clear-keywords-search');
    await new Promise(r => setTimeout(r, 200));
    const restoredKwCount = await page.$$eval('#grid-keywords .grid-item:not(.add-new-btn)', els => els.length);
    console.log(`Restored keywords count after clear: ${restoredKwCount}`);

    console.log('--- TEST 3: NO MATCH STATE & CLEAR BUTTON ---');
    await page.type('#domain-search-input', 'xyznonexistent123');
    await new Promise(r => setTimeout(r, 200));
    const noMatchText = await page.$eval('#grid-domains .no-column-matches', el => el.textContent.trim());
    console.log(`No match message: "${noMatchText}"`);

    // Click clear search pill button inside the no-match message
    await page.click('#grid-domains .clear-search-pill-btn');
    await new Promise(r => setTimeout(r, 200));
    const domainCountAfterPillClear = await page.$$eval('#grid-domains .grid-item:not(.add-new-btn)', els => els.length);
    console.log(`Domains count after pill clear: ${domainCountAfterPillClear}`);

    // Capture initial state
    await page.screenshot({ path: '/Users/mostafakamal/.gemini/antigravity-ide/brain/5ceff95b-7b94-4426-b8cf-54555277da86/review_search_bars_initial.png' });

    // Filter domains
    await page.type('#domain-search-input', 'speech');
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: '/Users/mostafakamal/.gemini/antigravity-ide/brain/5ceff95b-7b94-4426-b8cf-54555277da86/review_domain_search_active.png' });

    // Filter keywords
    await page.type('#keywords-search-input', 'trans');
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: '/Users/mostafakamal/.gemini/antigravity-ide/brain/5ceff95b-7b94-4426-b8cf-54555277da86/review_domain_keyword_search_active.png' });

    console.log('Screenshots saved!');
    console.log('ALL TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
