process.env.NODE_ENV = 'test';
const http = require('http');
const app = require('../server');

async function runTests() {
  console.log('🧪 ========================================================');
  console.log('🧪 LitSphere Google & Mail Login Automated Test Suite');
  console.log('🧪 ========================================================\n');

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const BASE_URL = `http://localhost:${port}`;

  function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, BASE_URL);
      const data = body ? JSON.stringify(body) : null;
      const req = http.request(
        url,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
          }
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => (raw += chunk));
          res.on('end', () => {
            let parsed;
            try {
              parsed = JSON.parse(raw);
            } catch (e) {
              parsed = raw;
            }
            resolve({ status: res.statusCode, data: parsed });
          });
        }
      );

      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // Test Group 1: Google Sign-In & Registration
    // -------------------------------------------------------------
    console.log('🔷 Test Group 1: Google Sign-In & Single Sign-On (SSO)');
    const testGoogleEmail = `scholar_google_${Date.now()}@gmail.com`;
    const googleRes = await makeRequest('POST', '/api/auth/google', {
      email: testGoogleEmail,
      displayName: 'Prof. Google Researcher',
      avatar_url: 'https://lh3.googleusercontent.com/a/google-avatar',
      google_id: `gid_${Date.now()}`
    });

    assert(googleRes.status === 200, `POST /api/auth/google responds with 200 OK (got ${googleRes.status})`);
    assert(googleRes.data && googleRes.data.token, 'Session token returned for Google login');
    assert(googleRes.data && googleRes.data.user && googleRes.data.user.email === testGoogleEmail, 'Google user created with matching email');
    assert(googleRes.data && googleRes.data.is_new_user === true, 'Correctly flagged as new user');

    // Google Returning User
    const googleReturnRes = await makeRequest('POST', '/api/auth/google', {
      email: testGoogleEmail,
      displayName: 'Prof. Google Researcher'
    });
    assert(googleReturnRes.status === 200, 'Returning Google user logs in with 200 OK');
    assert(googleReturnRes.data.user.id === googleRes.data.user.id, 'Preserves existing user ID across Google logins');

    // Google Identity Services (GSI) simulated JWT credential
    const fakeGsiEmail = `gsi_scholar_${Date.now()}@gmail.com`;
    const fakeHeader = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64');
    const fakePayload = Buffer.from(JSON.stringify({
      email: fakeGsiEmail,
      name: 'Dr. GSI Scholar',
      picture: 'https://lh3.googleusercontent.com/a/gsi-avatar',
      sub: `gsi_sub_${Date.now()}`
    })).toString('base64');
    const fakeCredential = `${fakeHeader}.${fakePayload}.signature`;

    const gsiRes = await makeRequest('POST', '/api/auth/google', {
      credential: fakeCredential
    });
    assert(gsiRes.status === 200, 'POST /api/auth/google decodes GSI credential with 200 OK');
    assert(gsiRes.data.user && gsiRes.data.user.email === fakeGsiEmail, 'Decodes and registers user from GSI credential');

    // -------------------------------------------------------------
    // Test Group 2: Mail Login (One-Time Passcode / Email OTP)
    // -------------------------------------------------------------
    console.log('\n🔷 Test Group 2: Mail Login (Passwordless Email Code / OTP)');
    const testMailEmail = `scholar_mail_${Date.now()}@gmail.com`;

    // 2.1: Request Login Passcode
    const sendOtpRes = await makeRequest('POST', '/api/auth/send-login-otp', {
      email: testMailEmail
    });
    assert(sendOtpRes.status === 200, `POST /api/auth/send-login-otp responds with 200 OK (got ${sendOtpRes.status})`);
    assert(sendOtpRes.data && sendOtpRes.data.success === true, 'Response indicates success for login passcode');

    // 2.2: Test Invalid Passcode Rejection
    const invalidVerifyRes = await makeRequest('POST', '/api/auth/verify-login-otp', {
      email: testMailEmail,
      code: '000000'
    });
    assert(invalidVerifyRes.status === 400, 'Rejects invalid 6-digit passcode with 400 Bad Request');

    // 2.3: Verify with real code (dispatched or queryable)
    const { getDb } = require('../src/db');
    const db = getDb();
    const codeRecord = db.prepare('SELECT code FROM email_login_codes WHERE LOWER(email) = ? AND used = 0 ORDER BY id DESC LIMIT 1').get(testMailEmail);
    assert(codeRecord && codeRecord.code, 'Login passcode stored in database for verification');

    const validVerifyRes = await makeRequest('POST', '/api/auth/verify-login-otp', {
      email: testMailEmail,
      code: codeRecord.code
    });
    assert(validVerifyRes.status === 200, `POST /api/auth/verify-login-otp responds with 200 OK (got ${validVerifyRes.status})`);
    assert(validVerifyRes.data && validVerifyRes.data.token, 'JWT session token returned upon passcode verification');
    assert(validVerifyRes.data && validVerifyRes.data.user && validVerifyRes.data.user.email === testMailEmail, 'User profile returned with matching email');

    // 2.4: Code cannot be reused (one-time use security)
    const reuseVerifyRes = await makeRequest('POST', '/api/auth/verify-login-otp', {
      email: testMailEmail,
      code: codeRecord.code
    });
    assert(reuseVerifyRes.status === 400, 'Rejects already-used login passcode with 400 Bad Request');

    console.log('\n========================================================');
    console.log(`📊 Test Results: ${passed} passed, ${failed} failed.`);
    console.log('========================================================\n');
    server.close();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('❌ Test suite fatal error:', err);
    server.close();
    process.exit(1);
  }
}

runTests();
