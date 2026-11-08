'use strict';

/*
 * The Vela "For You" ranking. Every number here is shown back to the viewer
 * in the "Why am I seeing this?" sheet, so keep it simple and explainable.
 *
 * Viewer settings (Algorithm Control > Your feed):
 *   w_following, w_interests, w_discovery  0-100  mix of the three content sources
 *   engagement_weight                      0-100  how much likes/comments/saves/reposts count
 *   boost_interactions                     0/1    lift creators you interact with
 *
 * Creator settings (Algorithm Control > Your posts), applied to their videos:
 *   reach_adjust             -50..50  multiplies the final score by (1 + reach/100)
 *   followers_first          0/1      non-followers only see a post once it is 15 minutes old
 *   recommend_non_followers  0/1      off = only followers ever see the post
 *   nearby_only              0/1      non-followers must share the creator's area
 *   allow_reposts            0/1      (enforced by the repost endpoint)
 */

const { db, VIDEO_SELECT, toVideoDto } = require('./db');

const FOLLOWERS_FIRST_MS = 15 * 60 * 1000;
const sat = (x, k) => 1 - Math.exp(-x / k); // saturating 0..1 curve

const tagsStmt = db.prepare('SELECT video_id, tag FROM video_tags');

const tagAffinityStmt = db.prepare(`
  SELECT t.tag AS tag, SUM(a.w) AS score FROM (
    SELECT video_id, 1.0 AS w FROM likes    WHERE user_id = @me
    UNION ALL SELECT video_id, 1.5 FROM saves    WHERE user_id = @me
    UNION ALL SELECT video_id, 1.0 FROM comments WHERE user_id = @me
    UNION ALL SELECT video_id, 1.5 FROM reposts  WHERE user_id = @me
    UNION ALL SELECT video_id, 0.2 FROM views    WHERE user_id = @me
  ) a JOIN video_tags t ON t.video_id = a.video_id
  GROUP BY t.tag
`);

const creatorAffinityStmt = db.prepare(`
  SELECT v.user_id AS creator, SUM(a.w) AS score FROM (
    SELECT video_id, 1.0 AS w FROM likes    WHERE user_id = @me
    UNION ALL SELECT video_id, 2.0 FROM comments WHERE user_id = @me
    UNION ALL SELECT video_id, 1.5 FROM saves    WHERE user_id = @me
    UNION ALL SELECT video_id, 2.0 FROM reposts  WHERE user_id = @me
  ) a JOIN videos v ON v.id = a.video_id
  WHERE v.user_id <> @me
  GROUP BY v.user_id
`);

// Small stable per-viewer, per-day shuffle so equal scores don't always tie the same way.
function jitter(viewerId, videoId) {
  const day = Math.floor(Date.now() / 86400000);
  let h = (viewerId * 73856093) ^ (videoId * 19349663) ^ (day * 83492791);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function eligible(row, viewer, now) {
  if (row.following) return true;
  if (!row.recommend_non_followers) return false;
  if (row.followers_first && now - row.created_at < FOLLOWERS_FIRST_MS) return false;
  if (row.nearby_only) {
    const a = (row.author_region || '').trim().toLowerCase();
    const b = (viewer.region || '').trim().toLowerCase();
    if (!a || !b || a !== b) return false;
  }
  return true;
}

function scoreAll(viewer) {
  const me = viewer.id;
  const now = Date.now();

  const rows = db.prepare(`${VIDEO_SELECT} WHERE v.user_id <> @me`).all({ me });

  const tagsByVideo = new Map();
  for (const { video_id, tag } of tagsStmt.all()) {
    if (!tagsByVideo.has(video_id)) tagsByVideo.set(video_id, []);
    tagsByVideo.get(video_id).push(tag);
  }
  const tagAffinity = new Map(tagAffinityStmt.all({ me }).map((r) => [r.tag, r.score]));
  const creatorAffinity = new Map(creatorAffinityStmt.all({ me }).map((r) => [r.creator, r.score]));

  let wF = viewer.w_following;
  let wI = viewer.w_interests;
  let wD = viewer.w_discovery;
  if (wF + wI + wD === 0) wF = wI = wD = 1;
  const wSum = wF + wI + wD;
  const engW = viewer.engagement_weight / 100;
  const boost = !!viewer.boost_interactions;

  const scored = [];
  for (const row of rows) {
    if (!eligible(row, viewer, now)) continue;

    const tags = tagsByVideo.get(row.id) || [];
    let tagSum = 0;
    let topTag = null;
    let topTagScore = 0;
    for (const t of tags) {
      const s = tagAffinity.get(t) || 0;
      tagSum += s;
      if (s > topTagScore) {
        topTagScore = s;
        topTag = t;
      }
    }

    const affinityRaw = creatorAffinity.get(row.user_id) || 0;
    const following = row.following ? 1 : 0;
    const interests = sat(tagSum, 3);
    const discovery = following ? 0 : affinityRaw > 0 ? 0.4 : 1;
    const pop = row.like_count + 2 * row.comment_count + 1.5 * row.save_count + 3 * row.repost_count;
    const engagement = sat(pop, 10);
    const ageHours = Math.max(0, now - row.created_at) / 3600000;
    const freshness = Math.exp(-ageHours / 72);
    const affinity = sat(affinityRaw, 4);

    const mix = (wF * following + wI * interests + wD * discovery) / wSum;
    const base = 0.55 * mix + 0.25 * engW * engagement + 0.2 * freshness + (boost ? 0.25 * affinity : 0);
    const reach = 1 + row.reach_adjust / 100;
    const seen = row.seen_at ? 0.3 : 1;
    const score = base * reach * seen + 0.04 * jitter(me, row.id);

    const reasons = [];
    if (following) reasons.push(`You follow @${row.username}`);
    if (topTag && interests >= 0.15) reasons.push(`Matches your interest in #${topTag}`);
    if (discovery === 1) reasons.push(`New creator for you`);
    if (boost && affinity >= 0.3) reasons.push(`You often interact with @${row.username}`);
    if (engW > 0 && engagement >= 0.5) reasons.push('Popular right now');
    if (freshness >= 0.8) reasons.push('Recently posted');
    if (row.reach_adjust > 0) reasons.push(`Creator boosted reach +${row.reach_adjust}%`);
    if (row.reach_adjust < 0) reasons.push(`Creator lowered reach ${row.reach_adjust}%`);
    if (row.seen_at) reasons.push("You've watched this before, so it ranks lower");

    const round = (x) => Math.round(x * 100) / 100;
    scored.push({
      row,
      score,
      why: {
        score: round(score),
        reasons,
        parts: {
          following: round(following),
          interests: round(interests),
          discovery: round(discovery),
          engagement: round(engagement),
          freshness: round(freshness),
          affinity: round(affinity),
          reach: round(reach),
          seen: !!row.seen_at,
        },
      },
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function forYouFeed(viewer, { exclude = [], limit = 10 } = {}) {
  const skip = new Set(exclude);
  const ranked = scoreAll(viewer).filter((s) => !skip.has(s.row.id));
  return ranked.slice(0, limit).map((s) => ({ ...toVideoDto(s.row, viewer.id), why: s.why }));
}

const followingFeedStmt = db.prepare(`
  SELECT video_id, MAX(ts) AS ts, reposter FROM (
    SELECT v.id AS video_id, v.created_at AS ts, NULL AS reposter
      FROM videos v
      WHERE v.user_id IN (SELECT followee_id FROM follows WHERE follower_id = @me)
    UNION ALL
    SELECT r.video_id, r.created_at, u.username
      FROM reposts r JOIN users u ON u.id = r.user_id
      WHERE r.user_id IN (SELECT followee_id FROM follows WHERE follower_id = @me)
  )
  GROUP BY video_id
  ORDER BY ts DESC
  LIMIT @limit OFFSET @offset
`);

function followingFeed(viewer, { offset = 0, limit = 10 } = {}) {
  const items = followingFeedStmt.all({ me: viewer.id, limit, offset });
  const rows = db
    .prepare(`${VIDEO_SELECT} WHERE v.id IN (SELECT value FROM json_each(@ids))`)
    .all({ me: viewer.id, ids: JSON.stringify(items.map((i) => i.video_id)) });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return items
    .filter((i) => byId.has(i.video_id))
    .map((i) => ({
      ...toVideoDto(byId.get(i.video_id), viewer.id),
      repostedBy: i.reposter || null,
    }));
}

module.exports = { forYouFeed, followingFeed, scoreAll, FOLLOWERS_FIRST_MS };
