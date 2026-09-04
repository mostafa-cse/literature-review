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

// Suppress known external browser-injected VM script error (Chrome DevTools / web-vitals reportAllChanges startTime bug)
window.addEventListener('error', function(event) {
  if (event && event.message && event.message.includes("Cannot read properties of undefined (reading 'startTime')")) {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    return true;
  }
});
