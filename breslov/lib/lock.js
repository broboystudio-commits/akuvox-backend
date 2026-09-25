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
 *   1. A person     -- a password box on the page itself, which posts to
 *                      /api/unlock and is answered with a cookie.
 *   2. A link       -- ?key=... on the end of any address. The answer sets the
 *                      same cookie, so it only has to be on the address once.
 *   3. A machine    -- the iPhone widgets and the calendar subscription send
 *                      the same key as an X-Access-Key header or ?key=.
 *
 * The password box is drawn on the page rather than left to the browser's own
 * name-and-password dialog. That dialog never appeared on an iPhone: the
 * service worker handles the page request, and no browser raises a credential
 * prompt for a reply that came through a service worker -- so the locked page
 * arrived with nowhere to type. Basic auth is still accepted for anything
 * that sends it, but nothing depends on the browser offering it.
 *
 * /api/health stays open on purpose: Render polls it to decide whether the
 * service is alive, and a locked-out health check would fail every deploy.
 */

const crypto = require('crypto');

/**
 * Addresses that answer even when the site is locked: the health check Render
 * polls, and the form that takes the password.
 */
const ALWAYS_OPEN = ['/api/health', '/api/unlock'];

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

/** Somewhere on this site, and nowhere else -- never an address off it. */
function safeNext(value) {
  const path = String(value || '/');
  if (path.indexOf('/') !== 0 || path.indexOf('//') === 0) return '/';
  return path;
}

/** Does this password open the door? */
function accepts(sent) {
  const given = String(sent || '');
  if (!given || !isLocked()) return false;
  return same(given, password()) || same(given, key());
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
 * The locked page: a password box, drawn here rather than left to the
 * browser. Deliberately one self-contained file with no stylesheet and no
 * script of its own -- everything else on the site is behind the lock, so
 * nothing it could ask for would arrive.
 */
function page(opts) {
  const next = escapeHtml(safeNext(opts.next));
  const wrong = opts.wrong
    ? '<p class="bad">That password did not work. Try again.</p>'
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Breslov Daily</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100svh; display: flex; align-items: center;
    justify-content: center; padding: 24px;
    background: #fbf1ec; color: #2b2530;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
  }
  main { width: 100%; max-width: 21rem; text-align: center; }
  h1 { margin: 0 0 6px; font-size: 1.375rem; letter-spacing: -0.01em; }
  p { margin: 0 0 22px; color: #635b6d; font-size: 0.9375rem; }
  .bad { color: #8a545c; font-weight: 600; }
  input, button { font: inherit; width: 100%; }
  input {
    padding: 14px 18px; border-radius: 999px; border: 1px solid rgba(43,37,48,0.13);
    background: #fffaf7; color: #2b2530; -webkit-appearance: none; appearance: none;
  }
  input:focus-visible { outline: 2px solid #e3a4a8; outline-offset: 2px; }
  button {
    margin-top: 10px; padding: 14px 18px; border: 1px solid rgba(255,255,255,0.72);
    border-radius: 999px; font-weight: 600; color: #8a545c; cursor: pointer;
    background: linear-gradient(135deg, #fadedd, #fbeed2);
    box-shadow: 0 1px 2px rgba(43,37,48,0.05), 0 10px 30px -14px rgba(138,84,92,0.3);
  }
  button:active { transform: scale(0.97); }
  @media (prefers-color-scheme: dark) {
    body { background: #251d31; color: #f6f1f9; }
    p { color: #d2c8dc; }
    .bad { color: #f6ccd4; }
    input { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.12); color: #f6f1f9; }
    button { background: linear-gradient(135deg, rgba(185,129,140,0.28), rgba(201,164,88,0.24));
             border-color: rgba(255,255,255,0.12); color: #f6ccd4; }
  }
</style>
</head>
<body>
<main>
  <h1>Breslov Daily</h1>
  <p>This site is private for now.</p>
  ${wrong}
  <form method="POST" action="/api/unlock">
    <input type="hidden" name="next" value="${next}">
    <input type="password" name="password" autocomplete="current-password"
           autocapitalize="off" autocorrect="off" spellcheck="false"
           enterkeyhint="go" placeholder="Password" aria-label="Password" autofocus>
    <button type="submit">Come in</button>
  </form>
</main>
</body>
</html>`;
}

/** Nothing typed into the address bar may end up inside that page as markup. */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

  // No WWW-Authenticate header, deliberately.
  //
  // That header is what tells a browser "this 401 is mine to handle": it then
  // takes the reply away and puts up its own name-and-password dialog instead
  // of showing the page. In a browser with no way to raise that dialog -- an
  // app on a home screen, or a page answered by a service worker, which is
  // every page here -- the result is a dead end with nothing to type into.
  // Chromium refuses the reply outright with ERR_INVALID_AUTH_CREDENTIALS.
  // Leave the header off and the same 401 renders as an ordinary page, which
  // is where the password box lives. A basic-auth header is still *accepted*
  // from anything that sends one; it is simply never asked for.
  res.setHeader('Cache-Control', 'no-store');
  res.status(401);

  // A browser asking for a page gets something readable behind the password
  // box; anything else gets JSON it can actually parse.
  const wantsHtml = String(req.headers.accept || '').indexOf('text/html') !== -1;
  if (wantsHtml) {
    res.type('html').send(page({ next: req.originalUrl, wrong: false }));
    return undefined;
  }
  res.json({ error: 'Locked', detail: 'This site is private. A password or key is needed.' });
  return undefined;
}

/** What /api/health reports, so the lock can be confirmed from outside. */
function status() {
  return { locked: isLocked(), keySet: isLocked() && key() !== '' };
}

module.exports = { middleware, isLocked, status, key, accepts, remember, page, safeNext, ALWAYS_OPEN, COOKIE };
