/**
 * LitSphere Firebase Authentication Integration Module
 * Handles Firebase App initialization, Google Auth Provider, popup & redirect sign-in,
 * ID token acquisition, and backend session synchronization.
 * Supports automatic fallback to signInWithRedirect when popups are blocked
 * or partitioned by Firefox/Safari privacy protections.
 */

(function () {
  'use strict';

  let firebaseApp = null;
  let firebaseAuth = null;
  let isGoogleAuthBusy = false;

  function isConfiguredFirebaseKey(apiKey) {
    if (!apiKey) return false;
    if (apiKey.includes('Demo') || apiKey.includes('Dummy') || apiKey.includes('placeholder') || apiKey.length < 20) {
      return false;
    }
    return true;
  }

  function getFirebaseConfig() {
    return window.FIREBASE_CONFIG || window._LITSPHERE_FIREBASE_CONFIG || {
      apiKey: 'AIzaSyD0SS5oFgigBTO9FNUBC5jn2PH_JAmWf80',
      authDomain: 'litsphere-5dd30.firebaseapp.com',
      projectId: 'litsphere-5dd30',
      storageBucket: 'litsphere-5dd30.firebasestorage.app',
      messagingSenderId: '886868852571',
      appId: '1:886868852571:web:a7f67bf76b509b073fe47e',
      measurementId: 'G-01LYD44Q41'
    };
  }

  /**
   * Synchronously or asynchronously initialize Firebase Auth instance
   */
  function initFirebaseAuthSync() {
    if (firebaseAuth) return firebaseAuth;
    if (typeof firebase === 'undefined') return null;

    try {
      const config = getFirebaseConfig();
      window._LITSPHERE_FIREBASE_CONFIG = config;

      if (!firebase.apps || !firebase.apps.length) {
        firebaseApp = firebase.initializeApp(config);
      } else {
        firebaseApp = firebase.app();
      }

      firebaseAuth = firebase.auth();
      console.log('🔥 [Firebase] Live Firebase Authentication initialized for project:', config.projectId);
      return firebaseAuth;
    } catch (err) {
      console.warn('ℹ️ [Firebase Init Note]:', err.message);
      return null;
    }
  }

  async function initFirebaseAsync() {
    const auth = initFirebaseAuthSync();
    if (auth) return auth;

    // If config was not injected, attempt remote fetch as fallback
    if (!window.FIREBASE_CONFIG) {
      try {
        let res = await fetch('/api/auth/firebase-config');
        if (!res || (!res.ok && (res.status === 502 || res.status === 503))) {
          res = await fetch('https://litsphere.onrender.com/api/auth/firebase-config', { credentials: 'include' });
        }
        if (res && res.ok) {
          const data = await res.json();
          if (data && data.config) {
            window.FIREBASE_CONFIG = data.config;
          }
        }
      } catch (e) {}
    }

    return initFirebaseAuthSync();
  }

  /**
   * Synchronize authenticated user profile with LitSphere backend
   */
  async function syncUserWithBackend(user, options = {}) {
    let idToken = '';
    try {
      idToken = await user.getIdToken();
    } catch (tokenErr) {
      console.warn('Could not fetch ID token:', tokenErr);
    }

    const syncPayload = {
      email: user.email,
      name: user.displayName || user.email.split('@')[0],
      displayName: user.displayName,
      avatar_url: user.photoURL,
      photoURL: user.photoURL,
      firebase_uid: user.uid,
      uid: user.uid,
      idToken
    };

    let syncRes = null;
    try {
      syncRes = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(syncPayload)
      });
    } catch (_) {
      syncRes = null;
    }

    if (!syncRes || (!syncRes.ok && (syncRes.status === 502 || syncRes.status === 503 || syncRes.status === 404))) {
      try {
        syncRes = await fetch('https://litsphere.onrender.com/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(syncPayload)
        });
      } catch (retryErr) {
        console.warn('Fallback sync failed:', retryErr);
      }
    }

    if (!syncRes) {
      throw new Error('Could not connect to LitSphere authentication service.');
    }

    const data = await syncRes.json();
    if (!syncRes.ok) {
      throw new Error(data.error || 'Backend session synchronization failed.');
    }

    if (data.token) {
      localStorage.setItem('litsphere_auth_token', data.token);
      localStorage.setItem('litsphere_user', JSON.stringify(data.user));
      const _wKey = 'litsphere_welcome_dismissed_' + data.token.slice(-12);
      localStorage.removeItem(_wKey);
    }

    if (typeof options.onSuccess === 'function') {
      options.onSuccess(data);
    } else {
      completeRedirect(data);
    }

    return data;
  }

  /**
   * Check for returned redirect credentials on page load
   */
  async function checkRedirectResult() {
    const auth = initFirebaseAuthSync();
    if (!auth) return;

    try {
      const result = await auth.getRedirectResult();
      if (result && result.user) {
        console.log('🔥 [Firebase Redirect Auth] User returned from Google:', result.user.email);
        const btnText = document.getElementById('google-btn-text');
        if (btnText) btnText.textContent = 'Authenticated! Redirecting...';
        await syncUserWithBackend(result.user);
      }
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        console.warn('Redirect authentication status:', err.code, err.message);
      }
    }
  }

  /**
   * Perform Google Sign In via Firebase:
   * Tries native popup first; if popup is blocked by browser or partitioned by Firefox/Safari,
   * automatically falls back to signInWithRedirect.
   */
  async function signInWithGoogleFirebase(options = {}) {
    if (isGoogleAuthBusy) {
      console.warn('⚠️ Google authentication already in progress. Ignoring duplicate trigger.');
      return;
    }
    isGoogleAuthBusy = true;

    try {
      console.group('🔥 [Firebase Google Sign-In]');
      const auth = initFirebaseAuthSync() || await initFirebaseAsync();

      if (!auth) {
        console.groupEnd();
        const err = new Error('Google Authentication service is not initialized. Please verify your internet connection.');
        if (typeof options.onError === 'function') options.onError(err);
        return;
      }

      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      provider.setCustomParameters({ prompt: 'select_account' });

      console.log('1. Attempting Google Sign-In with Popup...');

      let user = null;
      try {
        const result = await auth.signInWithPopup(provider);
        user = result.user;
        console.log('2. Google Popup Succeeded for:', user.email);
      } catch (popupErr) {
        console.warn('Popup attempt result:', popupErr.code, popupErr.message);

        // User intentionally closed the popup
        if (popupErr.code === 'auth/popup-closed-by-user') {
          console.groupEnd();
          if (typeof options.onCancel === 'function') options.onCancel(popupErr);
          return;
        }

        // Check if popup was blocked, cancelled by duplicate, or failed due to storage partitioning
        const isBlockedOrPartitioned =
          popupErr.code === 'auth/popup-blocked' ||
          popupErr.code === 'auth/cancelled-popup-request' ||
          popupErr.code === 'auth/internal-error' ||
          String(popupErr.message || '').includes('popup') ||
          String(popupErr.message || '').includes('INTERNAL ASSERTION FAILED');

        if (isBlockedOrPartitioned) {
          console.log('3. Browser blocked or partitioned popup. Seamlessly falling back to signInWithRedirect...');
          if (typeof options.onRedirecting === 'function') {
            options.onRedirecting();
          } else {
            const btnText = document.getElementById('google-btn-text');
            if (btnText) btnText.textContent = 'Redirecting to Google...';
          }

          // Launch direct redirect (immune to popup blockers and third-party cookie partitioning)
          await auth.signInWithRedirect(provider);
          return;
        }

        let friendlyMessage = popupErr.message || 'Google sign-in was unsuccessful.';
        if (popupErr.code === 'auth/unauthorized-domain') {
          friendlyMessage = `Domain '${window.location.hostname}' is not authorized in Firebase Console. Add it to Firebase Console > Authentication > Settings > Authorized domains.`;
        }

        console.groupEnd();
        const enhancedErr = new Error(friendlyMessage);
        enhancedErr.code = popupErr.code;
        if (typeof options.onError === 'function') {
          options.onError(enhancedErr);
        }
        return;
      }

      if (user) {
        console.log('3. Syncing with LitSphere Backend...');
        const data = await syncUserWithBackend(user, options);
        console.groupEnd();
        return data;
      }
    } catch (err) {
      console.warn('Firebase Sign-In Error:', err);
      console.groupEnd();
      if (typeof options.onError === 'function') {
        options.onError(err);
      }
    } finally {
      isGoogleAuthBusy = false;
    }
  }

  function completeRedirect(data) {
    const urlParams = new URLSearchParams(window.location.search);
    const redirectUrl = urlParams.get('redirect');

    if (data && data.is_new_user) {
      window.location.href = '/profile?notice=welcome_google' + (redirectUrl ? '&redirect=' + encodeURIComponent(redirectUrl) : '');
    } else if (redirectUrl && (redirectUrl.startsWith('/dashboard') || redirectUrl.startsWith('/workspace') || redirectUrl.startsWith('/profile') || redirectUrl.startsWith('/admin'))) {
      window.location.href = redirectUrl;
    } else if (data && data.user && data.user.role === 'admin') {
      window.location.href = '/admin';
    } else {
      window.location.href = '/dashboard';
    }
  }

  // Export to global window namespace
  window.LitSphereFirebase = {
    init: initFirebaseAsync,
    initSync: initFirebaseAuthSync,
    signInWithGoogle: signInWithGoogleFirebase,
    getAuth: () => firebaseAuth || initFirebaseAuthSync(),
    isConfigured: () => isConfiguredFirebaseKey(getFirebaseConfig().apiKey)
  };

  // Immediate synchronous init if SDK is present
  initFirebaseAuthSync();

  // On DOM ready, check if returning from Google redirect
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initFirebaseAuthSync();
      checkRedirectResult();
    });
  } else {
    checkRedirectResult();
  }
})();
