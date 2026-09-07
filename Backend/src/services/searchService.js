const { query: pgQuery } = require('../config/postgres');

/**
 * Perform hybrid Full-Text Search + Trigram Fuzzy Search across papers
 * Combines ts_rank BM25 scoring with pg_trgm character similarity.
 */
async function searchPapers({
  searchTerm,
  query,
  projectId = null,
  clusterId = null,
  limit = 20,
  offset = 0,
  fuzzyThreshold = 0.2,
}) {
  const term = searchTerm || query;
  if (!term || typeof term !== 'string' || !term.trim()) {
    return { results: [], total: 0, query: term };
  }

  const cleanTerm = term.trim();

  // Construct parameterized SQL combining FTS and Trigram matching
  const params = [cleanTerm];
  let whereClauses = [];

  // Project filtering
  if (projectId) {
    params.push(projectId);
    whereClauses.push(`p.project_id = $${params.length}`);
  }

  // Cluster filtering
  if (clusterId) {
    params.push(clusterId);
    whereClauses.push(`p.cluster_id = $${params.length}`);
  }

  const filterSql = whereClauses.length > 0 ? `AND ${whereClauses.join(' AND ')}` : '';

  // SQL Query using websearch_to_tsquery + plainto_tsquery fallback + trigram similarity
  const sql = `
    WITH search_query AS (
      SELECT 
        plainto_tsquery('english', $1) AS ts_q,
        $1 AS raw_term
    )
    SELECT 
      p.id,
      p.project_id,
      p.cluster_id,
      p.title,
      p.authors,
      p.year,
      p.pub,
      p.domain,
      p.doi,
      p.status,
      p.equation,
      p.screening_decision,
      c.name AS cluster_name,
      c.color AS cluster_color,
      -- Full text ranking (weighted: A=1.0, B=0.4, C=0.2, D=0.1)
      ts_rank_cd(p.search_vector, sq.ts_q, 32 /* rank normalization */) AS fts_rank,
      -- Trigram similarity
      GREATEST(
        similarity(p.title, sq.raw_term),
        similarity(coalesce(p.authors, ''), sq.raw_term)
      ) AS trgm_similarity,
      -- Combined hybrid score
      (
        ts_rank_cd(p.search_vector, sq.ts_q) * 2.0 +
        GREATEST(
          similarity(p.title, sq.raw_term),
          similarity(coalesce(p.authors, ''), sq.raw_term)
        )
      ) AS hybrid_score,
      -- Dynamic search headline snippet
      ts_headline(
        'english',
        p.title,
        sq.ts_q,
        'StartSel=<mark>, StopSel=</mark>, MaxWords=15, MinWords=5'
      ) AS title_headline
    FROM papers p
    CROSS JOIN search_query sq
    LEFT JOIN clusters c ON p.cluster_id = c.id
    WHERE (
      p.search_vector @@ sq.ts_q
      OR similarity(p.title, sq.raw_term) > ${fuzzyThreshold}
      OR similarity(coalesce(p.authors, ''), sq.raw_term) > ${fuzzyThreshold}
    )
    ${filterSql}
    ORDER BY hybrid_score DESC, p.year DESC NULLS LAST
    LIMIT ${parseInt(limit, 10) || 20}
    OFFSET ${parseInt(offset, 10) || 0};
  `;

  const countSql = `
    WITH search_query AS (
      SELECT 
        plainto_tsquery('english', $1) AS ts_q,
        $1 AS raw_term
    )
    SELECT COUNT(*) AS total
    FROM papers p
    CROSS JOIN search_query sq
    WHERE (
      p.search_vector @@ sq.ts_q
      OR similarity(p.title, sq.raw_term) > ${fuzzyThreshold}
      OR similarity(coalesce(p.authors, ''), sq.raw_term) > ${fuzzyThreshold}
    )
    ${filterSql};
  `;

  const [dataResult, countResult] = await Promise.all([
    pgQuery(sql, params),
    pgQuery(countSql, params),
  ]);

  return {
    query: cleanTerm,
    total: parseInt(countResult.rows[0]?.total || '0', 10),
    results: dataResult.rows,
  };
}

/**
 * Fast trigram-based autocomplete for keywords and search suggestions
 */
async function autocompleteKeywords(prefix, limit = 8) {
  if (!prefix || !prefix.trim()) return [];

  const cleanPrefix = prefix.trim();
  const sql = `
    SELECT 
      keyword,
      COUNT(*) AS count,
      similarity(keyword, $1) AS sim
    FROM keywords
    WHERE keyword ILIKE $1 || '%' OR similarity(keyword, $1) > 0.25
    GROUP BY keyword
    ORDER BY sim DESC, count DESC
    LIMIT $2;
  `;

  const res = await pgQuery(sql, [cleanPrefix, limit]);
  return res.rows;
}

/**
 * Fuzzy search specifically for authors with publication counts
 */
async function searchAuthors(authorQuery, limit = 8) {
  if (!authorQuery || !authorQuery.trim()) return [];

  const cleanQuery = authorQuery.trim();
  const sql = `
    SELECT 
      authors,
      similarity(authors, $1) AS sim,
      COUNT(*) AS papers_count
    FROM papers
    WHERE authors IS NOT NULL AND (authors ILIKE '%' || $1 || '%' OR similarity(authors, $1) > 0.2)
    GROUP BY authors
    ORDER BY sim DESC, papers_count DESC
    LIMIT $2;
  `;

  const res = await pgQuery(sql, [cleanQuery, limit]);
  return res.rows;
}

module.exports = {
  searchPapers,
  autocompleteKeywords,
  searchAuthors,
};
