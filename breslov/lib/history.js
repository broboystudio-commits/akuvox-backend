'use strict';

/**
 * What has already been shown, so it is not shown again.
 *
 * One JSON file of content records, newest last. It exists for three
 * questions the chooser asks every morning:
 *
 *   Has this exact piece been used before?
 *   Which teachers have had a turn lately?
 *   What did today already settle on?
 *
 * The third is why the day's choice persists: opening the app twice must not
 * produce two different נקודות, and the record of what was chosen is what
 * makes the second answer match the first.
 *
 * It is deliberately a file and not a database. The server already keeps its
 * Sefaria cache on this disk and already copes with that disk going away --
 * Render's free plan hands out a fresh one whenever it restarts -- so adding
 * a database to hold a few hundred short records would be new infrastructure
 * bought with nothing. Everything here degrades to "no history yet", which
 * costs a possible repeat and breaks nothing.
 *
 * The record shape is the one a content checklist will need when somebody
 * builds the screen for it:
 *
 *   contentId         stable, derived from the reference
 *   contentType       'inspiration' | 'quick' | 'weekly' | 'yahrzeit'
 *   text              { he, en }
 *   language          which of the two is the teaching itself
 *   teacher           teacher id
 *   source            the sefer
 *   exactReference    the full Sefaria reference
 *   dateShown         ISO date it was chosen for
 *   calendarContext   what the day was
 *   quoting           'quotation' | 'based-on' | 'paraphrase'
 *   used              true once it has actually been served
 *   excluded          set by hand to keep a piece from coming back
 *
 * No screen writes to it yet, and none is being built now. The fields are
 * here so that the one that is built later has them.
 */

const fs = require('fs');
const path = require('path');

const DIR = process.env.HISTORY_DIR || path.join(__dirname, '..', 'data', 'history');
const FILE = path.join(DIR, 'shown.json');

/** How far back the chooser looks. Beyond this a piece may come round again. */
const REMEMBER_DAYS = Number(process.env.HISTORY_DAYS || 400);

/** Kept small enough to read and write without thinking about it. */
const MAX_RECORDS = 4000;

let records = null;

function load() {
  if (records) return records;
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw);
    records = Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    // No file, unreadable file, half-written file: all the same answer.
    // Nothing here is worth failing a request over.
    records = [];
  }
  return records;
}

function save() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const keep = records.slice(-MAX_RECORDS);
    fs.writeFileSync(FILE, JSON.stringify(keep, null, 0));
    records = keep;
  } catch (err) {
    // A read-only disk is not fatal. The day's choice is still correct for as
    // long as this process lives; it simply will not survive a restart.
    if (process.env.DEBUG) console.warn('history write failed:', err.message);
  }
}

/** A stable id for a piece, so the same passage is the same row twice. */
function idFor(contentType, reference) {
  return `${contentType}:${String(reference || '').trim().toLowerCase().replace(/\s+/g, '-')}`;
}

/** What was already chosen for this date and type, if anything. */
function chosenOn(dateIso, contentType) {
  return load().find((r) => r.dateShown === dateIso && r.contentType === contentType) || null;
}

/** Write one down. Replaces an earlier record for the same day and type. */
function record(entry) {
  load();
  const id = entry.contentId || idFor(entry.contentType, entry.exactReference);
  const row = Object.assign({
    contentId: id,
    used: true,
    excluded: false,
    writtenAt: new Date().toISOString(),
  }, entry, { contentId: id });

  const already = records.findIndex(
    (r) => r.dateShown === row.dateShown && r.contentType === row.contentType);
  if (already >= 0) records[already] = row;
  else records.push(row);

  save();
  return row;
}

/** Every record inside the remembering window. */
function recent(days = REMEMBER_DAYS) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return load().filter((r) => (r.dateShown || '') >= cutoff);
}

/**
 * Has this exact piece been shown lately -- or ruled out for good?
 *
 * An exclusion is permanent and ignores the window; a showing only counts
 * while it is still recent, because a teaching from two years ago is not a
 * repeat to anybody.
 */
function seen(contentType, reference, days = REMEMBER_DAYS) {
  const id = idFor(contentType, reference);
  if (load().some((r) => r.contentId === id && r.excluded)) return true;
  return recent(days).some((r) => r.contentId === id);
}

/**
 * When each teacher last had a turn, as a count of days ago.
 *
 * A teacher who has never appeared is Infinity, which is exactly how the
 * rotation should treat them: most overdue of all.
 */
function lastUsed(contentType, days = REMEMBER_DAYS) {
  const today = new Date().toISOString().slice(0, 10);
  const out = new Map();
  for (const r of recent(days)) {
    if (contentType && r.contentType !== contentType) continue;
    if (!r.teacher) continue;
    const ago = Math.round(
      (Date.parse(today) - Date.parse(r.dateShown)) / 86400000);
    const known = out.get(r.teacher);
    if (known === undefined || ago < known) out.set(r.teacher, ago);
  }
  return out;
}

/** For /api/diagnostics: how much is remembered, without printing it all. */
function stats() {
  const all = load();
  const byType = {};
  for (const r of all) byType[r.contentType] = (byType[r.contentType] || 0) + 1;
  return {
    records: all.length,
    byType,
    oldest: all.length ? all[0].dateShown : null,
    newest: all.length ? all[all.length - 1].dateShown : null,
    remembering: REMEMBER_DAYS,
    file: FILE,
  };
}

/** Tests only. */
function forget() { records = []; }

module.exports = {
  idFor, chosenOn, record, recent, seen, lastUsed, stats, forget,
  REMEMBER_DAYS, FILE,
};
