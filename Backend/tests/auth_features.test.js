// Automated Test Suite for Firebase Google SSO and Forgot Password / Reset Flow
const http = require('http');

const BASE_URL = 'http://localhost:3000';

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

async function runTests() {
  console.log('🧪 =======================================================');
  console.log('🧪 LitSphere Firebase Auth & Password Recovery Test Suite');
  console.log('🧪 =======================================================\n');

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
    // Test 0: Firebase Config Endpoint
    // -------------------------------------------------------------
    console.log('🔥 Test Group 0: Firebase Configuration');
    const fbConfigRes = await makeRequest('GET', '/api/auth/firebase-config');
    assert(fbConfigRes.status === 200, 'GET /api/auth/firebase-config responds with 200 OK');
    assert(fbConfigRes.data && fbConfigRes.data.config && fbConfigRes.data.config.projectId, 'Returns valid Firebase project configuration');

    // -------------------------------------------------------------
    // Test 1: Firebase Google SSO - New User Registration
    // -------------------------------------------------------------
    console.log('\n🔷 Test Group 1: Firebase Google SSO Authentication');
    const testGoogleEmail = `test_firebase_scholar_${Date.now()}@gmail.com`;
    const testFirebaseUid = `firebase_uid_${Date.now()}`;
    const testPhotoUrl = `https://lh3.googleusercontent.com/a/test-avatar-${Date.now()}`;

    const ssoRes1 = await makeRequest('POST', '/api/auth/google', {
      displayName: 'Dr. Test Firebase Scholar',
      email: testGoogleEmail,
      photoURL: testPhotoUrl,
      firebase_uid: testFirebaseUid,
      idToken: 'mock_firebase_jwt_id_token_123456'
    });

    assert(ssoRes1.status === 200, `POST /api/auth/google responds with 200 OK (got ${ssoRes1.status})`);
    assert(ssoRes1.data.token && typeof ssoRes1.data.token === 'string', 'JWT token returned for Firebase Google SSO');
    assert(ssoRes1.data.user && ssoRes1.data.user.email === testGoogleEmail, 'User profile returned with matching email');
    assert(ssoRes1.data.user.firebase_uid === testFirebaseUid, 'Firebase UID saved on user record');
    assert(ssoRes1.data.user.avatar_url === testPhotoUrl, 'Google avatar URL saved on user record');
    assert(ssoRes1.data.is_new_user === true, 'Flagged as new user on first Google sign in');

    // -------------------------------------------------------------
    // Test 2: Firebase Google SSO - Returning User Login
    // -------------------------------------------------------------
    const ssoRes2 = await makeRequest('POST', '/api/auth/google', {
      displayName: 'Dr. Test Firebase Scholar Updated',
      email: testGoogleEmail,
      firebase_uid: testFirebaseUid,
      idToken: 'mock_firebase_jwt_id_token_renewed'
    });

    assert(ssoRes2.status === 200, 'POST /api/auth/google returning user responds with 200 OK');
    assert(ssoRes2.data.is_new_user === false, 'Flagged as existing/returning user on subsequent sign in');
    assert(ssoRes2.data.user.id === ssoRes1.data.user.id, 'Same user ID preserved across Firebase SSO logins');
    assert(ssoRes2.data.user.firebase_uid === testFirebaseUid, 'Firebase UID persists across returning user logins');

    // -------------------------------------------------------------
    // Test 3: Standard User Setup for Password Reset
    // -------------------------------------------------------------
    console.log('\n🔑 Test Group 2: Forgot Password & Recovery Flow');
    const resetUserEmail = `reset_user_${Date.now()}@university.edu`;
    const resetUsername = `researcher_${Date.now()}`;
    const initialPassword = 'InitialSecurePassword123!';

    const regRes = await makeRequest('POST', '/api/auth/register', {
      username: resetUsername,
      email: resetUserEmail,
      password: initialPassword,
      confirmPassword: initialPassword
    });

    assert(regRes.status === 201, `Standard user created for reset test (status ${regRes.status})`);

    // -------------------------------------------------------------
    // Test 4: Forgot Password Request - Invalid Account
    // -------------------------------------------------------------
    const nonExistentRes = await makeRequest('POST', '/api/auth/forgot-password', {
      identifier: 'non_existent_scholar_99999@domain.org'
    });
    assert(nonExistentRes.status === 404, 'Forgot password fails with 404 for unknown user');

    // -------------------------------------------------------------
    // Test 5: Forgot Password Request - By Username
    // -------------------------------------------------------------
    const forgotRes = await makeRequest('POST', '/api/auth/forgot-password', {
      identifier: resetUsername
    });

    assert(forgotRes.status === 200, 'Forgot password request succeeds with 200 OK for valid username');
    assert(typeof forgotRes.data.reset_code === 'string' && forgotRes.data.reset_code.length === 6, 'Generated 6-digit verification code');
    const resetCode = forgotRes.data.reset_code;

    // -------------------------------------------------------------
    // Test 6: Verify Code - Invalid Code Rejection
    // -------------------------------------------------------------
    const verifyBadCode = await makeRequest('POST', '/api/auth/verify-reset-code', {
      identifier: resetUsername,
      code: '000000'
    });
    assert(verifyBadCode.status === 400, 'Verify reset code rejects invalid 6-digit code with 400 Bad Request');

    // -------------------------------------------------------------
    // Test 7: Verify Code - Valid Code Acceptance
    // -------------------------------------------------------------
    const verifyGoodCode = await makeRequest('POST', '/api/auth/verify-reset-code', {
      identifier: resetUsername,
      code: resetCode
    });
    assert(verifyGoodCode.status === 200 && verifyGoodCode.data.valid === true, 'Verify reset code accepts valid 6-digit code');

    // -------------------------------------------------------------
    // Test 8: Password Reset - Mismatched Confirm Password
    // -------------------------------------------------------------
    const mismatchRes = await makeRequest('POST', '/api/auth/reset-password', {
      identifier: resetUsername,
      code: resetCode,
      new_password: 'BrandNewPassword2026!',
      confirm_password: 'DifferentPassword2026!'
    });
    assert(mismatchRes.status === 400, 'Password reset fails when new_password and confirm_password differ');

    // -------------------------------------------------------------
    // Test 9: Password Reset - Successful Update
    // -------------------------------------------------------------
    const newPassword = 'BrandNewPassword2026!';
    const resetRes = await makeRequest('POST', '/api/auth/reset-password', {
      identifier: resetUsername,
      code: resetCode,
      new_password: newPassword,
      confirm_password: newPassword
    });

    assert(resetRes.status === 200, 'Password reset succeeds with 200 OK');
    assert(resetRes.data.token && typeof resetRes.data.token === 'string', 'JWT session token returned after reset');
    assert(resetRes.data.user && resetRes.data.user.username === resetUsername, 'User profile returned after reset');

    // -------------------------------------------------------------
    // Test 10: Reset Code Cannot Be Reused
    // -------------------------------------------------------------
    const reuseRes = await makeRequest('POST', '/api/auth/reset-password', {
      identifier: resetUsername,
      code: resetCode,
      new_password: 'AnotherPassword999!',
      confirm_password: 'AnotherPassword999!'
    });
    assert(reuseRes.status === 400, 'Previously used reset code cannot be reused');

    // -------------------------------------------------------------
    // Test 11: Login with Old Password Fails
    // -------------------------------------------------------------
    const oldLoginRes = await makeRequest('POST', '/api/auth/login', {
      identifier: resetUsername,
      password: initialPassword
    });
    assert(oldLoginRes.status === 401, 'Login with old password fails (401 Unauthorized)');

    // -------------------------------------------------------------
    // Test 12: Login with New Password Succeeds
    // -------------------------------------------------------------
    const newLoginRes = await makeRequest('POST', '/api/auth/login', {
      identifier: resetUsername,
      password: newPassword
    });
    assert(newLoginRes.status === 200, 'Login with new password succeeds (200 OK)');
    assert(newLoginRes.data.user.username === resetUsername, 'Authenticated session established with new credentials');

    // -------------------------------------------------------------
    // Test Group 3: Live Username & Single Email Account Enforcement
    // -------------------------------------------------------------
    console.log('\n👤 Test Group 3: Live Username & Single Account per Email Enforcement');
    const uniqueUser = `unique_scholar_${Date.now()}`;
    const checkUserRes1 = await makeRequest('GET', `/api/auth/check-username?username=${uniqueUser}`);
    assert(checkUserRes1.status === 200 && checkUserRes1.data.available === true, 'New unique username is reported as available');

    const checkUserRes2 = await makeRequest('GET', `/api/auth/check-username?username=${resetUsername}`);
    assert(checkUserRes2.status === 200 && checkUserRes2.data.available === false, 'Existing username is correctly rejected as taken');

    const checkUserRes3 = await makeRequest('GET', `/api/auth/check-username?username=ab`);
    assert(checkUserRes3.status === 200 && checkUserRes3.data.available === false, 'Short username (< 3 chars) is rejected as invalid');

    const uniqueEmail = `unique_scholar_${Date.now()}@university.edu`;
    const checkEmailRes1 = await makeRequest('GET', `/api/auth/check-email?email=${encodeURIComponent(uniqueEmail)}`);
    assert(checkEmailRes1.status === 200 && checkEmailRes1.data.available === true, 'New unique email is reported as available');

    const checkEmailRes2 = await makeRequest('GET', `/api/auth/check-email?email=${encodeURIComponent(resetUserEmail)}`);
    assert(checkEmailRes2.status === 200 && checkEmailRes2.data.available === false, 'Existing email is rejected (1 account per email rule enforced)');

    const dupEmailReg = await makeRequest('POST', '/api/auth/register', {
      username: `another_name_${Date.now()}`,
      email: resetUserEmail,
      password: 'StrongPassword123!',
      confirmPassword: 'StrongPassword123!'
    });
    assert(dupEmailReg.status === 409, 'Registration fails with 409 Conflict when attempting to reuse an existing email');

    console.log('\n=======================================================');
    console.log(`📊 Test Summary: ${passed} Passed, ${failed} Failed`);
    console.log('=======================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('💥 Test suite crashed:', err);
    process.exit(1);
  }
}

runTests();
