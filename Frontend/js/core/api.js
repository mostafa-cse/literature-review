/**
 * LITNEXIS CORE API & AUTHENTICATION CLIENT
 * Unified JWT authorization headers and fetch helper with session expiration handling.
 */

window.getAuthToken = function() {
  return localStorage.getItem('litnexis_auth_token') || '';
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
    localStorage.removeItem('litnexis_auth_token');
    localStorage.removeItem('litnexis_user');
    window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
    throw new Error('Session expired. Please sign in again.');
  }

  return response;
};
