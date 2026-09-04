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
    console.log('1. Setting auth in Page 1...');
    const page1 = await browser.newPage();
    await page1.setViewport({ width: 1440, height: 900 });

    await page1.goto('http://localhost:3000/auth.html', { waitUntil: 'networkidle2' });
    const authData = await page1.evaluate(async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@litsphere.ac', password: 'admin123' })
      });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('litsphere_auth_token', data.token);
        localStorage.setItem('token', data.token);
        localStorage.setItem('litsphere_user', JSON.stringify(data.user));
        localStorage.setItem('user', JSON.stringify(data.user));
      }
      return data;
    });

    console.log('2. Opening Review Page for Paper 352...');
    await page1.goto('http://localhost:3000/review.html?paper=352&project=10&cluster=142', { waitUntil: 'networkidle2' });
    await page1.waitForSelector('#dashed-columns-container .dashed-box', { timeout: 15000 });

    // Rename Notes -> Custom_Annotation_Notes
    console.log('3. Renaming "Notes" column directly in dashed box...');
    const renamedOld = "Notes";
    const renamedNew = `Custom_Notes_${Date.now()}`;

    const renameResult = await page1.evaluate((oldN, newN) => {
      const boxes = Array.from(document.querySelectorAll('#dashed-columns-container .dashed-box'));
      for (const b of boxes) {
        const col1 = b.querySelector('.dashed-col1');
        if (col1 && col1.value === oldN) {
          col1.value = newN;
          col1.dispatchEvent(new Event('input', { bubbles: true }));
          col1.dispatchEvent(new Event('blur', { bubbles: true }));
          return { found: true, oldN, newN };
        }
      }
      return { found: false };
    }, renamedOld, renamedNew);

    console.log('Rename dispatched:', renameResult);
    await new Promise(r => setTimeout(r, 1500));

    // Verify backend dynamic columns
    const backendCols = await page1.evaluate(async () => {
      const res = await fetch('/api/dynamic-columns?project_id=10&cluster_id=142', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('litsphere_auth_token')}` }
      });
      return await res.json();
    });

    const newColInBackend = backendCols.find(c => (c.column_name === renamedNew || c.name === renamedNew));
    console.log('Renamed column in backend:', newColInBackend ? newColInBackend.name : 'NOT FOUND');

    if (!newColInBackend) {
      throw new Error(`Column rename from "${renamedOld}" to "${renamedNew}" failed in backend!`);
    }

    console.log('🎉 SUCCESS: Direct column name editing verified in backend!');

    // Revert back to Notes
    console.log('4. Reverting column name back to "Notes"...');
    await page1.evaluate((oldN, newN) => {
      const boxes = Array.from(document.querySelectorAll('#dashed-columns-container .dashed-box'));
      for (const b of boxes) {
        const col1 = b.querySelector('.dashed-col1');
        if (col1 && col1.value === newN) {
          col1.value = oldN;
          col1.dispatchEvent(new Event('input', { bubbles: true }));
          col1.dispatchEvent(new Event('blur', { bubbles: true }));
          break;
        }
      }
    }, renamedOld, renamedNew);

    await new Promise(r => setTimeout(r, 1500));
    console.log('Cleaned up and reverted column name.');

  } catch (err) {
    console.error('Error during test:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
