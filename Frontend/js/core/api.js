/**
 * LITSPHERE BROWSER ENVIRONMENT & EXTENSION SECURITY SHIELD
 * 1. Insulates against external extension crashes (e.g. ImTranslator translator.js double-click null error).
 * 2. Blocks illegal cross-origin navigations to local file:/// protocols (Firefox Security Error mitigation).
 * 3. Prevents browser window drag-and-drop navigation to local files.
 * 4. Silences unhandled third-party extension error noise in console.
 */
(function initSecurityShield() {
  if (window._litsphereSecurityShieldInitialized) return;
  window._litsphereSecurityShieldInitialized = true;

  // 1. ImTranslator Extension DOM Guard
  function injectExtensionGuard() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('SL_shadow_translator')) return;

    try {
      const container = document.createElement('div');
      container.id = 'SL_balloon_obj';
      container.setAttribute('aria-hidden', 'true');
      container.style.cssText = 'display:none!important;position:absolute!important;top:-9999px!important;left:-9999px!important;width:0!important;height:0!important;opacity:0!important;pointer-events:none!important;visibility:hidden!important;';

      const ids = [
        'SL_shadow_translator',
        'SL_button',
        'SL_shadow_translation_result2',
        'SL_planshet',
        'SL_Balloon_options',
        'SL_TB',
        'SL_tables',
        'SL_locer',
        'SL_lng_from',
        'SL_lng_to',
        'SL_loading',
        'SL_switch_b',
        'SL_P0', 'SL_P1', 'SL_P2', 'SL_P3',
        'SL_BBL_locer',
        'SL_MENU_LINK_OPT',
        'SL_MENU_LINK_HIS'
      ];

      ids.forEach(id => {
        const el = document.createElement(id.startsWith('SL_lng') ? 'select' : id === 'SL_locer' ? 'input' : 'div');
        el.id = id;
        el.style.display = 'none';
        if (id === 'SL_locer') el.type = 'checkbox';
        container.appendChild(el);
      });

      const root = document.body || document.documentElement;
      if (root) root.appendChild(container);
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectExtensionGuard);
  } else {
    injectExtensionGuard();
  }

  // 2. Global Error Event Interceptor (Suppress extension & protocol security error noise)
  window.addEventListener('error', function(e) {
    const msg = String(e.message || '').toLowerCase();
    const file = String(e.filename || '').toLowerCase();

    // Catch ImTranslator translator.js double-click style access crash
    if (file.includes('translator.js') || msg.includes('sl_shadow_translator') || (file.includes('extension') && msg.includes('translator'))) {
      e.preventDefault();
      e.stopPropagation();
      return true;
    }

    // Catch Firefox Security Error regarding file:/// protocol navigations
    if (msg.includes('may not load or link to file:///') || (msg.includes('security error') && msg.includes('file:///'))) {
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
  }, true);

  // 3. Prevent Browser Drag-and-Drop Local File Navigations
  window.addEventListener('dragover', function(e) {
    if (!e.target || !e.target.closest || !e.target.closest('.dropzone-box, .upload-dropzone, #drop-zone, .file-drop-area, #pdf-viewport')) {
      e.preventDefault();
    }
  }, false);

  window.addEventListener('drop', function(e) {
    if (!e.target || !e.target.closest || !e.target.closest('.dropzone-box, .upload-dropzone, #drop-zone, .file-drop-area, #pdf-viewport')) {
      e.preventDefault();
    }
  }, false);

  // 4. Intercept Any Link Click Targeting file:///
  document.addEventListener('click', function(e) {
    const a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (a) {
      const rawHref = a.getAttribute('href') || a.href || '';
      if (typeof rawHref === 'string' && (rawHref.toLowerCase().startsWith('file:') || rawHref.toLowerCase().startsWith('file:///'))) {
        e.preventDefault();
        e.stopPropagation();
        console.warn('[LitSphere Security Shield] Blocked navigation to local file protocol:', rawHref);
      }
    }
  }, true);

  // 5. Defend window.open against accidental file:/// protocols
  if (typeof window.open === 'function') {
    const origOpen = window.open;
    window.open = function(url, target, features) {
      if (typeof url === 'string' && (url.toLowerCase().startsWith('file:') || url.toLowerCase().startsWith('file:///'))) {
        console.warn('[LitSphere Security Shield] Blocked window.open for local file protocol:', url);
        return null;
      }
      return origOpen.call(window, url, target, features);
    };
  }
})();

window.getAuthToken = function() {
  const token = localStorage.getItem('litsphere_auth_token') || localStorage.getItem('litnexis_auth_token') || '';
  if (token && !localStorage.getItem('litsphere_auth_token')) {
    localStorage.setItem('litsphere_auth_token', token);
  }
  return token;
};

window.getAuthHeaders = function(extraHeaders = {}) {
  const token = window.getAuthToken();
  let headers = { 'Content-Type': 'application/json' };
  
  if (typeof extraHeaders === 'boolean') {
    if (!extraHeaders) headers = {};
  } else if (typeof extraHeaders === 'object' && extraHeaders !== null) {
    headers = { ...headers, ...extraHeaders };
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

window.fetchWithAuth = async function(url, options = {}) {
  const isFormData = options.body instanceof FormData;
  const authHeaders = window.getAuthHeaders(!isFormData);

  options.headers = {
    ...authHeaders,
    ...(options.headers || {})
  };

  const response = await fetch(url, options);

  if (response.status === 401) {
    localStorage.removeItem('litsphere_auth_token');
    localStorage.removeItem('litsphere_user');
    window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
    throw new Error('Session expired. Please sign in again.');
  }

  return response;
};

/**
 * Real-time Upload with Rate / Speed Tracking, Byte Counters & Smooth ETA Estimation
 * Uses XMLHttpRequest since fetch() does not provide an upload progress stream.
 */
window.uploadWithProgress = function({ url, method = 'POST', headers = {}, formData, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);

    const token = window.getAuthToken ? window.getAuthToken() : (localStorage.getItem('litsphere_auth_token') || localStorage.getItem('token') || '');
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    if (headers && typeof headers === 'object') {
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() !== 'content-type') { // Browser automatically sets multipart/form-data boundary
          xhr.setRequestHeader(k, v);
        }
      }
    }

    const startTime = Date.now();
    let lastTime = startTime;
    let lastLoaded = 0;
    let smoothedSpeed = 0; // in bytes per second

    if (xhr.upload && typeof onProgress === 'function') {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && e.total > 0) {
          const now = Date.now();
          const timeDelta = (now - lastTime) / 1000; // in seconds
          const loadedDelta = e.loaded - lastLoaded;

          if (timeDelta >= 0.2 || e.loaded === e.total) {
            const currentSpeed = timeDelta > 0 ? (loadedDelta / timeDelta) : 0;
            smoothedSpeed = smoothedSpeed === 0 ? currentSpeed : (smoothedSpeed * 0.7 + currentSpeed * 0.3);
            lastTime = now;
            lastLoaded = e.loaded;
          }

          const percent = Math.min(100, Math.round((e.loaded / e.total) * 100));

          // Human-readable rate
          let rateStr = '⚡ 0 KB/s';
          if (smoothedSpeed >= 1024 * 1024) {
            rateStr = `⚡ ${(smoothedSpeed / (1024 * 1024)).toFixed(1)} MB/s`;
          } else if (smoothedSpeed > 0) {
            rateStr = `⚡ ${(smoothedSpeed / 1024).toFixed(0)} KB/s`;
          }

          // Human-readable bytes
          let bytesStr = '';
          if (e.total >= 1024 * 1024) {
            const loadedMb = (e.loaded / (1024 * 1024)).toFixed(1);
            const totalMb = (e.total / (1024 * 1024)).toFixed(1);
            bytesStr = `${loadedMb} / ${totalMb} MB`;
          } else {
            const loadedKb = Math.round(e.loaded / 1024);
            const totalKb = Math.round(e.total / 1024);
            bytesStr = `${loadedKb} / ${totalKb} KB`;
          }

          // Human-readable ETA
          let etaStr = '⏱ ETA: --';
          if (smoothedSpeed > 0 && e.total > e.loaded) {
            const remainingBytes = e.total - e.loaded;
            const remSec = Math.ceil(remainingBytes / smoothedSpeed);
            if (remSec < 60) {
              etaStr = `⏱ ETA: ${remSec}s`;
            } else {
              const mins = Math.floor(remSec / 60);
              const secs = remSec % 60;
              etaStr = `⏱ ETA: ${mins}m ${secs}s`;
            }
          } else if (e.loaded >= e.total) {
            etaStr = '⏱ Server processing...';
          }

          onProgress({
            loaded: e.loaded,
            total: e.total,
            percent,
            speed: smoothedSpeed,
            rateStr,
            bytesStr,
            etaStr,
            isComplete: e.loaded >= e.total
          });
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch {
          resolve(xhr.responseText);
        }
      } else {
        if (xhr.status === 401) {
          localStorage.removeItem('litsphere_auth_token');
          localStorage.removeItem('litsphere_user');
          window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
        }
        let errData = {};
        try {
          errData = JSON.parse(xhr.responseText);
        } catch {}
        reject(new Error(errData.error || errData.message || `Upload failed (HTTP ${xhr.status})`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error occurred during file upload.'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Upload timed out. Please check your network connection.'));
    };

    xhr.send(formData);
  });
};

// Suppress known external browser-injected VM script error (Chrome DevTools / web-vitals reportAllChanges startTime bug)
window.addEventListener('error', function(event) {
  if (event && event.message && event.message.includes("Cannot read properties of undefined (reading 'startTime')")) {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    return true;
  }
});
