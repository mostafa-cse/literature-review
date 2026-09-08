const crypto = require('crypto');
const { getDb } = require('../db');
const cacheService = require('./cacheService');

// ==========================================
// 1. RESILIENT INFRASTRUCTURE: CIRCUIT BREAKERS & RATE LIMITERS
// ==========================================

/**
 * Circuit Breaker implementation protecting against external API cascades and failures
 */
class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 3;
    this.cooldownMs = options.cooldownMs || 25000;
    this.successThreshold = options.successThreshold || 2;

    this.state = 'CLOSED'; // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.totalRequests = 0;
    this.totalFailures = 0;
  }

  canRequest() {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.cooldownMs) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        return true;
      }
      return false;
    }
    // HALF_OPEN: allow probe call
    return true;
  }

  recordSuccess() {
    this.totalRequests++;
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        this.failureCount = 0;
      }
    }
  }

  recordFailure(err) {
    this.totalRequests++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();
    this.failureCount++;

    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null
    };
  }
}

/**
 * Token Bucket Rate Limiter per provider
 */
class RateLimiter {
  constructor(name, maxPerInterval, intervalMs = 1000) {
    this.name = name;
    this.maxPerInterval = maxPerInterval;
    this.intervalMs = intervalMs;
    this.tokens = maxPerInterval;
    this.lastRefill = Date.now();
  }

  async acquire() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed >= this.intervalMs) {
      this.tokens = this.maxPerInterval;
      this.lastRefill = now;
    }

    if (this.tokens > 0) {
      this.tokens--;
      return;
    }

    const waitMs = Math.max(this.intervalMs - elapsed, 50);
    await new Promise(r => setTimeout(r, waitMs));
    this.tokens = this.maxPerInterval - 1;
    this.lastRefill = Date.now();
  }
}

// Circuit Breakers & Rate Limiters registry
const circuitBreakers = {
  crossref: new CircuitBreaker('crossref', { failureThreshold: 3, cooldownMs: 25000 }),
  semanticscholar: new CircuitBreaker('semanticscholar', { failureThreshold: 3, cooldownMs: 30000 }),
  openalex: new CircuitBreaker('openalex', { failureThreshold: 3, cooldownMs: 20000 }),
  arxiv: new CircuitBreaker('arxiv', { failureThreshold: 3, cooldownMs: 20000 }),
  unpaywall: new CircuitBreaker('unpaywall', { failureThreshold: 3, cooldownMs: 25000 })
};

const rateLimiters = {
  crossref: new RateLimiter('crossref', 10, 1000),         // 10 req/s polite pool
  semanticscholar: new RateLimiter('semanticscholar', 1, 1000), // 1 req/s free tier
  openalex: new RateLimiter('openalex', 10, 1000),         // 10 req/s polite pool
  arxiv: new RateLimiter('arxiv', 1, 3000),                // 1 req/3s arXiv TOS
  unpaywall: new RateLimiter('unpaywall', 10, 1000)        // 10 req/s polite pool
};

/**
 * Resilient HTTP fetcher with Abort timeout, exponential backoff retries, and circuit breaker
 */
async function fetchWithRetry(url, options = {}, config = {}) {
  const {
    provider = 'generic',
    retries = 2,
    baseDelay = 500,
    backoffFactor = 2,
    timeoutMs = 6000,
    expectXml = false
  } = config;

  const breaker = circuitBreakers[provider];
  const limiter = rateLimiters[provider];

  if (breaker && !breaker.canRequest()) {
    console.warn(`⚡ [CircuitBreaker] Fast-failing request to ${provider} (circuit is OPEN)`);
    return { ok: false, status: 503, skipped: true, error: `Circuit breaker OPEN for ${provider}` };
  }

  if (limiter) {
    await limiter.acquire();
  }

  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const fetchOptions = {
        ...options,
        signal: controller.signal
      };

      const res = await fetch(url, fetchOptions);
      clearTimeout(timer);

      // 429 Too Many Requests: backoff and retry
      if (res.status === 429) {
        if (attempt < retries) {
          attempt++;
          const retryAfterSec = parseInt(res.headers.get('retry-after') || '1', 10);
          const delay = Math.min((retryAfterSec || 1) * 1000, 4000);
          console.warn(`⚠️ [${provider}] HTTP 429 rate limit hit, backing off ${delay}ms (attempt ${attempt}/${retries})`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        } else {
          if (breaker) breaker.recordFailure(new Error('Rate limit exceeded (429)'));
          return { ok: false, status: 429, error: 'Rate limit exceeded' };
        }
      }

      // 5xx Server Errors: retry with exponential delay
      if (res.status >= 500 && res.status <= 599) {
        if (attempt < retries) {
          attempt++;
          const delay = baseDelay * Math.pow(backoffFactor, attempt - 1) + Math.random() * 200;
          await new Promise(r => setTimeout(r, delay));
          continue;
        } else {
          if (breaker) breaker.recordFailure(new Error(`Server error ${res.status}`));
          return { ok: false, status: res.status, error: `Server error ${res.status}` };
        }
      }

      if (res.ok) {
        if (breaker) breaker.recordSuccess();
        const data = expectXml ? await res.text() : await res.json();
        return { ok: true, status: res.status, data };
      } else {
        // 4xx client errors (404, 400, 403): do not retry
        return { ok: false, status: res.status, error: `HTTP ${res.status}` };
      }
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      attempt++;

      if (attempt <= retries) {
        const delay = baseDelay * Math.pow(backoffFactor, attempt - 1) + Math.random() * 200;
        await new Promise(r => setTimeout(r, delay));
      } else {
        if (breaker) breaker.recordFailure(err);
        return { ok: false, status: 0, error: err.name === 'AbortError' ? 'Timeout' : err.message };
      }
    }
  }

  if (breaker) breaker.recordFailure(lastError || new Error('Max retries exceeded'));
  return { ok: false, status: 0, error: lastError?.message || 'Max retries exceeded' };
}

// ==========================================
// 2. INDIVIDUAL SCHOLARLY PROVIDERS
// ==========================================

/**
 * 1. CrossRef API (Official DOI Registry & Container Metadata)
 */
async function fetchCrossRef(doi) {
  const cleanDoi = cleanIdentifier(doi);
  const url = `https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`;

  const res = await fetchWithRetry(url, {
    headers: { 'User-Agent': 'LitSphere/1.0 (mailto:researcher@litsphere.org)' }
  }, { provider: 'crossref', timeoutMs: 6000 });

  if (!res.ok || !res.data || !res.data.message) {
    return null;
  }

  const item = res.data.message;

  const title = item.title && item.title.length > 0 ? item.title[0] : '';
  const authors = Array.isArray(item.author)
    ? item.author.map(a => `${a.given || ''} ${a.family || ''}`.trim()).filter(Boolean).join(', ')
    : (item.publisher || '');

  const year = (item['published-print'] && item['published-print']['date-parts']?.[0]?.[0])
    || (item['published-online'] && item['published-online']['date-parts']?.[0]?.[0])
    || (item.issued && item.issued['date-parts']?.[0]?.[0])
    || (item.created && item.created['date-parts']?.[0]?.[0])
    || null;

  const pub = (item['container-title']?.[0])
    || (item['short-container-title']?.[0])
    || item.publisher || '';

  let abstract = '';
  if (item.abstract) {
    abstract = item.abstract
      .replace(/<jats:title>[^<]*<\/jats:title>/gi, '')
      .replace(/<[^>]*>?/gm, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return {
    source: 'crossref',
    title,
    authors,
    year: year ? String(year) : '',
    pub,
    abstract,
    doi: cleanDoi,
    url: item.URL || `https://doi.org/${cleanDoi}`,
    volume: item.volume || '',
    issue: item.issue || '',
    page: item.page || '',
    issn: item.ISSN?.[0] || '',
    citation_count: item['is-referenced-by-count'] || 0
  };
}

/**
 * 2. Semantic Scholar Graph API (Citations, TL;DR, Affiliations)
 */
async function fetchSemanticScholar(identifier) {
  const cleanId = cleanIdentifier(identifier);
  let s2Id = cleanId;

  if (/^\d{4}\.\d{4,5}(v\d+)?$/i.test(cleanId)) {
    s2Id = `ARXIV:${cleanId}`;
  } else if (cleanId.startsWith('10.') || cleanId.includes('/')) {
    s2Id = `DOI:${cleanId}`;
  }

  const fields = 'title,authors,authors.affiliations,year,abstract,venue,publicationVenue,citationCount,influentialCitationCount,tldr,openAccessPdf,fieldsOfStudy,s2FieldsOfStudy,url';
  const url = `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(s2Id)}?fields=${fields}`;

  const res = await fetchWithRetry(url, {
    headers: { 'User-Agent': 'LitSphere/1.0 (mailto:researcher@litsphere.org)' }
  }, { provider: 'semanticscholar', timeoutMs: 5000 });

  if (!res.ok || !res.data) {
    return null;
  }

  const item = res.data;
  const authorNames = Array.isArray(item.authors)
    ? item.authors.map(a => a.name).filter(Boolean).join(', ')
    : '';

  const authorAffiliations = Array.isArray(item.authors)
    ? item.authors
        .filter(a => a.affiliations && a.affiliations.length > 0)
        .map(a => ({ author: a.name, affiliations: a.affiliations }))
    : [];

  return {
    source: 'semanticscholar',
    s2_id: item.paperId,
    title: item.title || '',
    authors: authorNames,
    author_affiliations: authorAffiliations,
    year: item.year ? String(item.year) : '',
    pub: item.venue || item.publicationVenue?.name || '',
    abstract: item.abstract ? item.abstract.trim() : '',
    tldr: item.tldr?.text ? item.tldr.text.trim() : '',
    citation_count: item.citationCount || 0,
    influential_citation_count: item.influentialCitationCount || 0,
    fields_of_study: item.fieldsOfStudy || [],
    open_access_pdf: item.openAccessPdf?.url || null,
    url: item.url || ''
  };
}

/**
 * 3. OpenAlex API (Taxonomy Concepts, Inverted Index Abstract, Open Access Status)
 */
async function fetchOpenAlex(identifier) {
  const cleanId = cleanIdentifier(identifier);
  let openAlexTarget = cleanId;

  if (cleanId.startsWith('10.') || cleanId.includes('/')) {
    openAlexTarget = `https://doi.org/${cleanId}`;
  }

  const url = `https://api.openalex.org/works/${encodeURIComponent(openAlexTarget)}?mailto=researcher@litsphere.org`;

  const res = await fetchWithRetry(url, {}, { provider: 'openalex', timeoutMs: 5000 });

  if (!res.ok || !res.data) {
    return null;
  }

  const item = res.data;

  // Reconstruct abstract from inverted index if present
  let reconstructedAbstract = '';
  if (item.abstract_inverted_index) {
    const words = [];
    for (const [word, positions] of Object.entries(item.abstract_inverted_index)) {
      for (const pos of positions) {
        words[pos] = word;
      }
    }
    reconstructedAbstract = words.filter(Boolean).join(' ').trim();
  }

  const authorNames = Array.isArray(item.authorships)
    ? item.authorships.map(a => a.author?.display_name).filter(Boolean).join(', ')
    : '';

  // Extract taxonomy concepts (ranked by score)
  const concepts = Array.isArray(item.concepts)
    ? item.concepts
        .filter(c => (c.score || 0) > 0.3)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .map(c => c.display_name)
    : [];

  return {
    source: 'openalex',
    openalex_id: item.id,
    title: item.title || '',
    authors: authorNames,
    year: item.publication_year ? String(item.publication_year) : '',
    pub: item.primary_location?.source?.display_name || '',
    abstract: reconstructedAbstract,
    taxonomy_concepts: concepts,
    primary_topic: item.primary_topic?.display_name || (concepts[0] || ''),
    citation_count: item.cited_by_count || 0,
    open_access: {
      is_oa: Boolean(item.open_access?.is_oa),
      oa_status: item.open_access?.oa_status || 'closed',
      oa_url: item.open_access?.oa_url || null
    },
    doi: item.doi ? item.doi.replace(/^https?:\/\/doi\.org\//i, '') : cleanId
  };
}

/**
 * 4. arXiv API (Preprint metadata, categories, direct PDF)
 */
async function fetchArxiv(arxivId) {
  let cleanId = arxivId.trim().replace(/^arxiv:\s*/i, '').replace(/^10\.48550\/arXiv\./i, '');
  // Strip version suffix if present for the API lookup: e.g. 2106.15928v2 -> 2106.15928
  const baseId = cleanId.replace(/v\d+$/i, '');

  const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(baseId)}&max_results=1`;

  const res = await fetchWithRetry(url, {}, { provider: 'arxiv', timeoutMs: 6000, expectXml: true });

  let xml = res.ok && res.data ? res.data : null;

  // Fallback to https://arxiv.org/abs/${baseId} if export API timed out or errored
  if (!xml || xml.includes('503') || xml.includes('Error 503')) {
    try {
      const absUrl = `https://arxiv.org/abs/${encodeURIComponent(baseId)}`;
      const absRes = await fetch(absUrl, {
        headers: { 'User-Agent': 'LitSphere/1.0 (mailto:researcher@litsphere.org)' }
      });
      if (absRes.ok) {
        const html = await absRes.text();
        const titleMatch = html.match(/<meta\s+name="citation_title"\s+content="([^"]+)"/i);
        const title = titleMatch ? titleMatch[1].trim() : '';

        if (title) {
          const authorMatches = [...html.matchAll(/<meta\s+name="citation_author"\s+content="([^"]+)"/gi)];
          const authors = authorMatches.map(m => m[1].trim()).join(', ');

          const dateMatch = html.match(/<meta\s+name="citation_date"\s+content="([^"]+)"/i);
          const year = dateMatch ? dateMatch[1].substring(0, 4) : '';

          const pdfMatch = html.match(/<meta\s+name="citation_pdf_url"\s+content="([^"]+)"/i);
          const pdfUrl = pdfMatch ? pdfMatch[1] : `https://arxiv.org/pdf/${cleanId}.pdf`;

          const absMatch = html.match(/<blockquote\s+class="abstract[^>]*>[\s\S]*?<span\s+class="descriptor">Abstract:<\/span>([\s\S]*?)<\/blockquote>/i);
          const abstract = absMatch ? absMatch[1].replace(/\s+/g, ' ').trim() : '';

          const subjMatch = html.match(/class="primary-subject">([^<]+)<\/span>/i);
          const primaryCategory = subjMatch ? subjMatch[1].trim() : 'cs.AI';

          return {
            source: 'arxiv',
            arxiv_id: cleanId,
            title,
            authors,
            year,
            pub: `arXiv preprint (${primaryCategory})`,
            abstract,
            pdf_url: pdfUrl,
            doi: `10.48550/arXiv.${cleanId}`,
            categories: [primaryCategory],
            primary_category: primaryCategory,
            is_preprint: true
          };
        }
      }
    } catch (absErr) {
      console.warn('arXiv HTML fallback notice:', absErr.message);
    }
    return null;
  }

  // Extract title
  const titleMatch = xml.match(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';

  if (!title || title.toLowerCase() === 'error') {
    return null;
  }

  // Extract abstract / summary
  const summaryMatch = xml.match(/<summary>([\s\S]*?)<\/summary>/i);
  const abstract = summaryMatch ? summaryMatch[1].replace(/\s+/g, ' ').trim() : '';

  // Extract authors
  const authorMatches = [...xml.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/gi)];
  const authors = authorMatches.map(m => m[1].trim()).join(', ');

  // Extract published year
  const publishedMatch = xml.match(/<published>(\d{4})-\d{2}-\d{2}/i);
  const year = publishedMatch ? publishedMatch[1] : '';

  // Extract categories
  const catMatches = [...xml.matchAll(/<category\s+[^>]*term="([^"]+)"/gi)];
  const categories = catMatches.map(m => m[1]);
  const primaryCategory = categories[0] || 'cs.AI';

  // Extract PDF link
  const pdfMatch = xml.match(/<link\s+[^>]*title="pdf"\s+href="([^"]+)"/i);
  const pdfUrl = pdfMatch ? pdfMatch[1] : `https://arxiv.org/pdf/${cleanId}.pdf`;

  // Extract published journal reference if paper was peer-reviewed
  const journalRefMatch = xml.match(/<arxiv:journal_ref[^>]*>([\s\S]*?)<\/arxiv:journal_ref>/i);
  const journalRef = journalRefMatch ? journalRefMatch[1].trim() : '';

  // Extract DOI if assigned
  const doiMatch = xml.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/i);
  const doi = doiMatch ? doiMatch[1].trim() : `10.48550/arXiv.${cleanId}`;

  return {
    source: 'arxiv',
    arxiv_id: cleanId,
    title,
    authors,
    year,
    pub: journalRef || `arXiv preprint (${primaryCategory})`,
    abstract,
    pdf_url: pdfUrl,
    doi,
    categories,
    primary_category: primaryCategory,
    is_preprint: true
  };
}

/**
 * 5. Unpaywall API (Direct Open-Access PDF Resolution & License)
 */
async function fetchUnpaywall(doi) {
  const cleanDoi = cleanIdentifier(doi);
  if (!cleanDoi.startsWith('10.')) return null;

  const url = `https://api.unpaywall.org/v2/${encodeURIComponent(cleanDoi)}?email=researcher@litsphere.org`;

  const res = await fetchWithRetry(url, {}, { provider: 'unpaywall', timeoutMs: 5000 });

  if (!res.ok || !res.data) {
    return null;
  }

  const item = res.data;
  const bestOa = item.best_oa_location || {};

  return {
    source: 'unpaywall',
    doi: cleanDoi,
    title: item.title || '',
    is_oa: Boolean(item.is_oa),
    oa_status: item.oa_status || 'closed',
    pdf_url: bestOa.url_for_pdf || bestOa.url || null,
    license: bestOa.license || '',
    host_type: bestOa.host_type || '',
    version: bestOa.version || ''
  };
}

// ==========================================
// 3. PRIORITIZED CASCADING AGGREGATOR
// ==========================================

/**
 * Helper to normalize raw DOI, arXiv, or URL input into clean identifier
 */
function cleanIdentifier(input) {
  if (!input || typeof input !== 'string') return '';
  return input.trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^https?:\/\/arxiv\.org\/(abs|pdf)\//i, '')
    .replace(/\.pdf$/i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/^arxiv:\s*/i, '')
    .trim();
}

/**
 * Detect identifier type
 */
function detectIdentifierType(input) {
  const clean = cleanIdentifier(input);
  if (/^\d{4}\.\d{4,5}(v\d+)?$/i.test(clean) || clean.toLowerCase().startsWith('arxiv.')) {
    return 'arxiv';
  }
  if (/^[a-z\-]+(\.[a-z\-]+)?\/\d{7}(v\d+)?$/i.test(clean)) {
    return 'arxiv_legacy';
  }
  if (clean.startsWith('10.') && clean.includes('/')) {
    if (clean.includes('10.48550/arXiv.')) {
      return 'arxiv_doi';
    }
    return 'doi';
  }
  return 'unknown';
}

/**
 * Executes the full prioritized scholarly cascade:
 * CrossRef -> Semantic Scholar -> OpenAlex & arXiv -> Unpaywall
 * With 24-hour Redis Cache-Aside
 */
async function fetchScholarlyMetadata(rawIdentifier) {
  const cleanId = cleanIdentifier(rawIdentifier);
  if (!cleanId) {
    throw new Error('Valid DOI or arXiv identifier is required');
  }

  const cacheKey = `litsphere:scholarly:${cleanId}`;

  // 1. Check Redis Cache (24 hours TTL)
  const cached = await cacheService.get(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  const idType = detectIdentifierType(cleanId);
  const sourcesConsulted = [];

  let title = '';
  let authors = '';
  let year = '';
  let pub = '';
  let abstract = '';
  let tldr = '';
  let citationCount = 0;
  let influentialCitationCount = 0;
  let authorAffiliations = [];
  let taxonomyConcepts = [];
  let primaryTopic = '';
  let openAccess = { is_oa: false, oa_status: 'unknown', oa_url: null, license: '' };
  let pdfUrl = '';
  let canonicalDoi = cleanId.startsWith('10.') ? cleanId : '';
  let canonicalUrl = `https://doi.org/${cleanId}`;

  // ============================================
  // PATH A: arXiv PREPRINT FIRST
  // ============================================
  if (idType.startsWith('arxiv')) {
    const arxivRawId = cleanId.replace(/^10\.48550\/arXiv\./i, '');
    const arxivData = await fetchArxiv(arxivRawId);
    if (arxivData) {
      sourcesConsulted.push('arxiv');
      title = arxivData.title;
      authors = arxivData.authors;
      year = arxivData.year;
      pub = arxivData.pub;
      abstract = arxivData.abstract;
      pdfUrl = arxivData.pdf_url;
      canonicalDoi = arxivData.doi || canonicalDoi;
      canonicalUrl = `https://arxiv.org/abs/${arxivRawId}`;
      taxonomyConcepts = arxivData.categories || [];
      primaryTopic = arxivData.primary_category || '';
      openAccess = { is_oa: true, oa_status: 'green', oa_url: pdfUrl, license: 'arxiv' };
    }
  }

  // ============================================
  // STEP 1: CrossRef (Official Registry)
  // ============================================
  if (cleanId.startsWith('10.') || canonicalDoi.startsWith('10.')) {
    const targetDoi = cleanId.startsWith('10.') ? cleanId : canonicalDoi;
    const crossRefData = await fetchCrossRef(targetDoi);
    if (crossRefData) {
      sourcesConsulted.push('crossref');
      if (!title) title = crossRefData.title;
      if (!authors) authors = crossRefData.authors;
      if (!year) year = crossRefData.year;
      if (!pub) pub = crossRefData.pub;
      if (!abstract) abstract = crossRefData.abstract;
      if (crossRefData.doi) canonicalDoi = crossRefData.doi;
      if (crossRefData.url) canonicalUrl = crossRefData.url;
      if (crossRefData.citation_count) citationCount = crossRefData.citation_count;
    }
  }

  // ============================================
  // STEP 2: Semantic Scholar Graph API
  // ============================================
  const s2Identifier = canonicalDoi || cleanId;
  const s2Data = await fetchSemanticScholar(s2Identifier);
  if (s2Data) {
    sourcesConsulted.push('semanticscholar');
    if (!title) title = s2Data.title;
    if (!authors) authors = s2Data.authors;
    if (!year) year = s2Data.year;
    if (!pub) pub = s2Data.pub;
    // S2 abstract is usually clean plain text, preferred if CrossRef abstract was missing
    if (!abstract || abstract.length < 50) abstract = s2Data.abstract;
    tldr = s2Data.tldr || '';
    if (s2Data.citation_count > citationCount) citationCount = s2Data.citation_count;
    influentialCitationCount = s2Data.influential_citation_count || 0;
    authorAffiliations = s2Data.author_affiliations || [];
    if (!pdfUrl && s2Data.open_access_pdf) pdfUrl = s2Data.open_access_pdf;
    if (!primaryTopic && s2Data.fields_of_study && s2Data.fields_of_study.length > 0) {
      primaryTopic = s2Data.fields_of_study[0];
    }
  }

  // ============================================
  // STEP 3: OpenAlex (Taxonomy & Inverted Index Abstract)
  // ============================================
  const alexIdentifier = canonicalDoi || cleanId;
  const alexData = await fetchOpenAlex(alexIdentifier);
  if (alexData) {
    sourcesConsulted.push('openalex');
    if (!title) title = alexData.title;
    if (!authors) authors = alexData.authors;
    if (!year) year = alexData.year;
    if (!pub) pub = alexData.pub;
    if (!abstract && alexData.abstract) abstract = alexData.abstract;
    if (alexData.taxonomy_concepts && alexData.taxonomy_concepts.length > 0) {
      taxonomyConcepts = Array.from(new Set([...taxonomyConcepts, ...alexData.taxonomy_concepts]));
    }
    if (!primaryTopic && alexData.primary_topic) primaryTopic = alexData.primary_topic;
    if (alexData.citation_count > citationCount) citationCount = alexData.citation_count;
    if (alexData.open_access) {
      openAccess = {
        ...openAccess,
        is_oa: openAccess.is_oa || alexData.open_access.is_oa,
        oa_status: alexData.open_access.oa_status !== 'closed' ? alexData.open_access.oa_status : openAccess.oa_status,
        oa_url: alexData.open_access.oa_url || openAccess.oa_url
      };
      if (!pdfUrl && alexData.open_access.oa_url) pdfUrl = alexData.open_access.oa_url;
    }
  }

  // ============================================
  // STEP 4: Unpaywall (Direct OA PDF Resolution)
  // ============================================
  if (canonicalDoi && (!pdfUrl || !openAccess.is_oa)) {
    const unpData = await fetchUnpaywall(canonicalDoi);
    if (unpData) {
      sourcesConsulted.push('unpaywall');
      if (unpData.is_oa) {
        openAccess = {
          is_oa: true,
          oa_status: unpData.oa_status || openAccess.oa_status,
          oa_url: unpData.pdf_url || openAccess.oa_url,
          license: unpData.license || ''
        };
      }
    }
  }

  if (idType.startsWith('arxiv')) {
    if (!sourcesConsulted.includes('arxiv')) sourcesConsulted.push('arxiv');
    const arxivRawId = cleanId.replace(/^10\.48550\/arXiv\./i, '').replace(/^arxiv:\s*/i, '');
    if (!pdfUrl) pdfUrl = `https://arxiv.org/pdf/${arxivRawId}.pdf`;
  }

  if (!title && !abstract) {
    return null;
  }

  const finalPayload = {
    doi: canonicalDoi || cleanId,
    title: title || `Paper (${cleanId})`,
    authors: authors || 'Unknown Authors',
    year: year || String(new Date().getFullYear()),
    pub: pub || 'Scholarly Publication',
    abstract: abstract || '',
    tldr: tldr || '',
    citation_count: citationCount,
    influential_citation_count: influentialCitationCount,
    author_affiliations: authorAffiliations,
    taxonomy_concepts: taxonomyConcepts,
    primary_topic: primaryTopic || (taxonomyConcepts[0] || 'General Science'),
    open_access: openAccess,
    pdf_url: pdfUrl || '',
    url: canonicalUrl,
    sources: sourcesConsulted,
    column_values: {
      title: title || `Paper (${cleanId})`,
      authors: authors || 'Unknown Authors',
      year: year || String(new Date().getFullYear()),
      pub: pub || '',
      venue: pub || '',
      doi: canonicalDoi || cleanId,
      abstract: abstract || '',
      intuition: tldr || abstract || '',
      tldr: tldr || '',
      citations: citationCount,
      influential_citations: influentialCitationCount,
      taxonomy: primaryTopic || (taxonomyConcepts[0] || ''),
      open_access: openAccess.is_oa ? (openAccess.oa_status || 'yes') : 'no',
      pdf_url: pdfUrl || '',
      url: canonicalUrl
    }
  };

  // Cache in Redis for 24 hours (86,400 seconds)
  await cacheService.set(cacheKey, finalPayload, 86400, ['scholarly', `doi:${cleanId}`]);

  return { ...finalPayload, cached: false };
}

/**
 * Direct Open-Access PDF URL resolver
 */
async function fetchOpenAccessPdfUrl(identifier) {
  const cleanId = cleanIdentifier(identifier);
  if (!cleanId) return null;

  // 1. Check if arXiv
  if (/^\d{4}\.\d{4,5}(v\d+)?$/i.test(cleanId) || cleanId.includes('arXiv')) {
    const rawId = cleanId.replace(/^10\.48550\/arXiv\./i, '').replace(/^arxiv:\s*/i, '');
    return `https://arxiv.org/pdf/${rawId}.pdf`;
  }

  // 2. Query Unpaywall
  if (cleanId.startsWith('10.')) {
    try {
      const unp = await fetchUnpaywall(cleanId);
      if (unp && unp.pdf_url) return unp.pdf_url;
    } catch (_) {}
  }

  // 3. Query Semantic Scholar
  try {
    const s2 = await fetchSemanticScholar(cleanId);
    if (s2 && s2.open_access_pdf) return s2.open_access_pdf;
  } catch (_) {}

  return null;
}

/**
 * Ingest paper into SQLite database with complete multi-source academic metadata
 */
async function ingestPaperFromScholarly(scholarlyData, projectId = 1, clusterId = null) {
  const db = getDb();
  const pid = parseInt(projectId, 10) || 1;
  const targetClusterId = (clusterId && clusterId !== 'unassigned' && clusterId !== 'null') ? parseInt(clusterId, 10) : null;

  const insertPaper = db.prepare(`
    INSERT INTO papers (
      project_id, cluster_id, title, authors, year, pub, doi, pdf_url,
      status, domain, intuition, equation, strengths, gaps, advantages, criticism, future_directions
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unread', ?, ?, '', '', '', '', '', '')
  `);

  const intuition = scholarlyData.tldr || scholarlyData.abstract || '';
  const domain = scholarlyData.primary_topic || (scholarlyData.taxonomy_concepts?.[0] || 'Computer Science');
  const pdfUrl = scholarlyData.pdf_url || '';

  const result = insertPaper.run(
    pid,
    targetClusterId,
    scholarlyData.title,
    scholarlyData.authors,
    scholarlyData.year,
    scholarlyData.pub,
    scholarlyData.doi,
    pdfUrl,
    domain,
    intuition
  );

  const paperId = Number(result.lastInsertRowid);

  // Ingest keywords from taxonomy concepts
  if (Array.isArray(scholarlyData.taxonomy_concepts) && scholarlyData.taxonomy_concepts.length > 0) {
    const insertKw = db.prepare('INSERT INTO keywords (paper_id, keyword) VALUES (?, ?)');
    for (const kw of scholarlyData.taxonomy_concepts.slice(0, 8)) {
      if (kw && String(kw).trim()) {
        insertKw.run(paperId, String(kw).trim());
      }
    }
  }

  // Invalidate survey matrix & stats caches
  await cacheService.invalidateSurveyCache(pid);
  await cacheService.invalidateTag('stats');

  return {
    id: paperId,
    project_id: pid,
    cluster_id: targetClusterId,
    title: scholarlyData.title,
    authors: scholarlyData.authors,
    year: scholarlyData.year,
    pub: scholarlyData.pub,
    doi: scholarlyData.doi,
    pdf_url: pdfUrl,
    domain,
    intuition,
    sources: scholarlyData.sources || []
  };
}

/**
 * Diagnostics & Health Status for External Providers
 */
function getProviderHealth() {
  const status = {};
  for (const [name, breaker] of Object.entries(circuitBreakers)) {
    status[name] = breaker.getStatus();
  }
  return status;
}

module.exports = {
  CircuitBreaker,
  RateLimiter,
  fetchWithRetry,
  fetchCrossRef,
  fetchSemanticScholar,
  fetchOpenAlex,
  fetchArxiv,
  fetchUnpaywall,
  fetchOpenAccessPdfUrl,
  fetchScholarlyMetadata,
  ingestPaperFromScholarly,
  getProviderHealth,
  cleanIdentifier,
  detectIdentifierType
};
