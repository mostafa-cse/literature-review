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

/**
 * Standardized API Error carrying HTTP status, URL, response payload, and cancellation state.
 */
class ApiError extends Error {
  constructor(message, status = 0, data = null, url = '', isAborted = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.url = url;
    this.isAborted = isAborted;
  }
}

/**
 * Client-side Stale-While-Revalidate (SWR) Cache.
 * Provides memory caching with optional localStorage persistence, TTL validation,
 * and pattern-based cache invalidation.
 */
class SwrCache {
  constructor(storagePrefix = 'litsphere_swr_') {
    this.memory = new Map();
    this.storagePrefix = storagePrefix;
  }

  _getKey(key) {
    return `${this.storagePrefix}${key}`;
  }

  get(key) {
    if (!key) return null;
    const now = Date.now();

    // 1. In-memory cache
    if (this.memory.has(key)) {
      const item = this.memory.get(key);
      const isExpired = now - item.timestamp > item.ttl;
      return {
        data: item.data,
        timestamp: item.timestamp,
        isStale: isExpired
      };
    }

    // 2. Persistent storage fallback
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(this._getKey(key));
        if (raw) {
          const item = JSON.parse(raw);
          if (item && item.data !== undefined) {
            this.memory.set(key, item);
            const isExpired = now - item.timestamp > item.ttl;
            return {
              data: item.data,
              timestamp: item.timestamp,
              isStale: isExpired
            };
          }
        }
      }
    } catch (_) {}

    return null;
  }

  set(key, data, ttlMs = 300000, persist = false) {
    if (!key) return;
    const item = {
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    };
    this.memory.set(key, item);

    if (persist) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this._getKey(key), JSON.stringify(item));
        }
      } catch (_) {}
    }
  }

  delete(key) {
    if (!key) return;
    this.memory.delete(key);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this._getKey(key));
      }
    } catch (_) {}
  }

  invalidate(pattern) {
    if (!pattern) {
      this.clear();
      return;
    }

    const regex = typeof pattern === 'string'
      ? new RegExp(pattern.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i')
      : pattern;

    // Remove from memory map
    for (const key of this.memory.keys()) {
      if (regex.test(key)) {
        this.memory.delete(key);
      }
    }

    // Remove from localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(this.storagePrefix)) {
            const rawKey = k.substring(this.storagePrefix.length);
            if (regex.test(rawKey)) {
              toRemove.push(k);
            }
          }
        }
        toRemove.forEach(k => localStorage.removeItem(k));
      }
    } catch (_) {}
  }

  clear() {
    this.memory.clear();
    try {
      if (typeof localStorage !== 'undefined') {
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(this.storagePrefix)) {
            toRemove.push(k);
          }
        }
        toRemove.forEach(k => localStorage.removeItem(k));
      }
    } catch (_) {}
  }
}

/**
 * Centralized Enterprise HTTP Client with in-flight deduplication, named AbortController
 * cancellation, Stale-While-Revalidate (SWR) caching, optimistic mutations, and cross-tab sync.
 */
class ApiClient {
  constructor() {
    this.inFlightRequests = new Map(); // key -> Promise
    this.abortControllers = new Map(); // abortKey -> AbortController
    this.timeout = 30000; // 30s default
    this.cache = new SwrCache();
    this._initSyncListener();
  }

  getAuthToken() {
    return window.getAuthToken ? window.getAuthToken() : (localStorage.getItem('litsphere_auth_token') || '');
  }

  getAuthHeaders(includeContentType = true, extraHeaders = {}) {
    if (typeof window.getAuthHeaders === 'function') {
      return window.getAuthHeaders(includeContentType ? extraHeaders : false);
    }
    const token = this.getAuthToken();
    const headers = {};
    if (includeContentType) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return Object.assign(headers, extraHeaders);
  }

  abort(abortKey) {
    if (!abortKey) return;
    const controller = this.abortControllers.get(abortKey);
    if (controller) {
      try {
        controller.abort();
      } catch (_) {}
      this.abortControllers.delete(abortKey);
    }
  }

  abortAll() {
    for (const [, controller] of this.abortControllers.entries()) {
      try {
        controller.abort();
      } catch (_) {}
    }
    this.abortControllers.clear();
    this.inFlightRequests.clear();
  }

  async request(url, options = {}) {
    const {
      method = 'GET',
      data,
      body,
      headers = {},
      abortKey,
      signal,
      timeout = this.timeout,
      dedupe = (method.toUpperCase() === 'GET'),
      skipAuthRedirect = false,
      ...customFetchOptions
    } = options;

    const upperMethod = method.toUpperCase();
    const isGet = upperMethod === 'GET';

    // 1. In-flight request deduplication for identical concurrent GET requests
    const dedupeKey = `${upperMethod}:${url}`;
    if (isGet && dedupe && this.inFlightRequests.has(dedupeKey)) {
      return this.inFlightRequests.get(dedupeKey);
    }

    // 2. AbortController lifecycle for named abortKey
    let internalController = null;
    let requestSignal = signal;

    if (abortKey) {
      this.abort(abortKey);
      internalController = new AbortController();
      this.abortControllers.set(abortKey, internalController);
      requestSignal = internalController.signal;
    }

    // 3. Timeout Controller (if no custom signal supplied)
    let timeoutId = null;
    if (timeout > 0 && !requestSignal) {
      internalController = new AbortController();
      requestSignal = internalController.signal;
      timeoutId = setTimeout(() => {
        try {
          internalController.abort();
        } catch (_) {}
      }, timeout);
    }

    // 4. Request headers & body formatting
    const isFormData = (data instanceof FormData) || (body instanceof FormData);
    const requestHeaders = this.getAuthHeaders(!isFormData, headers);

    let requestBody = body;
    if (data !== undefined) {
      if (isFormData) {
        requestBody = data;
      } else if (typeof data === 'object' && data !== null) {
        requestBody = JSON.stringify(data);
      } else {
        requestBody = data;
      }
    }

    const fetchPromise = (async () => {
      try {
        const response = await fetch(url, {
          method: upperMethod,
          headers: requestHeaders,
          body: requestBody,
          signal: requestSignal,
          ...customFetchOptions
        });

        if (timeoutId) clearTimeout(timeoutId);
        if (abortKey && this.abortControllers.get(abortKey) === internalController) {
          this.abortControllers.delete(abortKey);
        }

        // Handle 401 Unauthorized
        if (response.status === 401) {
          const isPublicShared = window.location.pathname.startsWith('/shared/');
          const isLoginPage = window.location.pathname === '/login' || window.location.pathname === '/auth';
          if (!isPublicShared && !isLoginPage && !skipAuthRedirect) {
            localStorage.removeItem('litsphere_auth_token');
            localStorage.removeItem('litsphere_user');
            window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
          }
          let errPayload = null;
          try { errPayload = await response.json(); } catch (_) {}
          throw new ApiError(errPayload?.error || errPayload?.message || 'Session expired. Please sign in again.', 401, errPayload, url);
        }

        // Parse response body
        let parsedData = null;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          parsedData = await response.json();
        } else {
          parsedData = await response.text();
        }

        if (!response.ok) {
          const errMsg = (parsedData && typeof parsedData === 'object' && (parsedData.error || parsedData.message))
            || `HTTP error ${response.status}: ${response.statusText}`;
          throw new ApiError(errMsg, response.status, parsedData, url);
        }

        return parsedData;
      } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        if (abortKey && this.abortControllers.get(abortKey) === internalController) {
          this.abortControllers.delete(abortKey);
        }

        const isAborted = err.name === 'AbortError' || (requestSignal && requestSignal.aborted);
        if (isAborted) {
          throw new ApiError('Request was aborted.', 0, null, url, true);
        }

        if (err instanceof ApiError) {
          throw err;
        }

        throw new ApiError(err.message || 'Network connection failed', 0, null, url);
      } finally {
        if (isGet && dedupe) {
          this.inFlightRequests.delete(dedupeKey);
        }
      }
    })();

    if (isGet && dedupe) {
      this.inFlightRequests.set(dedupeKey, fetchPromise);
    }

    return fetchPromise;
  }

  get(url, options = {}) {
    return this.request(url, { ...options, method: 'GET' });
  }

  post(url, data, options = {}) {
    return this.request(url, { ...options, method: 'POST', data });
  }

  put(url, data, options = {}) {
    return this.request(url, { ...options, method: 'PUT', data });
  }

  patch(url, data, options = {}) {
    return this.request(url, { ...options, method: 'PATCH', data });
  }

  delete(url, options = {}) {
    return this.request(url, { ...options, method: 'DELETE' });
  }

  upload(url, formData, options = {}) {
    if (typeof window.uploadWithProgress === 'function' && options && options.onProgress) {
      return window.uploadWithProgress({
        url,
        method: options.method || 'POST',
        headers: options.headers,
        formData,
        onProgress: options.onProgress
      });
    }
    return this.request(url, { ...options, method: options.method || 'POST', data: formData });
  }

  /**
   * Stale-While-Revalidate (SWR) fetching.
   * Returns cached data immediately if available while fetching fresh data in the background.
   * If onRevalidate callback is provided, it is invoked when fresh data differs from cached data.
   *
   * @param {string} url - The URL to fetch.
   * @param {Object} [options] - SWR & fetch options.
   * @param {number} [options.ttl=300000] - Cache TTL in ms (default 5 minutes).
   * @param {string} [options.cacheKey] - Custom cache key (defaults to URL).
   * @param {boolean} [options.persist=true] - Whether to persist in localStorage across sessions.
   * @param {boolean} [options.forceFresh=false] - Force bypass cache.
   * @param {Function} [onRevalidate] - Callback (freshData, isUpdated) => void
   * @returns {Promise<any>} Resolves with cached or fresh data.
   */
  async swr(url, options = {}, onRevalidate = null) {
    const {
      ttl = 300000,
      cacheKey = url,
      persist = true,
      forceFresh = false,
      ...fetchOptions
    } = options;

    const cached = !forceFresh ? this.cache.get(cacheKey) : null;

    const revalidate = async (isBackground = false) => {
      try {
        const freshData = await this.get(url, { ...fetchOptions, dedupe: true });
        const oldSerialized = cached ? JSON.stringify(cached.data) : null;
        const newSerialized = JSON.stringify(freshData);
        const isDifferent = oldSerialized !== newSerialized;

        this.cache.set(cacheKey, freshData, ttl, persist);

        if (isBackground && isDifferent) {
          if (typeof onRevalidate === 'function') {
            try {
              onRevalidate(freshData, true);
            } catch (cbErr) {
              console.warn('[ApiClient SWR] onRevalidate error:', cbErr);
            }
          }
          if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('swr:revalidated', {
              detail: { key: cacheKey, url, data: freshData }
            }));
          }
        }

        return freshData;
      } catch (err) {
        if (isBackground) {
          if (!err.isAborted) {
            console.warn('[ApiClient SWR] Background revalidation failed:', err.message);
          }
          return cached ? cached.data : null;
        }
        throw err;
      }
    };

    if (cached && cached.data !== null && cached.data !== undefined) {
      // Background revalidation
      setTimeout(() => {
        revalidate(true);
      }, 0);

      // Return cached data immediately
      return cached.data;
    }

    // No cache entry: fetch fresh and wait
    return await revalidate(false);
  }

  /**
   * Standardized Optimistic Mutation with Automatic Rollback.
   *
   * @param {Object} params
   * @param {Function} params.optimistic - Runs synchronously before network request. Can return context.
   * @param {Function} params.mutation - Async function performing network call (e.g. () => api.put(...)).
   * @param {Function} params.rollback - Runs with (error, context) if mutation rejects.
   * @param {string|RegExp} [params.invalidateKey] - Cache key or pattern to invalidate on completion.
   * @param {string} [params.broadcastType] - Broadcast message type on success.
   * @param {Object} [params.broadcastPayload] - Broadcast payload on success.
   * @returns {Promise<any>}
   */
  async mutate({
    optimistic,
    mutation,
    rollback,
    invalidateKey,
    broadcastType,
    broadcastPayload
  }) {
    let context = undefined;
    if (typeof optimistic === 'function') {
      try {
        context = optimistic();
      } catch (optErr) {
        console.error('[ApiClient mutate] Optimistic update failed:', optErr);
      }
    }

    try {
      const result = await mutation();

      if (invalidateKey) {
        this.cache.invalidate(invalidateKey);
      }

      if (broadcastType) {
        this.broadcast(broadcastType, broadcastPayload || result);
      }

      return result;
    } catch (err) {
      if (typeof rollback === 'function') {
        try {
          rollback(err, context);
        } catch (rbErr) {
          console.error('[ApiClient mutate] Rollback failed:', rbErr);
        }
      }
      if (invalidateKey) {
        this.cache.invalidate(invalidateKey);
      }
      throw err;
    }
  }

  /**
   * Reactive Cross-Tab Event Dispatcher.
   * Broadcasts events across Workspace, Review, and Dashboard via BroadcastChannel & localStorage,
   * while automatically invalidating relevant SWR cache entries.
   *
   * @param {string} type - Event type (e.g. 'paper_updated', 'cluster_transfer', 'status_updated').
   * @param {Object} payload - Event payload.
   */
  broadcast(type, payload = {}) {
    const pid = payload.projectId || (typeof activeProjectId !== 'undefined' ? activeProjectId : (window.activeProjectId || null));
    const fullPayload = {
      type,
      ...payload,
      projectId: pid,
      timestamp: Date.now()
    };

    // Invalidate local SWR cache keys
    this.invalidateByEventType(type, fullPayload);

    // Cross-tab BroadcastChannel
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('literature_review_sync');
        bc.postMessage(fullPayload);
        bc.close();
      }
    } catch (_) {}

    // Cross-tab localStorage event fallback
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('literature_review_sync_event', JSON.stringify(fullPayload));
      }
    } catch (_) {}

    // Dispatch custom event in current window
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('api:sync', { detail: fullPayload }));
    }
  }

  /**
   * Invalidate SWR cache entries according to event semantics.
   */
  invalidateByEventType(type, payload = {}) {
    const t = String(type || '').toLowerCase();
    const pid = payload.projectId;

    if (t.includes('paper') || t.includes('status') || t.includes('cell') || t.includes('screening') || t.includes('transfer')) {
      this.cache.invalidate('api/papers');
      this.cache.invalidate('api/user/dashboard-stats');
      if (pid) {
        this.cache.invalidate(`api/clusters?project_id=${pid}`);
      } else {
        this.cache.invalidate('api/clusters');
      }
    } else if (t.includes('cluster')) {
      this.cache.invalidate('api/clusters');
      this.cache.invalidate('api/user/dashboard-stats');
      if (pid) this.cache.invalidate(`project_id=${pid}`);
    } else if (t.includes('column')) {
      this.cache.invalidate('api/dynamic-columns');
    } else if (t.includes('project') || t.includes('survey')) {
      this.cache.invalidate('api/projects');
      this.cache.invalidate('api/user/dashboard-stats');
    }
  }

  /**
   * Initialize cross-tab sync receiver.
   */
  _initSyncListener() {
    if (typeof window === 'undefined') return;

    const handleSync = (payload) => {
      if (!payload || !payload.type) return;
      this.invalidateByEventType(payload.type, payload);
      window.dispatchEvent(new CustomEvent('api:sync', { detail: payload }));
    };

    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.syncChannel = new BroadcastChannel('literature_review_sync');
        this.syncChannel.onmessage = (e) => handleSync(e.data);
      }
    } catch (_) {}

    window.addEventListener('storage', (e) => {
      if (e.key === 'literature_review_sync_event' && e.newValue) {
        try {
          handleSync(JSON.parse(e.newValue));
        } catch (_) {}
      }
    });
  }

  /**
   * Reactive Server-Sent Events (SSE) stream for asynchronous BullMQ jobs
   * Replaces interval polling with instant server push telemetry.
   * @param {string} queueName - 'pdf-processing-queue' | 'crossref-enrichment-queue' | 'citation-export-queue'
   * @param {string|number} jobId - Target BullMQ job identifier
   * @param {Object} options - { onStatus, onProgress, onComplete, onError, timeoutMs = 120000 }
   * @returns {{ close: Function }} Controller to cancel/close the event stream
   */
  streamJobProgress(queueName, jobId, options = {}) {
    const {
      onStatus = () => {},
      onProgress = () => {},
      onComplete = () => {},
      onError = () => {},
      timeoutMs = 120000
    } = options;

    let isClosed = false;
    let pollTimer = null;
    let es = null;

    const cleanup = () => {
      isClosed = true;
      if (es) {
        try { es.close(); } catch (_) {}
        es = null;
      }
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    // Polling fallback if SSE is unavailable or fails
    const startPollingFallback = () => {
      if (isClosed) return;
      console.warn(`ℹ️ [SSE] Falling back to reactive HTTP polling for job #${jobId}`);
      pollTimer = setInterval(async () => {
        if (isClosed) return;
        try {
          const res = await this.get(`/api/jobs/${encodeURIComponent(queueName)}/${encodeURIComponent(jobId)}`);
          const job = res?.job;
          if (!job) return;

          if (job.progress) {
            onProgress(job.progress);
          }

          if (job.state === 'completed') {
            cleanup();
            onComplete(job.returnValue || job);
          } else if (job.state === 'failed') {
            cleanup();
            onError(new Error(job.failedReason || 'Job processing failed'));
          }
        } catch (err) {
          if (!isClosed) {
            cleanup();
            onError(err);
          }
        }
      }, 1500);
    };

    // Check EventSource support
    if (typeof EventSource !== 'undefined') {
      try {
        const token = this.getAuthToken();
        const url = `/api/jobs/${encodeURIComponent(queueName)}/${encodeURIComponent(jobId)}/stream?token=${encodeURIComponent(token)}`;
        es = new EventSource(url);

        es.addEventListener('status', (e) => {
          if (isClosed) return;
          try {
            const data = JSON.parse(e.data);
            onStatus(data);
            if (data.progress) onProgress(data.progress);
          } catch (_) {}
        });

        es.addEventListener('progress', (e) => {
          if (isClosed) return;
          try {
            const data = JSON.parse(e.data);
            onProgress(data);
          } catch (_) {}
        });

        es.addEventListener('completed', (e) => {
          if (isClosed) return;
          try {
            const data = JSON.parse(e.data);
            cleanup();
            onComplete(data);
          } catch (_) {
            cleanup();
            onComplete({});
          }
        });

        es.addEventListener('failed', (e) => {
          if (isClosed) return;
          try {
            const data = JSON.parse(e.data);
            cleanup();
            onError(new Error(data.error || 'Job failed'));
          } catch (_) {
            cleanup();
            onError(new Error('Job failed'));
          }
        });

        es.onerror = () => {
          // If EventSource fails early, close and switch to polling fallback
          if (!isClosed) {
            if (es) {
              try { es.close(); } catch (_) {}
              es = null;
            }
            startPollingFallback();
          }
        };

        // Safety timeout
        setTimeout(() => {
          if (!isClosed) {
            cleanup();
            onError(new Error('Streaming timed out after 2 minutes.'));
          }
        }, timeoutMs);

      } catch (err) {
        startPollingFallback();
      }
    } else {
      startPollingFallback();
    }

    return { close: cleanup };
  }

  /**
   * Reactive Server-Sent Events stream for batch/multi-file uploads
   */
  streamBatchProgress(jobIds, options = {}) {
    const {
      queueName = 'pdf-processing-queue',
      onInit = () => {},
      onProgress = () => {},
      onJobComplete = () => {},
      onBatchComplete = () => {},
      onError = () => {}
    } = options;

    const ids = Array.isArray(jobIds) ? jobIds : [jobIds];
    let isClosed = false;
    let es = null;

    const cleanup = () => {
      isClosed = true;
      if (es) {
        try { es.close(); } catch (_) {}
        es = null;
      }
    };

    if (typeof EventSource !== 'undefined') {
      try {
        const token = this.getAuthToken();
        const url = `/api/jobs/stream/batch?job_ids=${encodeURIComponent(ids.join(','))}&queue=${encodeURIComponent(queueName)}&token=${encodeURIComponent(token)}`;
        es = new EventSource(url);

        es.addEventListener('batch_init', (e) => {
          if (isClosed) return;
          try { onInit(JSON.parse(e.data)); } catch (_) {}
        });

        es.addEventListener('progress', (e) => {
          if (isClosed) return;
          try { onProgress(JSON.parse(e.data)); } catch (_) {}
        });

        es.addEventListener('completed', (e) => {
          if (isClosed) return;
          try { onJobComplete(JSON.parse(e.data)); } catch (_) {}
        });

        es.addEventListener('batch_completed', (e) => {
          if (isClosed) return;
          try {
            cleanup();
            onBatchComplete(JSON.parse(e.data));
          } catch (_) {
            cleanup();
            onBatchComplete({});
          }
        });

        es.onerror = (err) => {
          if (!isClosed) {
            cleanup();
            onError(err);
          }
        };
      } catch (err) {
        cleanup();
        onError(err);
      }
    }

    return { close: cleanup };
  }
}

window.SwrCache = SwrCache;
window.ApiError = ApiError;
window.ApiClient = ApiClient;
window.api = new ApiClient();
window.streamJobProgress = (queueName, jobId, opts) => window.api.streamJobProgress(queueName, jobId, opts);
window.streamBatchProgress = (jobIds, opts) => window.api.streamBatchProgress(jobIds, opts);

window.fetchWithAuth = async function(url, options = {}) {
  const isFormData = options.body instanceof FormData;
  const authHeaders = window.getAuthHeaders(!isFormData);

  options.headers = {
    ...authHeaders,
    ...(options.headers || {})
  };

  const response = await fetch(url, options);

  if (response.status === 401) {
    const isPublicShared = window.location.pathname.startsWith('/shared/');
    const isLoginPage = window.location.pathname === '/login' || window.location.pathname === '/auth';
    if (!isPublicShared && !isLoginPage) {
      localStorage.removeItem('litsphere_auth_token');
      localStorage.removeItem('litsphere_user');
      window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
    }
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
