const fs = require('fs');
let PDFParseLib = null;
try {
  const mod = require('pdf-parse');
  PDFParseLib = mod.PDFParse || (typeof mod === 'function' ? mod : (mod.default || null));
} catch (e) {
  console.warn('pdf-parse library load notice:', e.message);
}

/**
 * Smart PDF metadata and first-page content extractor
 * @param {string|Buffer} input - Absolute/relative path to PDF file, or Buffer
 * @param {string} originalName - Original filename for heuristic fallback
 * @returns {Promise<Object>} Extracted metadata (title, authors, year, doi, intuition, pageCount)
 */
async function parsePdfMetadata(input, originalName = '') {
  try {
    const dataBuffer = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
    let text = '';
    let info = {};
    let pageCount = 1;

    if (PDFParseLib) {
      if (typeof PDFParseLib === 'function' && !PDFParseLib.prototype?.getText) {
        const res = await PDFParseLib(dataBuffer, { max: 1 });
        text = (res.text || '').trim();
        info = res.info || {};
        pageCount = res.numpages || info.Pages || 1;
      } else {
        const uint8 = new Uint8Array(dataBuffer.buffer, dataBuffer.byteOffset, dataBuffer.byteLength);
        const parser = new PDFParseLib(uint8);
        const [textRes, infoRes] = await Promise.allSettled([
          parser.getText(),
          parser.getInfo ? parser.getInfo() : Promise.resolve({})
        ]);
        if (textRes.status === 'fulfilled') {
          text = typeof textRes.value === 'string' ? textRes.value : (textRes.value?.text || '');
        }
        if (infoRes.status === 'fulfilled') {
          info = infoRes.value || {};
        }
        pageCount = info.Pages || 1;
      }
    }
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // 1. Detect DOI from text
    const doiMatch = text.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/);
    const extractedDoi = doiMatch ? doiMatch[0].replace(/[.,;)]+$/, '') : '';

    // 2. Extract Year
    let extractedYear = null;
    if (info.CreationDate) {
      const yearMatch = String(info.CreationDate).match(/(19\d{2}|20\d{2})/);
      if (yearMatch) extractedYear = parseInt(yearMatch[0], 10);
    }
    if (!extractedYear && text) {
      const yearMatches = text.match(/\b(19\d{2}|20\d{2})\b/g);
      if (yearMatches) {
        // Find most sensible recent year
        const validYears = yearMatches.map(y => parseInt(y, 10)).filter(y => y >= 1990 && y <= new Date().getFullYear() + 1);
        if (validYears.length > 0) extractedYear = Math.max(...validYears);
      }
    }
    if (!extractedYear && originalName) {
      const fileYearMatch = originalName.match(/(19\d{2}|20\d{2})/);
      if (fileYearMatch) extractedYear = parseInt(fileYearMatch[0], 10);
    }

    // 3. Extract Title
    let extractedTitle = (info.Title || '').trim();
    // If info.Title is generic or looks like a software generator name
    if (!extractedTitle || extractedTitle.length < 5 || /microsoft|word|latex|untitled|pdf|adobe/i.test(extractedTitle)) {
      if (lines.length > 0) {
        // First 1-3 lines usually form the paper title
        let candidateLines = [];
        for (let i = 0; i < Math.min(lines.length, 4); i++) {
          const line = lines[i];
          // Skip conference header lines like "IEEE Transactions on...", "Proceedings of...", etc.
          if (/^(proceedings|ieee|acm|elsevier|springer|journal|arxiv|volume|vol\.|issn|published)/i.test(line)) {
            continue;
          }
          // If we hit author affiliations or email, break
          if (/@|university|department|institute|school|abstract|index terms/i.test(line)) {
            break;
          }
          candidateLines.push(line);
          if (candidateLines.join(' ').length > 150) break;
        }
        if (candidateLines.length > 0) {
          extractedTitle = candidateLines.join(' ');
        }
      }
    }

    // Fallback title from originalName
    if (!extractedTitle && originalName) {
      extractedTitle = originalName
        .replace(/\.[^/.]+$/, '')
        .replace(/_/g, ' ')
        .replace(/^(Bioinfo|Cross|Filter|Wrapper|Embedded|Hybrid|DL|anomaly)\s*/i, '');
    }

    // 4. Extract Authors
    let extractedAuthors = (info.Author || '').trim();
    if (!extractedAuthors || /microsoft|latex|unknown/i.test(extractedAuthors)) {
      // Look for lines following the title
      if (lines.length > 1) {
        for (let i = 1; i < Math.min(lines.length, 6); i++) {
          const line = lines[i];
          if (!line.includes(extractedTitle) && !/^(abstract|keywords|introduction|ieee)/i.test(line)) {
            if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)+(,\s*[A-Z][a-z]+(\s+[A-Z][a-z]+)*)*/.test(line)) {
              extractedAuthors = line;
              break;
            }
          }
        }
      }
    }
    if (!extractedAuthors) extractedAuthors = 'Academic Researchers';

    // 5. Extract Abstract / Intuition
    let extractedAbstract = '';
    const abstractMatch = text.match(/(?:Abstract|ABSTRACT)[\s—:-]+([\s\S]*?)(?:(?:Index Terms|Keywords|I\.\s+INTRODUCTION|1\.\s+Introduction|INTRODUCTION))/i);
    if (abstractMatch && abstractMatch[1]) {
      extractedAbstract = abstractMatch[1].replace(/\s+/g, ' ').trim().substring(0, 500);
    }

    return {
      title: extractedTitle || 'Untitled Paper',
      authors: extractedAuthors,
      year: extractedYear || new Date().getFullYear(),
      doi: extractedDoi,
      intuition: extractedAbstract,
      pageCount: Math.max(1, parseInt(pageCount || 1, 10)),
      first_page_text: text.substring(0, 1000)
    };
  } catch (err) {
    console.warn(`PDF parse fallback for ${originalName}:`, err.message);
    const baseName = (originalName || 'Uploaded Paper').replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
    const yearMatch = originalName.match(/(19\d{2}|20\d{2})/);
    return {
      title: baseName,
      authors: 'Uploaded Author',
      year: yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear(),
      doi: '',
      intuition: '',
      pageCount: 1,
      first_page_text: ''
    };
  }
}

module.exports = {
  parsePdfMetadata
};
