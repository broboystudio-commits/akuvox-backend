'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'vela.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT '',
  w_following INTEGER NOT NULL DEFAULT 60,
  w_interests INTEGER NOT NULL DEFAULT 75,
  w_discovery INTEGER NOT NULL DEFAULT 35,
  engagement_weight INTEGER NOT NULL DEFAULT 80,
  boost_interactions INTEGER NOT NULL DEFAULT 1,
  reach_adjust INTEGER NOT NULL DEFAULT 0,
  followers_first INTEGER NOT NULL DEFAULT 0,
  recommend_non_followers INTEGER NOT NULL DEFAULT 1,
  nearby_only INTEGER NOT NULL DEFAULT 0,
  allow_reposts INTEGER NOT NULL DEFAULT 1,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_videos_user ON videos(user_id);

CREATE TABLE IF NOT EXISTS video_tags (
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (video_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_video_tags_tag ON video_tags(tag);

CREATE TABLE IF NOT EXISTS likes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_likes_video ON likes(video_id);

CREATE TABLE IF NOT EXISTS saves (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_saves_video ON saves(video_id);

CREATE TABLE IF NOT EXISTS reposts (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_reposts_video ON reposts(video_id);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_video ON comments(video_id);

CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id);

CREATE TABLE IF NOT EXISTS views (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (user_id, video_id)
);
`);

// Algorithm defaults, shared by the settings API and the reset button.
const DEFAULT_SETTINGS = Object.freeze({
  w_following: 60,
  w_interests: 75,
  w_discovery: 35,
  engagement_weight: 80,
  boost_interactions: 1,
  reach_adjust: 0,
  followers_first: 0,
  recommend_non_followers: 1,
  nearby_only: 0,
  allow_reposts: 1,
});

/**
 * Shared SELECT for a video plus its counts and the viewer's relationship to it.
 * Bind @me to the viewer's user id (0 when signed out).
 */
const VIDEO_SELECT = `
SELECT
  v.id, v.user_id, v.filename, v.mime, v.caption, v.created_at,
  u.username, u.display_name, u.region AS author_region,
  u.reach_adjust, u.followers_first, u.recommend_non_followers, u.nearby_only, u.allow_reposts,
  (SELECT COUNT(*) FROM likes    x WHERE x.video_id = v.id) AS like_count,
  (SELECT COUNT(*) FROM comments x WHERE x.video_id = v.id) AS comment_count,
  (SELECT COUNT(*) FROM saves    x WHERE x.video_id = v.id) AS save_count,
  (SELECT COUNT(*) FROM reposts  x WHERE x.video_id = v.id) AS repost_count,
  EXISTS (SELECT 1 FROM likes   x WHERE x.video_id = v.id AND x.user_id = @me) AS liked,
  EXISTS (SELECT 1 FROM saves   x WHERE x.video_id = v.id AND x.user_id = @me) AS saved,
  EXISTS (SELECT 1 FROM reposts x WHERE x.video_id = v.id AND x.user_id = @me) AS reposted,
  EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = @me AND f.followee_id = v.user_id) AS following,
  (SELECT w.last_seen FROM views w WHERE w.user_id = @me AND w.video_id = v.id) AS seen_at
FROM videos v
JOIN users u ON u.id = v.user_id
`;

function toVideoDto(row, meId) {
  return {
    id: row.id,
    url: '/media/' + row.filename,
    caption: row.caption,
    createdAt: row.created_at,
    author: {
      username: row.username,
      displayName: row.display_name,
      isMe: row.user_id === meId,
      isFollowing: !!row.following,
    },
    counts: {
      likes: row.like_count,
      comments: row.comment_count,
      saves: row.save_count,
      reposts: row.repost_count,
    },
    liked: !!row.liked,
    saved: !!row.saved,
    reposted: !!row.reposted,
    allowReposts: !!row.allow_reposts,
  };
}

/** Load videos by id, keeping the order of `ids`. */
function videosByIds(ids, meId) {
  if (!ids.length) return [];
  const rows = db
    .prepare(`${VIDEO_SELECT} WHERE v.id IN (SELECT value FROM json_each(@ids))`)
    .all({ me: meId || 0, ids: JSON.stringify(ids) });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.filter((id) => byId.has(id)).map((id) => toVideoDto(byId.get(id), meId));
}

function extractTags(caption) {
  const tags = new Set();
  const re = /#([\p{L}\p{N}_]{1,40})/gu;
  let m;
  while ((m = re.exec(caption)) && tags.size < 10) tags.add(m[1].toLowerCase());
  return [...tags];
}

module.exports = {
  db,
  DATA_DIR,
  UPLOAD_DIR,
  DEFAULT_SETTINGS,
  VIDEO_SELECT,
  toVideoDto,
  videosByIds,
  extractTags,
};
