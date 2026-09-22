'use strict';

/**
 * Talks to Sefaria (sefaria.org) to get the actual Hebrew and English text.
 *
 * Two rules this file follows on purpose:
 *   1. We never invent or paraphrase a holy text. Every word shown in the app
 *      comes from Sefaria, with the source and translator credited.
 *   2. Once a text has been downloaded it is saved to data/cache, so the app
 *      keeps working if Sefaria is slow or the server is offline.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { flattenText, stripHtml } = require('./util');

const API = process.env.SEFARIA_API || 'https://www.sefaria.org';
const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, '..', 'data', 'cache');
const SEED_DIR = path.join(__dirname, '..', 'data', 'seed');
const TIMEOUT_MS = Number(process.env.SEFARIA_TIMEOUT_MS || 12000);
const USER_AGENT = 'BreslovDaily/1.0 (+personal daily learning app)';

/** How long each kind of answer stays fresh. Texts never change, so they never expire. */
const TTL = {
  text: Infinity,
  shape: 30 * 24 * 3600 * 1000,
  links: 30 * 24 * 3600 * 1000,
  index: 30 * 24 * 3600 * 1000,
  calendars: 12 * 3600 * 1000,
};

const memory = new Map();

fs.mkdirSync(CACHE_DIR, { recursive: true });

function cacheFile(dir, key) {
  const hash = crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
  return path.join(dir, `${hash}.json`);
}

function readCache(key, ttl) {
  const hit = memory.get(key);
  if (hit && (ttl === Infinity || Date.now() - hit.at < ttl)) return hit.value;

  for (const dir of [CACHE_DIR, SEED_DIR]) {
    const file = cacheFile(dir, key);
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const fresh = ttl === Infinity || Date.now() - raw.at < ttl;
      // Seeded files and stale files are still better than nothing; callers
      // that need freshness pass a ttl and we only return fresh data to them.
      if (fresh) {
        memory.set(key, raw);
        return raw.value;
      }
    } catch {
      /* no cache file, or unreadable -- fall through to the network */
    }
  }
  return undefined;
}

/** Last-resort read: return cached data even if it is past its expiry date. */
function readStaleCache(key) {
  const hit = memory.get(key);
  if (hit) return hit.value;
  for (const dir of [CACHE_DIR, SEED_DIR]) {
    try {
      return JSON.parse(fs.readFileSync(cacheFile(dir, key), 'utf8')).value;
    } catch { /* keep looking */ }
  }
  return undefined;
}

function writeCache(key, value) {
  const entry = { at: Date.now(), key, value };
  memory.set(key, entry);
  try {
    fs.writeFileSync(cacheFile(CACHE_DIR, key), JSON.stringify(entry));
  } catch (err) {
    // A read-only disk is not fatal -- the in-memory cache still works.
    if (process.env.DEBUG) console.warn('cache write failed:', err.message);
  }
}

/** One HTTP GET against Sefaria, with a timeout. */
async function request(urlPath) {
  const url = `${API}${urlPath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = new Error(`Sefaria responded ${res.status} for ${urlPath}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch with caching. Falls back to stale cache if the network is down. */
async function fetchCached(kind, urlPath) {
  const key = `${kind}:${urlPath}`;
  const cached = readCache(key, TTL[kind] ?? TTL.text);
  if (cached !== undefined) return cached;

  try {
    const value = await request(urlPath);
    writeCache(key, value);
    return value;
  } catch (err) {
    const stale = readStaleCache(key);
    if (stale !== undefined) {
      if (process.env.DEBUG) console.warn(`using stale cache for ${urlPath}: ${err.message}`);
      return stale;
    }
    throw err;
  }
}

/**
 * How many chapters / lessons a book has, straight from Sefaria.
 * We ask instead of hard-coding numbers so we can never point at a ref
 * that does not exist.
 */
async function getShape(title) {
  const data = await fetchCached('shape', `/api/shape/${encodeURIComponent(title)}`);
  return Array.isArray(data) ? data[0] : data;
}

/**
 * Get one passage. Returns Hebrew lines, English lines and the credits.
 * `ref` is a Sefaria reference such as "Likutei Moharan 6" or "Psalms 16".
 */
async function getText(ref) {
  const encoded = encodeURIComponent(ref);
  let raw;
  try {
    raw = await fetchCached('text', `/api/v3/texts/${encoded}?version=primary&version=translation&return_format=text_only`);
  } catch (err) {
    if (process.env.DEBUG) console.warn(`v3 failed for ${ref}, trying v1: ${err.message}`);
    raw = await fetchCached('text', `/api/texts/${encoded}?context=0&commentary=0`);
  }
  return normaliseText(raw, ref);
}

/**
 * Sefaria has two API shapes (v3 returns a `versions` array, v1 returns
 * `he` and `text` directly). This turns either one into the same object.
 */
function normaliseText(raw, ref) {
  if (!raw || typeof raw !== 'object') return null;

  const out = {
    ref: raw.ref || ref,
    heRef: raw.heRef || null,
    title: raw.book || raw.indexTitle || ref,
    hebrew: [],
    english: [],
    hebrewVersion: null,
    englishVersion: null,
    license: null,
    url: `https://www.sefaria.org/${encodeURIComponent(String(ref).replace(/\s+/g, '_'))}`,
  };

  if (Array.isArray(raw.versions) && raw.versions.length) {
    for (const v of raw.versions) {
      const lines = flattenText(v.text).map(stripHtml).filter(Boolean);
      const lang = v.language || v.actualLanguage;
      if (lang === 'he' && !out.hebrew.length) {
        out.hebrew = lines;
        out.hebrewVersion = v.versionTitle || null;
      } else if (lang !== 'he' && !out.english.length) {
        out.english = lines;
        out.englishVersion = v.versionTitle || null;
        out.license = v.license || null;
      }
    }
  } else {
    out.hebrew = flattenText(raw.he).map(stripHtml).filter(Boolean);
    out.english = flattenText(raw.text).map(stripHtml).filter(Boolean);
    out.hebrewVersion = raw.heVersionTitle || null;
    out.englishVersion = raw.versionTitle || null;
    out.license = raw.license || null;
  }

  if (!out.hebrew.length && !out.english.length) return null;
  return out;
}

/** Everything Sefaria has linked to a reference (we use this to find Reb Nachman on the parsha). */
async function getLinks(ref) {
  const data = await fetchCached('links', `/api/links/${encodeURIComponent(ref)}?with_text=0`);
  return Array.isArray(data) ? data : [];
}

/** Sefaria's own learning calendar (parsha, daf yomi and friends). */
async function getCalendars(diaspora = true) {
  return fetchCached('calendars', `/api/calendars?diaspora=${diaspora ? 1 : 0}`);
}

/** True if we have ever successfully cached anything -- used for a health check. */
function cacheStats() {
  let files = 0;
  try {
    files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json')).length;
  } catch { /* directory may not exist yet */ }
  return { dir: CACHE_DIR, files, memoryEntries: memory.size };
}

module.exports = {
  API, getShape, getText, getLinks, getCalendars, normaliseText, cacheStats, request,
};

/**
 * Search Sefaria's text index.
 *
 * Sefaria's search endpoint has moved and changed shape across versions, and
 * it cannot be reached from the machine this was written on, so rather than
 * commit to one guess this tries the known forms in turn and remembers
 * whichever answers. Every attempt records what came back -- status and the
 * beginning of the body -- so a failure can be read rather than guessed at.
 */

const SEARCH_ATTEMPTS = [
  {
    name: 'search-wrapper (POST, lemmatizer)',
    method: 'POST',
    path: '/api/search-wrapper',
    body: (q, size) => ({
      query: q, type: 'text', field: 'naive_lemmatizer',
      size, filters: [], filter_fields: [], sort_type: 'relevance',
    }),
  },
  {
    name: 'search-wrapper/es8 (POST)',
    method: 'POST',
    path: '/api/search-wrapper/es8',
    body: (q, size) => ({
      query: q, type: 'text', field: 'naive_lemmatizer',
      size, filters: [], filter_fields: [], sort_type: 'relevance',
    }),
  },
  {
    name: 'search-wrapper (POST, minimal)',
    method: 'POST',
    path: '/api/search-wrapper',
    body: (q, size) => ({ query: q, type: 'text', size }),
  },
  {
    name: 'search-wrapper (GET)',
    method: 'GET',
    path: (q, size) => `/api/search-wrapper?q=${encodeURIComponent(q)}&type=text&size=${size}`,
  },
];

/** The attempt that last worked, so we do not retry the failures every time. */
let workingSearch = null;

async function attemptSearch(attempt, query, size) {
  const path = typeof attempt.path === 'function'
    ? attempt.path(query, size)
    : attempt.path;
  const url = `${API}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const init = {
      method: attempt.method,
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    };
    if (attempt.method === 'POST') {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(attempt.body(query, size));
    }

    const res = await fetch(url, init);
    const raw = await res.text();

    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText} — ${raw.slice(0, 160).replace(/\s+/g, ' ')}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`answered with something that is not JSON — ${raw.slice(0, 120).replace(/\s+/g, ' ')}`);
    }

    return readHits(parsed);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @returns {Promise<{hits: Array, total: number, via: string}>}
 * @throws  an Error whose `attempts` lists what each form answered
 */
async function search(query, { size = 20 } = {}) {
  const q = String(query || '').trim();
  if (!q) return { hits: [], total: 0, via: null };

  // Put the one that worked last time first.
  const order = workingSearch
    ? [workingSearch].concat(SEARCH_ATTEMPTS.filter((a) => a !== workingSearch))
    : SEARCH_ATTEMPTS;

  const attempts = [];
  for (const attempt of order) {
    try {
      const result = await attemptSearch(attempt, q, size);
      workingSearch = attempt;
      return { ...result, via: attempt.name };
    } catch (err) {
      attempts.push({ form: attempt.name, said: err.message });
    }
  }

  const failure = new Error('No form of Sefaria search answered');
  failure.attempts = attempts;
  throw failure;
}

/**
 * Sefaria's search returns no _source at all: a hit carries _index, _id,
 * _score and highlight, and the reference is inside _id, followed by the
 * edition it came from and sometimes a language tag:
 *
 *   "Genesis 1:1 (Miqra according to the Masorah) [he]"
 *
 * so everything from the first " (" onwards is stripped off.
 */
function refFromId(id) {
  if (!id) return null;
  let text = String(id);
  const bracket = text.indexOf(' (');
  if (bracket > 0) text = text.slice(0, bracket);
  text = text.replace(/\s*\[[a-z]{2}\]\s*$/i, '');
  return text.trim() || null;
}

/**
 * Find the readable text in a hit, wherever Sefaria happens to put it.
 * Highlights first, since those carry the matched words in context.
 */
function pickSnippet(hit, src) {
  const highlight = hit.highlight || hit.highlights || {};
  for (const key of Object.keys(highlight)) {
    const value = highlight[key];
    if (Array.isArray(value) && value.length) return value.join(' … ');
    if (typeof value === 'string' && value.trim()) return value;
  }

  const fields = ['content', 'text', 'exact', 'naive_lemmatizer', 'he', 'en',
                  'hebrew', 'english', 'snippet', 'body'];
  for (const key of fields) {
    const value = src[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (Array.isArray(value) && value.length) return value.filter(Boolean).join(' ');
  }
  return '';
}

/** A description of one raw hit -- field names and short values, for diagnosis. */
function describeHit(hit) {
  const src = hit._source || hit.source || hit;
  const shape = {};
  for (const key of Object.keys(src).slice(0, 14)) {
    const value = src[key];
    shape[key] = Array.isArray(value)
      ? `array(${value.length}): ${String(value[0] || '').slice(0, 40)}`
      : String(value).slice(0, 40);
  }
  return {
    topLevelKeys: Object.keys(hit).slice(0, 10),
    highlightKeys: Object.keys(hit.highlight || hit.highlights || {}),
    source: shape,
  };
}

/** Pull results out of whichever answer shape came back. */
function readHits(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('returned something unreadable');
  }

  let list = null;
  let total = 0;

  if (raw.hits && Array.isArray(raw.hits.hits)) {
    list = raw.hits.hits;
    total = typeof raw.hits.total === 'number'
      ? raw.hits.total
      : (raw.hits.total && raw.hits.total.value) || list.length;
  } else if (Array.isArray(raw.hits)) {
    list = raw.hits;
    total = raw.total || list.length;
  } else if (Array.isArray(raw.results)) {
    list = raw.results;
    total = raw.total || list.length;
  } else if (Array.isArray(raw.texts)) {
    list = raw.texts;
    total = raw.total || list.length;
  }

  if (!list) {
    // Naming the keys makes an unfamiliar answer fixable instead of mysterious.
    throw new Error(`answered with keys [${Object.keys(raw).slice(0, 8).join(', ')}] and no recognisable list of results`);
  }

  const hits = list.map((hit) => {
    const src = hit._source || hit.source || hit;
    const ref = src.ref || hit.ref || refFromId(hit._id || src._id);
    return {
      ref: ref,
      heRef: src.heRef || null,
      book: src.index_title || src.book || null,
      lang: src.lang || src.language || null,
      snippet: stripHtml(pickSnippet(hit, src)),
      url: ref
        ? `https://www.sefaria.org/${encodeURIComponent(String(ref).replace(/\s+/g, '_'))}`
        : null,
    };
    // A hit is kept on the strength of its reference alone. Requiring a
    // snippet as well is what made search look empty: the answer was fine and
    // every result was thrown away here because the text sat in a field this
    // code had not been told to look in.
  }).filter((h) => h.ref);

  // When nothing survives, describe the answer rather than shrug at it.
  const sample = (!hits.length && list.length)
    ? describeHit(list[0])
    : null;

  return { hits, total, sample };
}

module.exports.search = search;
module.exports.readHits = readHits;
module.exports.SEARCH_ATTEMPTS = SEARCH_ATTEMPTS;
module.exports.pickSnippet = pickSnippet;
module.exports.refFromId = refFromId;
