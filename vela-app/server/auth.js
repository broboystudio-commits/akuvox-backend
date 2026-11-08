'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db } = require('./db');

const COOKIE = 'vela_session';
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function checkPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function createSession(res, userId, secure) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    sha256(token),
    userId,
    Date.now() + SESSION_MS,
  );
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: SESSION_MS,
    path: '/',
  });
}

function destroySession(req, res) {
  const token = req.cookies && req.cookies[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.clearCookie(COOKIE, { path: '/' });
}

const findSession = db.prepare(`
  SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = ? AND s.expires_at > ?
`);

/** Attach req.user (or null) from the session cookie. */
function loadUser(req, _res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  req.user = token ? findSession.get(sha256(token), Date.now()) || null : null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in first.' });
  next();
}

function pruneSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
}

module.exports = {
  hashPassword,
  checkPassword,
  createSession,
  destroySession,
  loadUser,
  requireAuth,
  pruneSessions,
};
