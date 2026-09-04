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

    console.log('2. Opening Review Page in Page 1...');
    await page1.goto('http://localhost:3000/review.html?paper=352&project=10&cluster=142', { waitUntil: 'networkidle2' });
    await page1.waitForSelector('#dashed-columns-container .dashed-box', { timeout: 15000 });

    // Test 1: Add a new column using "+ Add new"
    console.log('3. Clicking "+ Add new" column button...');
    await page1.evaluate(() => {
      const addBtn = Array.from(document.querySelectorAll('.action-btn')).find(b => b.textContent.includes('Add new'));
      if (addBtn) addBtn.click();
      else if (typeof window.handleAddColumn === 'function') window.handleAddColumn();
    });

    await new Promise(r => setTimeout(r, 600));

    // Get the newly added column box
    const customColName = `Extraction_Metric_${Date.now()}`;
    const customColVal = `Extracted_Value_Test_${Date.now()}`;
    console.log(`4. Renaming new column to "${customColName}" and setting value to "${customColVal}"...`);

    await page1.evaluate((colName, colVal) => {
      const boxes = Array.from(document.querySelectorAll('#dashed-columns-container .dashed-box'));
      const lastBox = boxes[boxes.length - 1];
      const col1 = lastBox.querySelector('.dashed-col1');
      const col2 = lastBox.querySelector('.dashed-col2');

      col1.value = colName;
      col1.dispatchEvent(new Event('input', { bubbles: true }));
      col1.dispatchEvent(new Event('blur', { bubbles: true }));

      col2.value = colVal;
      col2.dispatchEvent(new Event('input', { bubbles: true }));
    }, customColName, customColVal);

    // Save
    console.log('5. Clicking Save...');
    await page1.evaluate(() => {
      const saveBtn = document.querySelector('#section-columns .section-save-btn');
      if (saveBtn) saveBtn.click();
    });

    await new Promise(r => setTimeout(r, 1500));

    // Verify backend dynamic columns
    console.log('6. Verifying renamed column in Backend API...');
    const backendCols = await page1.evaluate(async () => {
      const res = await fetch('/api/dynamic-columns?project_id=10&cluster_id=142', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('litsphere_auth_token')}` }
      });
      return await res.json();
    });

    const foundInBackend = backendCols.find(c => (c.column_name === customColName || c.name === customColName));
    console.log('Column found in Backend API:', foundInBackend ? foundInBackend.name : 'NOT FOUND');
    if (!foundInBackend) {
      throw new Error(`Failed to find renamed column "${customColName}" in backend dynamic columns!`);
    }

    // Check workspace matrix table
    console.log('7. Opening Workspace (Page 2) and verifying column in Matrix table...');
    const page2 = await browser.newPage();
    await page2.setViewport({ width: 1440, height: 900 });

    await page2.goto('http://localhost:3000/auth.html', { waitUntil: 'networkidle2' });
    await page2.evaluate((token, user) => {
      localStorage.setItem('litsphere_auth_token', token);
      localStorage.setItem('token', token);
      localStorage.setItem('litsphere_user', JSON.stringify(user));
      localStorage.setItem('user', JSON.stringify(user));
    }, authData.token, authData.user);

    await page2.goto('http://localhost:3000/workspace?project=10&cluster=142', { waitUntil: 'networkidle2' });
    await page2.waitForSelector('#matrix-thead th', { timeout: 15000 });

    const matrixHeaders = await page2.evaluate(() => {
      const ths = Array.from(document.querySelectorAll('#matrix-thead th'));
      return ths.map(th => th.getAttribute('data-col-name') || th.textContent.trim());
    });

    console.log('Matrix headers in Workspace:', matrixHeaders.slice(-5));
    const headerFound = matrixHeaders.some(h => h && h.toLowerCase().includes(customColName.toLowerCase()));
    if (headerFound) {
      console.log(`🎉 SUCCESS: Custom renamed column "${customColName}" rendered in Workspace Matrix header!`);
    } else {
      console.warn('Notice: Re-fetching on Page 2...');
      await page2.evaluate(async () => {
        if (typeof window.loadDynamicColumns === 'function') await window.loadDynamicColumns();
      });
      await new Promise(r => setTimeout(r, 1000));
      const headersAfter = await page2.evaluate(() => {
        const ths = Array.from(document.querySelectorAll('#matrix-thead th'));
        return ths.map(th => th.getAttribute('data-col-name') || th.textContent.trim());
      });
      console.log('Headers after reload:', headersAfter.slice(-5));
      if (!headersAfter.some(h => h && h.toLowerCase().includes(customColName.toLowerCase()))) {
        throw new Error(`Column "${customColName}" not found in matrix headers!`);
      }
      console.log(`🎉 SUCCESS: Custom column verified in Matrix table!`);
    }

    // Test 2: Delete column using ✕ button on Review page
    console.log('8. Testing column deletion from Review page...');
    page1.on('dialog', async dialog => {
      console.log('Dialog prompt:', dialog.message());
      await dialog.accept();
    });

    await page1.evaluate((colNameToDel) => {
      const boxes = Array.from(document.querySelectorAll('#dashed-columns-container .dashed-box'));
      for (let i = 0; i < boxes.length; i++) {
        const c1 = boxes[i].querySelector('.dashed-col1');
        if (c1 && c1.value === colNameToDel) {
          const delBtn = boxes[i].querySelector('.dashed-col-del-btn');
          if (delBtn) delBtn.click();
          break;
        }
      }
    }, customColName);

    await new Promise(r => setTimeout(r, 1500));

    // Verify deleted
    const backendColsAfterDel = await page1.evaluate(async () => {
      const res = await fetch('/api/dynamic-columns?project_id=10&cluster_id=142', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('litsphere_auth_token')}` }
      });
      return await res.json();
    });

    const stillExists = backendColsAfterDel.some(c => (c.column_name === customColName || c.name === customColName));
    console.log('Column still in backend after delete?', stillExists ? 'YES (Error)' : 'NO (Successfully deleted)');
    if (stillExists) {
      throw new Error(`Column "${customColName}" was not deleted from backend!`);
    }
    console.log('🎉 SUCCESS: Column deletion and full lifecycle verified!');

  } catch (err) {
    console.error('Error during test:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
