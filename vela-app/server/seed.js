'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, UPLOAD_DIR, extractTags } = require('./db');
const { hashPassword } = require('./auth');

const SEED_DIR = path.join(__dirname, '..', 'seed');

const SEEDS = [
  {
    file: 'welcome.mp4',
    caption: 'Welcome to Vela. Swipe up for the next video and double-tap to like. #welcome #vela',
    ageHours: 2,
  },
  {
    file: 'algorithm.mp4',
    caption:
      'You run the algorithm here. Tap the sliders button at the top left to choose what you see and how far your posts travel. #howto #algorithm',
    ageHours: 3,
  },
  {
    file: 'create.mp4',
    caption: 'Post your first video: tap the upload button, write a caption with hashtags, then hit Post. #howto #create',
    ageHours: 4,
  },
];

/** Make sure the official @vela account and its intro videos exist. Safe to run on every start. */
function seed() {
  let vela = db.prepare('SELECT id FROM users WHERE username = ?').get('vela');
  if (!vela) {
    const info = db
      .prepare(
        `INSERT INTO users (username, display_name, password_hash, is_system, followers_first, created_at)
         VALUES ('vela', 'Vela', ?, 1, 0, ?)`,
      )
      .run(hashPassword(crypto.randomBytes(24).toString('hex')), Date.now());
    vela = { id: info.lastInsertRowid };
  }

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM videos WHERE user_id = ?').get(vela.id);
  if (n > 0) return;

  const insertVideo = db.prepare(
    `INSERT INTO videos (user_id, filename, mime, caption, created_at) VALUES (?, ?, 'video/mp4', ?, ?)`,
  );
  const insertTag = db.prepare('INSERT OR IGNORE INTO video_tags (video_id, tag) VALUES (?, ?)');

  db.transaction(() => {
    for (const s of SEEDS) {
      const src = path.join(SEED_DIR, s.file);
      if (!fs.existsSync(src)) continue;
      const filename = 'seed-' + s.file;
      const dest = path.join(UPLOAD_DIR, filename);
      if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
      const info = insertVideo.run(vela.id, filename, s.caption, Date.now() - s.ageHours * 3600000);
      for (const tag of extractTags(s.caption)) insertTag.run(info.lastInsertRowid, tag);
    }
  })();
}

module.exports = { seed };
