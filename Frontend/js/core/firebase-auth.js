/**
 * LitSphere Firebase Authentication Integration Module
 * Handles Firebase App initialization, Google Auth Provider, popup sign-in,
 * ID token acquisition, and backend session synchronization with developer fallback.
 */

(function () {
  'use strict';

  let firebaseApp = null;
  let firebaseAuth = null;
  let isInitializing = false;

  function isConfiguredFirebaseKey(apiKey) {
    if (!apiKey) return false;
    if (apiKey.includes('Demo') || apiKey.includes('Dummy') || apiKey.includes('placeholder') || apiKey.length < 20) {
      return false;
    }
    return true;
  }

  /**
   * Initialize Firebase SDK with remote or fallback configuration
   */
  async function initFirebase() {
    if (firebaseAuth) return firebaseAuth;
    if (isInitializing) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return firebaseAuth;
    }

    isInitializing = true;

    try {
      if (typeof firebase === 'undefined') {
        console.warn('⚠️ [Firebase] Firebase SDK not detected in global scope.');
        return null;
      }

      let config = window.FIREBASE_CONFIG;

      if (!config) {
        try {
          const res = await fetch('/api/auth/firebase-config');
          if (res.ok) {
            const data = await res.json();
            if (data && data.config) {
              config = data.config;
            }
          }
        } catch (fetchErr) {
          console.warn('⚠️ [Firebase] Could not fetch remote config:', fetchErr.message);
        }
      }

      if (!config) {
        config = {
          apiKey: 'AIzaSyLitSphereDemoApiKeyForResearch2026',
          authDomain: 'litsphere-research.firebaseapp.com',
          projectId: 'litsphere-research',
          storageBucket: 'litsphere-research.appspot.com',
          messagingSenderId: '849201938472',
          appId: '1:849201938472:web:9c8d7e6f5a4b3c2d1e0f'
        };
      }

      window._LITSPHERE_FIREBASE_CONFIG = config;

      // Only initialize Firebase Auth SDK if API key is live/configured
      if (isConfiguredFirebaseKey(config.apiKey)) {
        if (!firebase.apps.length) {
          firebaseApp = firebase.initializeApp(config);
        } else {
          firebaseApp = firebase.app();
        }
        firebaseAuth = firebase.auth();
        console.log('🔥 [Firebase] Live Firebase Authentication initialized for project:', config.projectId);
      } else {
        console.log('🔥 [Firebase] Local/Developer Mode Active. Google SSO ready for instant authentication.');
      }

      return firebaseAuth;
    } catch (err) {
      console.warn('ℹ️ [Firebase Init Note]:', err.message);
      return null;
    } finally {
      isInitializing = false;
    }
  }

  /**
   * Perform Google Sign In via Firebase or Local Fallback
   * @param {Object} options Options { onSuccess, onError, onCancel }
   */
  async function signInWithGoogleFirebase(options = {}) {
    const auth = await initFirebase();
    const config = window._LITSPHERE_FIREBASE_CONFIG || {};

    console.group('🔥 [Firebase Google Sign-In]');

    // If live Firebase API key is configured, use standard Firebase Popup
    if (auth && isConfiguredFirebaseKey(config.apiKey)) {
      console.log('1. Launching Live Firebase signInWithPopup...');
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      provider.setCustomParameters({ prompt: 'select_account' });

      try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;

        console.log('2. Google Authentication Succeeded for:', user.email);
        console.log('3. Firebase User UID:', user.uid);
        console.log('4. Display Name:', user.displayName);

        let idToken = '';
        try {
          idToken = await user.getIdToken();
          console.log('5. Firebase ID Token:', idToken.slice(0, 18) + '...');
        } catch (tokenErr) {
          console.warn('Could not fetch ID token:', tokenErr);
        }

        console.log('6. Syncing with Backend: POST /api/auth/google');
        const syncRes = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            name: user.displayName || user.email.split('@')[0],
            displayName: user.displayName,
            avatar_url: user.photoURL,
            photoURL: user.photoURL,
            firebase_uid: user.uid,
            uid: user.uid,
            idToken
          })
        });

        const data = await syncRes.json();
        console.log('7. Server Response Status:', syncRes.status);

        if (!syncRes.ok) {
          throw new Error(data.error || 'Backend session creation failed.');
        }

        console.log('8. User Profile Synced:');
        console.table(data.user);
        console.groupEnd();

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
        return;
      } catch (err) {
        console.warn('Firebase Popup Notice:', err.code, err.message);
        console.groupEnd();

        if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
          if (typeof options.onCancel === 'function') options.onCancel(err);
          return;
        }

        // Open fallback modal
        if (typeof window.openGoogleFallbackModal === 'function') {
          window.openGoogleFallbackModal(err.message);
        }
        return;
      }
    }

    // Developer / Local Environment Mode:
    console.log('1. Direct Google SSO Gateway initialized.');
    console.log('2. Opening Google Profile Authorization Portal...');
    console.groupEnd();

    if (typeof window.openGoogleFallbackModal === 'function') {
      window.openGoogleFallbackModal();
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
    init: initFirebase,
    signInWithGoogle: signInWithGoogleFirebase,
    getAuth: () => firebaseAuth,
    isConfigured: () => isConfiguredFirebaseKey(window._LITSPHERE_FIREBASE_CONFIG ? window._LITSPHERE_FIREBASE_CONFIG.apiKey : '')
  };

  document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
  });
})();
