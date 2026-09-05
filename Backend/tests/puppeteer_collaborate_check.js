const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { generateToken } = require('../src/utils/auth');

async function testCollaborationUI() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Check as User 1 (M0stafa - Editor on Project 10)
  const user1 = { id: 1, email: 'mostafakamal.cse2022@gmail.com', name: 'M0stafa', role: 'admin' };
  const token1 = generateToken(user1);

  await page.evaluateOnNewDocument((t, u) => {
    localStorage.setItem('litsphere_auth_token', t);
    localStorage.setItem('litsphere_user', JSON.stringify(u));
  }, token1, user1);

  await page.goto('http://localhost:3000/workspace?project=10', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));

  // Check toolbar Collaborate button
  const collaborateBtnText = await page.evaluate(() => {
    const btn = document.getElementById('btn-open-team');
    return btn ? { text: btn.innerText.trim(), title: btn.getAttribute('title') } : null;
  });
  console.log('Collaborate Button:', collaborateBtnText);

  // Click Collaborate button to open modal
  await page.click('#btn-open-team');
  await new Promise(r => setTimeout(r, 800));

  const artifactDir = '/Users/mostafakamal/.gemini/antigravity-ide/brain/5ceff95b-7b94-4426-b8cf-54555277da86';
  await page.screenshot({ path: path.join(artifactDir, 'collaborate_modal_editor_view.png') });
  console.log('Saved collaborate_modal_editor_view.png');

  // 2. Check as User 2 (kamal - Owner on Project 10)
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1440, height: 900 });

  const user2 = { id: 2, email: '200108.cse@student.just.edu.bd', name: 'kamal', role: 'user' };
  const token2 = generateToken(user2);

  await page2.evaluateOnNewDocument((t, u) => {
    localStorage.setItem('litsphere_auth_token', t);
    localStorage.setItem('litsphere_user', JSON.stringify(u));
  }, token2, user2);

  await page2.goto('http://localhost:3000/workspace?project=10', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));

  await page2.click('#btn-open-team');
  await new Promise(r => setTimeout(r, 800));
  await page2.screenshot({ path: path.join(artifactDir, 'collaborate_modal_owner_view.png') });
  console.log('Saved collaborate_modal_owner_view.png');

  // 3. Check Dashboard as User 1 (M0stafa)
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(artifactDir, 'dashboard_collaborative_surveys.png') });
  console.log('Saved dashboard_collaborative_surveys.png');

  await browser.close();
  console.log('All UI checks completed successfully.');
}

testCollaborationUI().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
