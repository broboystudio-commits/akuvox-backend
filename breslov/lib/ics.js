'use strict';

/**
 * A subscribable calendar of daily reminders.
 *
 * Why a calendar rather than a push notification: on an iPhone, web push only
 * works for a site added to the home screen, needs a permission prompt, and is
 * unreliable in practice -- the kind of reminder that quietly stops arriving.
 * A calendar subscription is handled by the phone's own Calendar app, fires
 * whether or not this site has been opened in weeks, survives reinstalling,
 * and works the same on iPhone, Android and a computer.
 *
 * The phone refetches the feed on its own schedule, so each event carries the
 * day's Tehillim and the teaching's name.
 */

const library = require('./library');
const { HDate } = require('@hebcal/core');

/** Escape the characters that have meaning inside an .ics file. */
function escapeText(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** An .ics line may not exceed 75 octets; longer ones continue with a space. */
function fold(line) {
  if (line.length <= 73) return line;
  const parts = [];
  let rest = line;
  parts.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length > 72) {
    parts.push(' ' + rest.slice(0, 72));
    rest = rest.slice(72);
  }
  if (rest.length) parts.push(' ' + rest);
  return parts.join('\r\n');
}

function stamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** A local date-time, written in the feed's own time zone. */
function localStamp(y, m, d, hour, minute) {
  const two = (n) => String(n).padStart(2, '0');
  return `${y}${two(m)}${two(d)}T${two(hour)}${two(minute)}00`;
}

/**
 * Build the feed.
 *
 * @param {object} opts
 * @param {number} opts.hour      hour of the day, 0-23
 * @param {number} opts.minute
 * @param {string} opts.timeZone  IANA zone the reminder should fire in
 * @param {number} opts.days      how many days ahead to write out
 * @param {string} opts.site      address of the app, linked from each event
 */
function buildFeed(opts) {
  const hour = clamp(opts.hour, 0, 23, 7);
  const minute = clamp(opts.minute, 0, 59, 0);
  const days = clamp(opts.days, 1, 120, 60);
  const timeZone = opts.timeZone || 'America/New_York';
  const site = opts.site || '';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Breslov Daily//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText('Breslov Daily')}`,
    `X-WR-CALDESC:${escapeText('A daily reminder to learn and to say Tehillim.')}`,
    `X-WR-TIMEZONE:${escapeText(timeZone)}`,
    // Ask the phone to check back roughly daily.
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
  ];

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let i = 0; i < days; i++) {
    const day = new Date(today.getTime() + i * 86400000);
    const hd = new HDate(day);
    const portions = library.tehillimForDay(hd.getDate(), HDate.daysInMonth(hd.getMonth(), hd.getFullYear()));
    const tehillim = portions.map(library.tehillimLabel).join(' • ');

    const y = day.getFullYear();
    const m = day.getMonth() + 1;
    const d = day.getDate();
    const start = localStamp(y, m, d, hour, minute);
    const end = localStamp(y, m, d, hour, Math.min(minute + 15, 59));

    const description = [
      `Today's Tehillim: ${tehillim}`,
      hd.renderGematriya(),
      site ? `Open the app: ${site}` : '',
    ].filter(Boolean).join('\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:breslov-${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}@breslov-daily`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;TZID=${timeZone}:${start}`,
      `DTEND;TZID=${timeZone}:${end}`,
      fold(`SUMMARY:${escapeText('Breslov Daily — ' + tehillim)}`),
      fold(`DESCRIPTION:${escapeText(description)}`),
      site ? fold(`URL:${escapeText(site)}`) : null,
      'TRANSP:TRANSPARENT',
      // A notification at the time of the event itself.
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:PT0M',
      fold(`DESCRIPTION:${escapeText('Breslov Daily — ' + tehillim)}`),
      'END:VALARM',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');

  // .ics requires CRLF line endings.
  return lines.filter((l) => l !== null).join('\r\n') + '\r\n';
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

module.exports = { buildFeed, escapeText, fold };
