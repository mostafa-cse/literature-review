/**
 * LITSPHERE CORE API & AUTHENTICATION CLIENT
 * Unified JWT authorization headers and fetch helper with session expiration handling.
 */

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
