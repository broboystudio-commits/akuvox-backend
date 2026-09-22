'use strict';

/**
 * The lock on the front door.
 *
 * The site is open to anyone by default. Set SITE_PASSWORD in the hosting
 * dashboard and every page and every /api/... answer needs that password
 * first. Unset it and the lock is gone again -- nothing else has to change,
 * which is what keeps the local tests and `npm start` simple.
 *
 * The password itself is never written down in this repository. It lives only
 * in the environment variables of whatever is running the server.
 *
 * Three ways in, because three very different things ask for pages:
 *
 *   1. A browser    -- the usual name-and-password box (HTTP Basic auth).
 *   2. A link       -- ?key=... on the end of any address. The answer sets a
 *                      cookie, so it only has to be on the address once.
 *   3. A machine    -- the iPhone widgets and the calendar subscription send
 *                      the same key as an X-Access-Key header or ?key=.
 *
 * /api/health stays open on purpose: Render polls it to decide whether the
 * service is alive, and a locked-out health check would fail every deploy.
 */

const crypto = require('crypto');

/** Addresses that answer even when the site is locked. */
const ALWAYS_OPEN = ['/api/health'];

/** The name of the cookie that remembers a ?key=... visit. */
const COOKIE = 'bd_access';

const env = (name, fallback) => String(process.env[name] || fallback || '').trim();

/**
 * Read straight from the environment on every call rather than once at
 * startup, so a test can turn the lock on and off around a running server.
 */
function password() { return env('SITE_PASSWORD'); }
function user() { return env('SITE_USER', 'breslov'); }

/**
 * The key the widgets and the calendar use. ACCESS_KEY if it is set, and
 * otherwise the password itself -- one secret to copy is enough for most
 * people, and a separate one is there for anyone who wants it.
 */
function key() { return env('ACCESS_KEY') || password(); }

/** Is the lock on at all? */
function isLocked() { return password() !== ''; }

/**
 * Compare two secrets without leaking, through how long the comparison took,
 * how much of the guess was right. Hashing first also lets strings of
 * different lengths be compared, which timingSafeEqual refuses to do.
 */
function same(a, b) {
  const digest = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest();
  return crypto.timingSafeEqual(digest(a), digest(b));
}

/** What the cookie holds: a fingerprint of the key, never the key itself. */
function cookieToken() {
  return crypto.createHash('sha256').update('breslov:' + key(), 'utf8').digest('hex');
}

/** Pull one cookie out of the Cookie header without pulling in a library. */
function cookieValue(header, name) {
  const parts = String(header || '').split(';');
  for (const part of parts) {
    const at = part.indexOf('=');
    if (at === -1) continue;
    if (part.slice(0, at).trim() !== name) continue;
    return decodeURIComponent(part.slice(at + 1).trim());
  }
  return '';
}

/** Did this request arrive over https? Render sits behind a proxy, hence the header. */
function isSecure(req) {
  if (req.secure) return true;
  return String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

/** The name and password out of an `Authorization: Basic ...` header. */
function basicFrom(header) {
  const value = String(header || '');
  if (value.slice(0, 6).toLowerCase() !== 'basic ') return null;
  let decoded = '';
  try {
    decoded = Buffer.from(value.slice(6).trim(), 'base64').toString('utf8');
  } catch (err) {
    return null;
  }
  const at = decoded.indexOf(':');
  if (at === -1) return null;
  return { user: decoded.slice(0, at), password: decoded.slice(at + 1) };
}

/**
 * Does this request carry the password or the key?
 * Returns how it got in, or '' for not at all.
 */
function admits(req) {
  const pass = password();
  const k = key();

  const basic = basicFrom(req.headers.authorization);
  if (basic && same(basic.user, user()) && same(basic.password, pass)) return 'password';

  const sent = String(req.headers['x-access-key'] || req.query.key || '').trim();
  if (sent && same(sent, k)) return 'key';

  // The password also works as a key, so one secret covers a person typing it
  // into the box and a widget putting it on the end of an address.
  if (sent && same(sent, pass)) return 'key';

  const cookie = cookieValue(req.headers.cookie, COOKIE);
  if (cookie && same(cookie, cookieToken())) return 'cookie';

  return '';
}

/** Remember a ?key=... visit so the key need not be on every address. */
function remember(req, res) {
  const bits = [
    `${COOKIE}=${cookieToken()}`,
    'Path=/',
    'Max-Age=31536000',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (isSecure(req)) bits.push('Secure');
  res.setHeader('Set-Cookie', bits.join('; '));
}

/**
 * The middleware itself. Put it above everything else the server serves.
 */
function middleware(req, res, next) {
  if (!isLocked()) return next();
  if (ALWAYS_OPEN.indexOf(req.path) !== -1) return next();

  const how = admits(req);
  if (how) {
    if (how === 'key' && req.query.key) remember(req, res);
    return next();
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Breslov Daily", charset="UTF-8"');
  res.setHeader('Cache-Control', 'no-store');
  res.status(401);

  // A browser asking for a page gets something readable behind the password
  // box; anything else gets JSON it can actually parse.
  const wantsHtml = String(req.headers.accept || '').indexOf('text/html') !== -1;
  if (wantsHtml) {
    res.type('html').send([
      '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>Breslov Daily</title>',
      '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;',
      'justify-content:center;background:#fbf1ec;color:#4a3b52;',
      'font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:24px}',
      'main{max-width:22rem;text-align:center}h1{font-size:1.25rem;margin:0 0 .5rem}',
      'p{margin:0;opacity:.75}</style></head><body><main>',
      '<h1>Breslov Daily</h1>',
      '<p>This site is private for now. Enter the password to come in.</p>',
      '</main></body></html>',
    ].join(''));
    return undefined;
  }
  res.json({ error: 'Locked', detail: 'This site is private. A password or key is needed.' });
  return undefined;
}

/** What /api/health reports, so the lock can be confirmed from outside. */
function status() {
  return { locked: isLocked(), keySet: isLocked() && key() !== '' };
}

module.exports = { middleware, isLocked, status, key, ALWAYS_OPEN, COOKIE };
