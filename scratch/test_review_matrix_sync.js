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

    console.log('Login result:', authData.user ? authData.user.email : 'Failed');

    console.log('2. Navigating to Cluster 142 Matrix Table in Workspace (Page 1)...');
    await page1.goto('http://localhost:3000/workspace?project=10&cluster=142', { waitUntil: 'networkidle2' });
    await page1.waitForSelector('#matrix-tbody tr', { timeout: 15000 });

    // Find paper rows
    const papersInfo = await page1.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#matrix-tbody tr'));
      return rows.map(r => {
        const titleCell = r.querySelector('.col-title, .td-title');
        const idCell = r.querySelector('.col-paper-id, .col-id');
        return {
          paperId: r.getAttribute('data-paper-id') || (idCell ? idCell.textContent.trim() : ''),
          title: titleCell ? titleCell.textContent.trim() : ''
        };
      });
    });
    console.log(`Workspace loaded ${papersInfo.length} papers in Cluster 142. First paper:`, papersInfo[0]);

    const targetPaperId = papersInfo[0].paperId;

    console.log('3. Opening Review page for Paper in Page 2...');
    const page2 = await browser.newPage();
    await page2.setViewport({ width: 1440, height: 900 });

    await page2.goto('http://localhost:3000/auth.html', { waitUntil: 'networkidle2' });
    await page2.evaluate((token, user) => {
      localStorage.setItem('litsphere_auth_token', token);
      localStorage.setItem('token', token);
      localStorage.setItem('litsphere_user', JSON.stringify(user));
      localStorage.setItem('user', JSON.stringify(user));
    }, authData.token, authData.user);

    await page2.goto(`http://localhost:3000/review.html?paper=${targetPaperId}&project=10&cluster=142`, { waitUntil: 'networkidle2' });
    await page2.waitForSelector('#dashed-columns-container .dashed-box', { timeout: 15000 });

    // Target a specific column, e.g. "Research Area" or "Survey Type"
    const targetColName = "Research Area";
    const testValue = `Speech_Synthesis_Review_${Date.now()}`;
    console.log(`4. Changing "${targetColName}" value on review page to: "${testValue}"...`);

    const colChanged = await page2.evaluate((colToFind, testVal) => {
      const boxes = Array.from(document.querySelectorAll('#dashed-columns-container .dashed-box'));
      for (const b of boxes) {
        const c1 = b.querySelector('.dashed-col1');
        const c2 = b.querySelector('.dashed-col2');
        if (c1 && c1.value.toLowerCase().includes(colToFind.toLowerCase())) {
          c2.value = testVal;
          c2.dispatchEvent(new Event('input', { bubbles: true }));
          return { found: true, colName: c1.value, newVal: testVal };
        }
      }
      // If not found by name, change second box
      if (boxes.length > 1) {
        const c1 = boxes[1].querySelector('.dashed-col1');
        const c2 = boxes[1].querySelector('.dashed-col2');
        c2.value = testVal;
        c2.dispatchEvent(new Event('input', { bubbles: true }));
        return { found: true, colName: c1.value, newVal: testVal };
      }
      return { found: false };
    }, targetColName, testValue);

    console.log('Column modified on Review page:', colChanged);

    console.log('5. Triggering direct Save on Review page...');
    await page2.evaluate(() => {
      const saveBtn = document.querySelector('#section-columns .section-save-btn');
      if (saveBtn) saveBtn.click();
      else if (typeof window.triggerAutoSave === 'function') window.triggerAutoSave(true);
    });

    // Wait 1.5 seconds for save and broadcast
    await new Promise(r => setTimeout(r, 1500));

    console.log('6. Checking if Workspace Page 1 reflects the new column value...');
    const page1Value = await page1.evaluate((colName, pId) => {
      const rows = Array.from(document.querySelectorAll('#matrix-tbody tr'));
      const targetRow = rows.find(r => r.getAttribute('data-paper-id') === String(pId)) || rows[0];
      if (!targetRow) return { found: false };

      const cells = Array.from(targetRow.querySelectorAll('td'));
      for (const td of cells) {
        const cName = td.getAttribute('data-col-name');
        const rawVal = td.getAttribute('data-raw-val') || td.textContent || '';
        if (cName && colName && (cName === colName || cName.toLowerCase() === colName.toLowerCase())) {
          return {
            found: true,
            colName: cName,
            rawVal: rawVal,
            cellText: td.textContent.trim()
          };
        }
      }
      return { found: false, checkedCells: cells.map(c => c.getAttribute('data-col-name')).filter(Boolean) };
    }, colChanged.colName, targetPaperId);

    console.log('Page 1 (Workspace) cell state:', page1Value);

    if (page1Value.found && (page1Value.rawVal.includes(testValue) || page1Value.cellText.includes(testValue))) {
      console.log('🎉 SUCCESS: Live sync verified! Cluster matrix updated immediately without page reload.');
    } else {
      console.log('Notice: Re-fetching on Page 1 to verify server state...');
      await page1.evaluate(async () => {
        if (typeof window.loadPapers === 'function') await window.loadPapers();
      });
      await new Promise(r => setTimeout(r, 1000));
      const page1ValueAfterLoad = await page1.evaluate((colName, pId) => {
        const rows = Array.from(document.querySelectorAll('#matrix-tbody tr'));
        const targetRow = rows.find(r => r.getAttribute('data-paper-id') === String(pId)) || rows[0];
        if (!targetRow) return { found: false };

        const cells = Array.from(targetRow.querySelectorAll('td'));
        for (const td of cells) {
          const cName = td.getAttribute('data-col-name');
          const rawVal = td.getAttribute('data-raw-val') || td.textContent || '';
          if (cName && colName && (cName === colName || cName.toLowerCase() === colName.toLowerCase())) {
            return {
              found: true,
              colName: cName,
              rawVal: rawVal,
              cellText: td.textContent.trim()
            };
          }
        }
        return { found: false };
      }, colChanged.colName, targetPaperId);
      console.log('Page 1 after loadPapers:', page1ValueAfterLoad);
      if (page1ValueAfterLoad.found && (page1ValueAfterLoad.rawVal.includes(testValue) || page1ValueAfterLoad.cellText.includes(testValue))) {
        console.log('🎉 SUCCESS: Server-side persistence verified! Matrix updated with new review value.');
      } else {
        throw new Error(`Sync test failed: Expected "${testValue}" in column "${colChanged.colName}", but found "${page1ValueAfterLoad.rawVal}"`);
      }
    }

    // Now test editing "Evaluation Metrics" column value
    console.log('7. Testing "Evaluation Metrics" review page update & live sync...');
    const testMetric = `BLEU_Sync_${Date.now()}`;
    await page2.evaluate((metricVal) => {
      const boxes = Array.from(document.querySelectorAll('#dashed-columns-container .dashed-box'));
      for (const b of boxes) {
        const c1 = b.querySelector('.dashed-col1');
        const c2 = b.querySelector('.dashed-col2');
        if (c1 && c1.value.toLowerCase().includes('evaluation metrics')) {
          c2.value = metricVal;
          c2.dispatchEvent(new Event('input', { bubbles: true }));
          break;
        }
      }
      const saveBtn = document.querySelector('#section-columns .section-save-btn');
      if (saveBtn) saveBtn.click();
    }, testMetric);

    await new Promise(r => setTimeout(r, 1500));

    const p1MetricVal = await page1.evaluate((pId) => {
      const rows = Array.from(document.querySelectorAll('#matrix-tbody tr'));
      const targetRow = rows.find(r => r.getAttribute('data-paper-id') === String(pId)) || rows[0];
      if (!targetRow) return null;
      const cells = Array.from(targetRow.querySelectorAll('td'));
      for (const td of cells) {
        const cName = td.getAttribute('data-col-name');
        if (cName && cName.toLowerCase().includes('evaluation metrics')) {
          return td.getAttribute('data-raw-val') || td.textContent.trim();
        }
      }
      return null;
    }, targetPaperId);

    console.log('Page 1 "Evaluation Metrics" cell content:', p1MetricVal);
    if (p1MetricVal && p1MetricVal.includes(testMetric)) {
      console.log('🎉 SUCCESS: "Evaluation Metrics" live synchronized to cluster matrix!');
    }

  } catch (err) {
    console.error('Error during test:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
