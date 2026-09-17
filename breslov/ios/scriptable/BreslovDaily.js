// Breslov Daily -- iPhone widget
// ---------------------------------------------------------------------------
// This runs in the free "Scriptable" app from the App Store. It puts the
// Hebrew date, the next zman and today's teaching from Rebbe Nachman on your
// home screen or lock screen.
//
// SETUP (about two minutes, no coding):
//   1. Install Scriptable from the App Store.
//   2. Open Scriptable, tap +, and paste this whole file in.
//   3. Tap the settings icon, name it "Breslov Daily", and tap Done.
//   4. Change SERVER on the next line to your own web address.
//   5. Long-press your home screen, tap +, choose Scriptable, pick a size.
//   6. Long-press the new widget, tap "Edit Widget", and set Script to
//      "Breslov Daily".
//
// The Parameter box on that same Edit screen is optional. You can put:
//   - nothing            -> uses the location set in LOCATION below
//   - "here"             -> uses your phone's current location
//   - "40.65,-73.95"     -> uses those coordinates
// ---------------------------------------------------------------------------

const SERVER = 'https://breslov-daily.onrender.com'; // <-- change to your address

// Which zmanim you hold by. Options:
//   'standard'             three stars (8.5 degrees)
//   'rabbeinu-tam'         tzais 72 minutes after sunset
//   'rabbeinu-tam-zmanis'  tzais 72 proportional minutes
//   'magen-avraham'        degree-based alos and tzais (16.1)
//   'geonim'               tzais 7.083 degrees
// The countdown on the widget follows whichever you pick.
const MINHAG = 'standard';

// Used when the widget parameter is empty and location is not available.
const LOCATION = {
  name: 'Brooklyn, NY',
  lat: 40.6501,
  lng: -73.9496,
  tz: 'America/New_York',
};

// ---------------------------------------------------------------------------

const COLORS = {
  bgTop: new Color('#221d33'),
  bgBottom: new Color('#100e17'),
  gold: new Color('#d8a85b'),
  goldSoft: new Color('#a98747'),
  ink: new Color('#ece8f4'),
  inkSoft: new Color('#a9a2bd'),
  inkFaint: new Color('#7a7391'),
};

/** Work out which location to ask about, from the widget's Parameter box. */
async function resolveLocation() {
  const param = (args.widgetParameter || '').trim();

  if (/^here$/i.test(param)) {
    try {
      Location.setAccuracyToHundredMeters();
      const here = await Location.current();
      return {
        name: 'My location',
        lat: here.latitude,
        lng: here.longitude,
        tz: LOCATION.tz,
      };
    } catch (e) {
      return LOCATION; // location refused or unavailable -- fall back quietly
    }
  }

  const coords = param.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (coords) {
    return {
      name: param,
      lat: Number(coords[1]),
      lng: Number(coords[2]),
      tz: LOCATION.tz,
    };
  }

  return LOCATION;
}

/** Ask the server for today's few lines. Falls back to the last saved copy. */
async function loadData() {
  const place = await resolveLocation();
  const url = `${SERVER}/api/widget?lat=${place.lat}&lng=${place.lng}` +
              `&tz=${encodeURIComponent(place.tz)}&name=${encodeURIComponent(place.name)}` +
              `&minhag=${encodeURIComponent(MINHAG)}`;

  const cachePath = cacheFile();
  try {
    const req = new Request(url);
    // A free hosting plan puts the server to sleep when nobody is using it,
    // and waking it takes up to about half a minute. Wait it out rather than
    // falling back to yesterday's times.
    req.timeoutInterval = 35;
    const data = await req.loadJSON();
    saveCache(cachePath, data);
    return { data, stale: false };
  } catch (err) {
    const cached = readCache(cachePath);
    if (cached) return { data: cached, stale: true };
    throw err;
  }
}

function cacheFile() {
  const fm = FileManager.local();
  const dir = fm.joinPath(fm.cacheDirectory(), 'breslov-daily');
  if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
  return fm.joinPath(dir, `widget-${MINHAG}.json`);
}

function saveCache(path, data) {
  try {
    FileManager.local().writeString(path, JSON.stringify(data));
  } catch (e) { /* a full disk should not break the widget */ }
}

function readCache(path) {
  try {
    const fm = FileManager.local();
    if (!fm.fileExists(path)) return null;
    return JSON.parse(fm.readString(path));
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------- drawing

function background(widget) {
  const g = new LinearGradient();
  g.colors = [COLORS.bgTop, COLORS.bgBottom];
  g.locations = [0, 1];
  widget.backgroundGradient = g;
}

function addLine(stack, text, font, color, lines) {
  const t = stack.addText(text || '');
  t.font = font;
  t.textColor = color;
  if (lines) t.lineLimit = lines;
  return t;
}

/** Hebrew reads right to left, so those lines are right-aligned. */
function addHebrew(stack, text, font, color, lines) {
  const t = addLine(stack, text, font, color, lines);
  t.rightAlignText();
  return t;
}

function nextZmanLine(data) {
  if (!data.next) return 'No more zmanim today';
  const mins = data.next.minutesAway;
  let away;
  if (mins < 1) away = 'now';
  else if (mins < 60) away = `in ${mins} min`;
  else away = `in ${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${data.next.label} · ${data.next.time} (${away})`;
}

function buildSmall(data) {
  const w = new ListWidget();
  background(w);
  w.setPadding(14, 14, 14, 14);

  addHebrew(w, data.hebrewDate, Font.semiboldSystemFont(15), COLORS.gold, 1);
  if (data.parsha) addLine(w, data.parsha, Font.systemFont(10), COLORS.inkFaint, 1);

  w.addSpacer(6);

  if (data.next) {
    addLine(w, data.next.label, Font.mediumSystemFont(11), COLORS.inkSoft, 1);
    addLine(w, data.next.time, Font.boldSystemFont(21), COLORS.ink, 1);
  }

  w.addSpacer();

  if (data.teaching) {
    addLine(w, data.teaching.heading, Font.semiboldSystemFont(9), COLORS.goldSoft, 1);
    addLine(w, data.teaching.en, Font.systemFont(10), COLORS.inkSoft, 3);
  }
  return w;
}

function buildMedium(data) {
  const w = new ListWidget();
  background(w);
  w.setPadding(14, 16, 14, 16);

  const top = w.addStack();
  top.centerAlignContent();
  const left = top.addStack();
  left.layoutVertically();
  addLine(left, data.gregorian, Font.systemFont(10), COLORS.inkFaint, 1);
  if (data.parsha) addLine(left, data.parsha, Font.semiboldSystemFont(12), COLORS.ink, 1);
  top.addSpacer();
  const right = top.addStack();
  right.layoutVertically();
  addHebrew(right, data.hebrewDate, Font.semiboldSystemFont(15), COLORS.gold, 1);
  if (data.candles) addLine(right, `Candles ${to12h(data.candles)}`, Font.systemFont(10), COLORS.inkFaint, 1)
    .rightAlignText();

  w.addSpacer(8);
  addLine(w, nextZmanLine(data), Font.mediumSystemFont(12), COLORS.inkSoft, 1);
  w.addSpacer(8);

  if (data.teaching) {
    addLine(w, data.teaching.heading, Font.semiboldSystemFont(10), COLORS.gold, 1);
    addLine(w, data.teaching.en, Font.systemFont(11), COLORS.inkSoft, 3);
  }
  return w;
}

function buildLarge(data) {
  const w = new ListWidget();
  background(w);
  w.setPadding(16, 16, 16, 16);

  const head = w.addStack();
  head.centerAlignContent();
  const hl = head.addStack();
  hl.layoutVertically();
  addLine(hl, data.gregorian, Font.systemFont(10), COLORS.inkFaint, 1);
  if (data.parsha) addLine(hl, `Parshas ${data.parsha}`, Font.semiboldSystemFont(13), COLORS.ink, 1);
  head.addSpacer();
  addHebrew(head, data.hebrewDate, Font.semiboldSystemFont(16), COLORS.gold, 1);

  w.addSpacer(10);

  // A few of the zmanim people actually look for during the day.
  const wanted = ['sunrise', 'sofZmanShmaGRA', 'chatzos', 'minchaKetana', 'sunset', 'tzais'];
  const rows = (data.times || []).filter((t) => wanted.indexOf(t.key) !== -1);
  for (const t of rows) {
    const row = w.addStack();
    row.centerAlignContent();
    const isNext = data.next && data.next.label === t.en;
    addLine(row, t.en, Font.systemFont(11), isNext ? COLORS.gold : COLORS.inkSoft, 1);
    row.addSpacer();
    addLine(row, t.time, isNext ? Font.boldSystemFont(11) : Font.mediumSystemFont(11),
      isNext ? COLORS.gold : COLORS.ink, 1);
    w.addSpacer(3);
  }

  w.addSpacer(8);
  if (data.tehillim) addLine(w, `Tehillim today: ${data.tehillim}`, Font.systemFont(10), COLORS.inkFaint, 1);
  w.addSpacer(8);

  if (data.teaching) {
    addLine(w, data.teaching.heading, Font.semiboldSystemFont(11), COLORS.gold, 1);
    w.addSpacer(3);
    addHebrew(w, data.teaching.he, Font.systemFont(13), COLORS.ink, 3);
    w.addSpacer(3);
    addLine(w, data.teaching.en, Font.systemFont(11), COLORS.inkSoft, 5);
  }
  return w;
}

/** Lock screen: one rectangle, so only the most useful two lines fit. */
function buildAccessoryRectangular(data) {
  const w = new ListWidget();
  w.setPadding(2, 2, 2, 2);
  addHebrew(w, data.hebrewDate, Font.semiboldSystemFont(13), Color.white(), 1);
  if (data.next) {
    addLine(w, `${data.next.label} ${data.next.time}`, Font.systemFont(12), Color.white(), 1);
  }
  if (data.parsha) addLine(w, data.parsha, Font.systemFont(11), Color.white(), 1);
  return w;
}

function buildAccessoryInline(data) {
  const w = new ListWidget();
  const text = data.next ? `${data.next.label} ${data.next.time}` : data.hebrewDateEn;
  addLine(w, text, Font.systemFont(12), Color.white(), 1);
  return w;
}

function buildError(message) {
  const w = new ListWidget();
  background(w);
  w.setPadding(14, 14, 14, 14);
  addLine(w, 'Breslov Daily', Font.semiboldSystemFont(12), COLORS.gold, 1);
  w.addSpacer(4);
  addLine(w, 'Could not reach the server.', Font.systemFont(11), COLORS.ink, 2);
  w.addSpacer(4);
  addLine(w, message, Font.systemFont(9), COLORS.inkFaint, 3);
  w.addSpacer(4);
  addLine(w, 'Check the SERVER address at the top of the script.',
    Font.systemFont(9), COLORS.inkFaint, 3);
  return w;
}

/** "18:41" -> "6:41 PM" */
function to12h(hhmm) {
  if (!hhmm) return '';
  const parts = String(hhmm).split(':');
  const h = Number(parts[0]);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${parts[1]} ${suffix}`;
}

// ---------------------------------------------------------------- run

async function main() {
  let widget;
  try {
    const { data, stale } = await loadData();
    const family = config.widgetFamily || 'medium';

    if (family === 'small') widget = buildSmall(data);
    else if (family === 'large' || family === 'extraLarge') widget = buildLarge(data);
    else if (family === 'accessoryRectangular') widget = buildAccessoryRectangular(data);
    else if (family === 'accessoryInline' || family === 'accessoryCircular') widget = buildAccessoryInline(data);
    else widget = buildMedium(data);

    if (stale && family.indexOf('accessory') !== 0) {
      widget.addSpacer(2);
      addLine(widget, 'saved copy — offline', Font.systemFont(8), COLORS.inkFaint, 1);
    }

    // Tapping the widget opens the full site.
    widget.url = SERVER;
  } catch (err) {
    widget = buildError(String(err && err.message ? err.message : err));
  }

  // Ask iOS to refresh in about 30 minutes, so zmanim stay current.
  widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    await widget.presentMedium(); // preview when you run it inside Scriptable
  }
  Script.complete();
}

await main();
