const assert = require('assert');

async function testUserProfileSuite() {
  console.log('👤 Starting Comprehensive User Profile & Email Update Test Suite...\n');

  const BASE_URL = 'http://localhost:3000';

  // 1. Sign in as test researcher
  console.log('  1️⃣ Signing in as Researcher...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'researcher@litsphere.ac',
      password: 'researcher123'
    })
  });
  assert.strictEqual(loginRes.status, 200, 'Login should succeed');
  const loginData = await loginRes.json();
  const token = loginData.token;
  assert(token, 'Token should be returned');
  console.log('  ✅ Researcher authenticated. ID:', loginData.user.id);

  // 2. Fetch current profile via GET /api/auth/me
  console.log('  2️⃣ Fetching researcher profile via GET /api/auth/me...');
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(meRes.status, 200);
  const meData = await meRes.json();
  assert.strictEqual(meData.user.email, 'researcher@litsphere.ac');
  console.log('  ✅ Profile verified:', meData.user.name, `(${meData.user.email})`);

  // 3. Update profile with new Gmail address, bio, institution, ORCID, Scholar
  console.log('  3️⃣ Updating profile with Gmail address, ORCID, and Research Bio...');
  const updateRes = await fetch(`${BASE_URL}/api/auth/profile`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Dr. Mostafa Kamal (Updated)',
      email: 'mostafa.researcher@gmail.com',
      institution: 'Department of Computer Science & Engineering',
      phone: '+880 1711-223344',
      bio: 'Specialist in high-dimensional feature selection and deep graph learning.',
      orcid: '0000-0002-1825-0097',
      google_scholar: 'https://scholar.google.com/citations?user=testuser123'
    })
  });
  assert.strictEqual(updateRes.status, 200, 'Profile update should return 200');
  const updateData = await updateRes.json();
  assert.strictEqual(updateData.user.email, 'mostafa.researcher@gmail.com');
  assert.strictEqual(updateData.user.name, 'Dr. Mostafa Kamal (Updated)');
  assert.strictEqual(updateData.user.bio, 'Specialist in high-dimensional feature selection and deep graph learning.');
  assert.strictEqual(updateData.user.orcid, '0000-0002-1825-0097');
  console.log('  ✅ Profile successfully updated with Gmail address:', updateData.user.email);

  const updatedToken = updateData.token;

  // 4. Test duplicate email restriction (try taking admin@litsphere.ac)
  console.log('  4️⃣ Testing duplicate email collision protection...');
  const dupRes = await fetch(`${BASE_URL}/api/auth/profile`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${updatedToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Dr. Mostafa Kamal',
      email: 'admin@litsphere.ac'
    })
  });
  assert.strictEqual(dupRes.status, 409, 'Duplicate email should return HTTP 409 Conflict');
  console.log('  ✅ Duplicate email prevented with HTTP 409 Conflict.');

  // 5. Revert back to researcher@litsphere.ac for consistent test suite state
  console.log('  5️⃣ Reverting email back to researcher@litsphere.ac for environment stability...');
  const revertRes = await fetch(`${BASE_URL}/api/auth/profile`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${updatedToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Lead Researcher',
      email: 'researcher@litsphere.ac',
      institution: 'LitSphere Machine Learning Lab',
      bio: 'High-dimensional benchmarking and PRISMA systematic literature reviews.',
      orcid: '0000-0002-1825-0097',
      google_scholar: 'https://scholar.google.com'
    })
  });
  assert.strictEqual(revertRes.status, 200);
  console.log('  ✅ Reverted cleanly to researcher@litsphere.ac.');

  console.log('\n=======================================================');
  console.log('🎉 User Profile & Email Update Suite: ALL TESTS PASSED!');
  console.log('=======================================================\n');
}

testUserProfileSuite().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
