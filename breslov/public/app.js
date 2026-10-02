/* Breslov Daily -- the browser side.
   Plain JavaScript, no build step, no frameworks. */

(function () {
  'use strict';

  /**
   * Bumped whenever index.html changes shape. It must match the data-build
   * attribute on <html>.
   *
   * Why this exists: a service worker can hand the browser a cached
   * index.html from an older deploy while serving this newer app.js. The two
   * do not fit -- this file looks for elements the old page never had -- and
   * startup dies on the first missing one, leaving a page stuck on "Loading".
   * Rather than leave someone with a blank app they cannot fix from a phone,
   * we notice the mismatch, throw away the caches and reload once.
   */
  var BUILD = '69';

  /** The ?healed= marker survives a reload without needing storage, so this
   *  can never turn into a refresh loop. */
  function alreadyHealed() {
    return window.location.search.indexOf('healed=' + BUILD) !== -1;
  }

  function selfHeal() {
    if (alreadyHealed()) return false;

    var jobs = [];
    try {
      if (window.caches && caches.keys) {
        jobs.push(caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        }));
      }
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        jobs.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister(); }));
        }));
      }
    } catch (e) { /* nothing to clear */ }

    Promise.all(jobs)
      .catch(function () { /* clear what we can */ })
      .then(function () {
        // A brand new query string, so nothing in any cache matches it.
        window.location.replace(
          window.location.pathname + '?healed=' + BUILD + '&t=' + Date.now());
      });
    return true;
  }

  var STORE = {
    place: 'bd.place',
    english: 'bd.english',
    fontScale: 'bd.fontScale',
    font: 'bd.font',
    zmanim: 'bd.zmanim',
    theme: 'bd.theme',
    tikkunPlace: 'bd.tikkunPlace',
    reminder: 'bd.reminder',
    lastToday: 'bd.lastToday',
  };

  /** localStorage throws in Private Browsing, so every use is wrapped. */
  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  var DEFAULT_PLACE = { name: 'Brooklyn, NY', lat: 40.6501, lng: -73.9496, tz: 'America/New_York' };

  var state = {
    place: load(STORE.place, DEFAULT_PLACE),
    english: load(STORE.english, true),
    fontScale: load(STORE.fontScale, 1),
    font: load(STORE.font, 'frank'),
    zmanim: load(STORE.zmanim, { minhag: 'standard', showAll: false }),
    theme: load(STORE.theme, null),   // null means follow the phone's own setting
    today: null,
    tikkunChapter: 0,
    panel: 'today',
  };

  var $ = function (id) { return document.getElementById(id); };

  // ------------------------------------------------------------- fonts

  /**
   * Hebrew typefaces to read in.
   *
   * Three of them are served from /fonts on this same server -- see
   * public/fonts/README.md for why they are no longer fetched from Google --
   * and the browser downloads only the one actually chosen, because each
   * @font-face in styles.css names the letters it covers. Each falls back to
   * whatever the device already has, so a slow connection or no signal at all
   * still leaves readable Hebrew rather than empty boxes. "Your device's
   * font" downloads nothing at all.
   */
  var FONTS = {
    frank: {
      label: 'Frank Ruhl — traditional',
      hebrew: "'Frank Ruhl Libre', 'Taamey Frank CLM', 'Frank Ruehl CLM', 'SBL Hebrew', David, 'Times New Roman', serif",
      english: "'Iowan Old Style', Charter, Georgia, 'Times New Roman', serif",
    },
    david: {
      label: 'David — classic',
      hebrew: "'David Libre', David, 'Taamey Frank CLM', 'Times New Roman', serif",
      english: "'Iowan Old Style', Charter, Georgia, 'Times New Roman', serif",
    },
    modern: {
      label: 'Heebo — modern',
      hebrew: "'Heebo', 'Arial Hebrew', 'Noto Sans Hebrew', system-ui, sans-serif",
      english: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif",
    },
    system: {
      label: "Your device's font",
      hebrew: "'SBL Hebrew', 'Taamey Frank CLM', 'Arial Hebrew', David, 'Times New Roman', serif",
      english: "'Iowan Old Style', Charter, Georgia, 'Times New Roman', serif",
    },
  };

  function applyFont() {
    var font = FONTS[state.font] || FONTS.frank;
    document.documentElement.style.setProperty('--hebrew', font.hebrew);
    document.documentElement.style.setProperty('--serif', font.english);
  }

  function setUpFontChoice() {
    var select = $('fontChoice');
    if (!select) return;
    select.textContent = '';
    Object.keys(FONTS).forEach(function (key) {
      var option = el('option', null, FONTS[key].label);
      option.value = key;
      if (key === state.font) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener('change', function () {
      state.font = select.value;
      save(STORE.font, state.font);
      applyFont();
    });
  }

  // ------------------------------------------------------------- theme

  function systemTheme() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark' : 'light';
    } catch (e) { return 'light'; }
  }

  /** The theme actually in force: the saved choice, else the phone's. */
  function activeTheme() {
    return state.theme || systemTheme();
  }

  function applyTheme() {
    var theme = activeTheme();
    var root = document.documentElement;
    // Throw the switch with every transition off, then turn them back on a
    // frame later. Each control eases its own colour, which is right when one
    // control changes and wrong when the whole page does: without this, going
    // dark dragged every pill, tab and card through a fifth of a second of
    // colours belonging to neither theme.
    root.classList.add('theme-switching');
    root.setAttribute('data-theme', theme);
    // Reading a layout property forces the browser to apply both the class
    // and the attribute now, so the frame that follows has nothing to ease.
    void root.offsetHeight;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { root.classList.remove('theme-switching'); });
    });
    // Keep the iPhone status bar and the PWA chrome in step with the page.
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#14101a' : '#fdfbf9');
    var btn = $('themeBtn');
    if (btn) {
      btn.setAttribute('aria-label',
        theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      btn.setAttribute('aria-checked', String(theme === 'dark'));
    }
  }

  function toggleTheme() {
    state.theme = activeTheme() === 'dark' ? 'light' : 'dark';
    save(STORE.theme, state.theme);
    applyTheme();
  }

  // ------------------------------------------------------------- requests

  function query() {
    var p = state.place || DEFAULT_PLACE;
    var tz = p.tz;
    if (!tz) {
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { tz = DEFAULT_PLACE.tz; }
    }
    var parts = [
      'lat=' + encodeURIComponent(p.lat),
      'lng=' + encodeURIComponent(p.lng),
      'tz=' + encodeURIComponent(tz),
      'name=' + encodeURIComponent(p.name || ''),
    ];
    var z = state.zmanim || {};
    if (z.minhag) parts.push('minhag=' + encodeURIComponent(z.minhag));
    if (z.showAll) parts.push('showAll=true');
    // Per-line choices override the preset.
    ['alos', 'misheyakir', 'tzais', 'sofZmanShmaMGA', 'sofZmanTfilaMGA'].forEach(function (k) {
      if (z[k]) parts.push(k + '=' + encodeURIComponent(z[k]));
    });
    return parts.join('&');
  }

  function api(path) {
    var url = '/api/' + path + (path.indexOf('?') === -1 ? '?' : '&') + query();
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('Request failed (' + r.status + ')');
      return r.json();
    });
  }

  // ------------------------------------------------------------- building nodes

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /**
   * Hebrew marked as Hebrew, wherever it ends up.
   *
   * Without lang="he" a screen reader keeps whatever voice the page declared
   * -- English -- and reads לִקּוּטֵי מוֹהֲרַ״ן letter by letter, as "lamed, qof,
   * ..." or as nothing at all. Forty-seven separate runs of Hebrew on the
   * page were unmarked: the date, every psalm, every lesson, every guest's
   * name. The <html lang="en"> is right for the app's own words, so the
   * marking has to go on the Hebrew itself.
   *
   * It is done by sweeping the page rather than at each of the fifty-odd
   * places that write Hebrew into it, because the last two times something
   * had to be remembered at every call site -- the Ushpizin line in the
   * widgets, and the arguments to unavailableNotice -- it was forgotten at
   * some of them. A sweep cannot be forgotten at a call site that does not
   * exist yet.
   *
   * Only the element that directly holds the Hebrew text is marked, never an
   * ancestor: a row reading "Chesed · חֶסֶד" would otherwise have its English
   * half declared Hebrew too.
   */
  var HEBREW_LETTERS = /[\u0590-\u05FF\uFB1D-\uFB4F]/;

  function markHebrew(root) {
    var scope = root && root.querySelectorAll ? root : document.body;
    if (!scope) return;
    var all = [scope].concat([].slice.call(scope.querySelectorAll('*')));
    for (var i = 0; i < all.length; i++) {
      var node = all[i];
      if (node.nodeType !== 1 || node.lang === 'he') continue;
      var own = false;
      for (var k = 0; k < node.childNodes.length; k++) {
        var child = node.childNodes[k];
        if (child.nodeType === 3 && HEBREW_LETTERS.test(child.nodeValue)) { own = true; break; }
      }
      if (!own) continue;
      node.setAttribute('lang', 'he');
      // Only where the page is not already laying it out right-to-left, so
      // this never reorders a line that was reading correctly before.
      var dir = node.getAttribute('dir');
      if (!dir) {
        var flow = window.getComputedStyle ? getComputedStyle(node).direction : 'ltr';
        if (flow === 'rtl') node.setAttribute('dir', 'rtl');
      }
    }
  }

  /**
   * ...and it keeps up with the page on its own.
   *
   * Everything here is drawn after the fact, from the API, so a single sweep
   * at startup would mark an empty page. The observer runs the sweep again
   * whenever nodes or text change, once per frame -- it watches childList and
   * characterData only, so the lens sliding along the number bar (which moves
   * by changing a style attribute, many times a second) does not wake it.
   */
  function watchForHebrew() {
    if (!window.MutationObserver) return;
    var pending = false;
    var observer = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; markHebrew(document.body); });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    markHebrew(document.body);
  }

  function fill(node, child) {
    if (!node) return;
    node.textContent = '';
    if (child) node.appendChild(child);
  }

  /** Set text on an element that may not exist in this version of the page. */
  function setText(id, text) {
    var node = $(id);
    if (node) node.textContent = text == null ? '' : text;
  }

  /**
   * Replace an element's contents by id.
   *
   * Every one of these used to be written as a bare
   * document.getElementById(...).appendChild(...). If the markup and this
   * script ever drift apart -- which happens for a few seconds during a
   * deploy, while the browser still holds the previous page -- the first one
   * to hit a missing element threw, and everything below it never rendered.
   * That is the half-drawn page with empty cards. Guarded, the worst case is
   * one missing section instead of the whole screen.
   */
  function fillWith(id, child) {
    var node = $(id);
    if (!node) return;
    node.textContent = '';
    if (child) node.appendChild(child);
  }

  function setHidden(id, hidden) {
    var node = $(id);
    if (node) node.hidden = !!hidden;
  }

  function on(id, event, handler) {
    var node = $(id);
    if (node) node.addEventListener(event, handler);
  }

  /**
   * Sefaria hands back an array of lines. What that array *means* depends on
   * the text: Tehillim comes one verse per entry, a lesson in Likutei Moharan
   * comes one paragraph per entry.
   *
   * Rendering a psalm as one paragraph per verse looks broken -- a column of
   * short disconnected lines. So we tell the two apart by shape: many short
   * lines are verses and flow together with small verse numbers; longer lines
   * are paragraphs and keep their breaks.
   */
  function looksLikeVerses(lines) {
    if (!lines || lines.length < 4) return false;
    var total = 0;
    for (var i = 0; i < lines.length; i++) total += String(lines[i]).length;
    return (total / lines.length) < 190;
  }

  function versesBlock(lines, className, startVerse) {
    var first = startVerse || 1;
    var wrap = el('div', className + ' is-verses');
    var para = el('p');
    lines.forEach(function (line, i) {
      var text = String(line).trim();
      if (!text) return;
      if (i > 0) para.appendChild(document.createTextNode(' '));
      para.appendChild(el('span', 'vnum', String(first + i)));
      para.appendChild(document.createTextNode(' ' + text));
    });
    wrap.appendChild(para);
    return wrap;
  }

  function paragraphBlock(lines, className) {
    var wrap = el('div', className);
    lines.forEach(function (line) {
      String(line).split(/\n{2,}/).forEach(function (chunk) {
        var t = chunk.trim();
        if (t) wrap.appendChild(el('p', null, t));
      });
    });
    return wrap;
  }

  function textBlock(lines, className, startVerse) {
    var clean = (lines || []).map(function (l) { return String(l).trim(); })
                             .filter(function (l) { return l.length > 0; });
    if (!clean.length) return null;
    return looksLikeVerses(clean)
      ? versesBlock(clean, className, startVerse)
      : paragraphBlock(clean, className);
  }

  /**
   * Said where the English would be, when there is no English.
   *
   * Sefaria has not had every sefer translated -- Likutei Halachot, where a
   * search for a chag most often lands, is almost entirely Hebrew. The app
   * now steps past an untranslated piece where it can; where it cannot, the
   * card says so in a line instead of ending in a block of Hebrew and no
   * explanation. Nothing is ever translated here: an invented translation of
   * Torah is worse than none.
   */
  function noTranslation() {
    return el('p', 'no-en',
      'Sefaria has no English for this piece yet, so only the Hebrew is here. ' +
      'Nothing is translated by this app.');
  }

  /**
   * Does this piece need the "no English" line under it?
   *
   * Only the question of whether a translation exists is asked here, not
   * whether English is switched on: the switch is a class on <body> and the
   * page is not re-drawn when it flips, so the line is always put in and CSS
   * hides it along with the English it stands in for.
   */
  function wantsEnglish(data) {
    return !!data && data.translated === false;
  }

  /** One passage: Hebrew, then English, then the credit line. */
  function passage(data, label) {
    var box = el('div', 'passage');
    if (label) box.appendChild(el('div', 'passage-label', label));

    var he = textBlock(data.hebrew, 'he', data.startVerse);
    if (he) box.appendChild(he);
    var en = textBlock(data.english, 'en', data.startVerse);
    if (en) box.appendChild(en);
    else if (wantsEnglish(data)) box.appendChild(noTranslation());

    var bits = [];
    if (data.credit) {
      if (data.credit.hebrew) bits.push('Hebrew: ' + data.credit.hebrew);
      if (data.credit.english) bits.push('Translation: ' + data.credit.english);
      if (data.credit.license) bits.push('License: ' + data.credit.license);
    }
    var src = el('div', 'source');
    src.appendChild(document.createTextNode(bits.join(' · ')));
    if (data.url) {
      src.appendChild(document.createElement('br'));
      var a = el('a', null, 'Read the full text on Sefaria →');
      a.href = data.url;
      a.target = '_blank';
      a.rel = 'noopener';
      src.appendChild(a);
    }
    box.appendChild(src);
    return box;
  }

  /** Shown when the server could not reach Sefaria. We never invent text. */
  /**
   * What someone sees when something did not load.
   *
   * Not what went wrong -- what to do next. The three places this is used
   * were passing `err.message` straight onto the screen, so a reader who
   * lost signal in the middle of the Tikkun was shown "Failed to fetch", or
   * "Unexpected token < in JSON at position 0", or an HTTP status line. None
   * of those is addressed to them. They are addressed to me, and they belong
   * in the console and in /api/diagnostics, which is where they go now.
   *
   * And there is a way out of it. A message with no button leaves someone
   * with nothing to do but reload the whole app and lose their place.
   */
  /**
   * A placeholder shaped like the thing that is coming.
   *
   * A spinner says "wait"; this says "a paragraph of Hebrew is about to
   * appear, roughly this long". The page does not jump when the words land,
   * because they land on the lines that were already there.
   */
  function textSkeleton(lines) {
    var box = el('div', 'skeleton');
    box.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < (lines || 6); i++) box.appendChild(el('span'));
    return box;
  }

  function unavailableNotice(what, detail, retry) {
    // `what` is the name of the thing, in words, and nothing else. Four
    // callers were left passing the failed payload here when the arguments
    // changed, which put "could not load the [object Object]" on the page --
    // the exact thing this function was written to stop. Caught by a check
    // that drives a failed answer through each panel and reads the screen.
    if (typeof what !== 'string') what = 'page';
    if (detail) console.warn('[breslov] ' + what + ' failed:', detail);

    var box = el('div', 'notice');
    box.appendChild(el('strong', null, 'We could not load the ' + what + '.'));
    box.appendChild(document.createTextNode(
      'It comes from Sefaria, and nothing is shown here unless it arrives from ' +
      'there. Your place in the app is safe.'
    ));
    if (typeof retry === 'function') {
      var again = el('button', 'btn notice-retry', 'Try again');
      again.type = 'button';
      again.addEventListener('click', function () {
        again.disabled = true;
        again.textContent = 'Trying…';
        retry();
      });
      box.appendChild(again);
    }
    return box;
  }

  // ------------------------------------------------------------- panels

  function renderToday(data) {
    state.today = data;
    save(STORE.lastToday, data);

    var cal = data.calendar;

    // ---- the header
    setText('hebDate', cal.hebrew.gematriya || cal.hebrew.en);
    setText('gregDate', cal.gregorian.display);
    setText('placeBtn', cal.place.name);
    setText('aboutPlace', cal.place.name);

    var next = data.zmanim.next;
    var nz = $('nextZman');
    if (next && nz) {
      nz.hidden = false;
      nz.textContent = '';
      nz.appendChild(document.createTextNode('Next · '));
      nz.appendChild(el('span', 'label', next.en));
      nz.appendChild(document.createTextNode(' '));
      nz.appendChild(el('span', 'he', next.he));
      nz.appendChild(document.createTextNode(' · ' + next.time + ' '));
      nz.appendChild(el('span', 'away', friendlyMinutes(next.minutesAway)));
    } else if (nz) {
      nz.hidden = true;
    }

    // ---- the date, as a line of type above the teaching
    setText('heroGreg', cal.gregorian.long || cal.gregorian.display);
    setText('heroHeb', cal.hebrew.gematriya || cal.hebrew.en);

    // Only what is true of *today*. The calendar hands back a week or so of
    // upcoming yomim tovim, and showing all of them buried the date under a
    // wall of chips; the ones still to come belong on the Shabbos card.
    // One line of words, not a row of coloured pills. What today is, said
    // the way you would say it: "Sukkos · Parashas Bereishis".
    var today = cal.gregorian.iso;
    var saying = [];
    (cal.today || [])
      .filter(function (h) {
        return h.en.indexOf('Candle') !== 0 && h.en.indexOf('Havdalah') !== 0;
      })
      .slice(0, 2)
      .forEach(function (h) { saying.push(h.en); });
    if (cal.parsha) saying.push('Parashas ' + cal.parsha.en);
    setText('heroChips', saying.join(' · '));

    // ---- the נקודה, and the Quick Torah that used to sit here
    renderNekuda(data.inspiration);
    renderQuickTorah(data.spark);

    // ---- the next few zmanim
    setText('upcomingPlace', cal.place.name);
    var chosen = (data.zmanim.times || []).filter(function (t) { return t.isChosen; });
    var idx = next ? chosen.findIndex(function (t) { return t.key === next.key; }) : -1;
    // Show the next one plus the three after it; near the end of the day,
    // show the last few instead of an empty list.
    var from = idx >= 0 ? idx : Math.max(0, chosen.length - 4);
    var soon = chosen.slice(from, from + 4);

    var up = document.createDocumentFragment();
    soon.forEach(function (t) {
      var isNext = next && next.key === t.key;
      var row = el('div', 'up-row' + (isNext ? ' is-next' : ''));
      var left = el('div');
      left.appendChild(el('div', 'up-name', t.en));
      left.appendChild(el('div', 'up-he', t.he));
      row.appendChild(left);
      var right = el('div', 'up-time', t.time);
      if (isNext) right.appendChild(el('span', 'up-away', friendlyMinutes(next.minutesAway)));
      row.appendChild(right);
      up.appendChild(row);
    });
    fillWith('upcoming', up);

    // ---- what there is to do today, as rows
    renderTodayRows(data);
    renderMoreToday(cal);

    // ---- Shabbos
    setText('parshaTag', cal.parsha ? cal.parsha.en : '');
    var rows = [];
    if (cal.parsha) rows.push(['Parsha', cal.parsha.en + (cal.parsha.isDouble ? ' (double)' : '')]);
    if (cal.candles) rows.push(['Candle lighting', clock(cal.candles.time) + ' · ' + prettyDate(cal.candles.date)]);
    if (cal.havdalah) rows.push(['Havdalah', clock(cal.havdalah.time) + ' · ' + prettyDate(cal.havdalah.date)]);
    // The yomim tovim still to come are NOT folded in here any more. They
    // used to be appended to the same list as the candle lighting, which put
    // "Sun, Oct 12 — Sukkos" directly under "Havdalah 7:16 PM" as though the
    // two were the same kind of fact, and then the Shabbos page repeated the
    // whole list again under a heading of its own. They are their own section
    // now, below.
    var coming = (cal.holidays || []).filter(function (h) {
      if (h.date === today) return false;                // already said above
      return h.en.indexOf('Candle') !== 0 && h.en.indexOf('Havdalah') !== 0;
    });
    // Built fresh for each place it goes: a fragment can only be put into the
    // page once, and the same Shabbos belongs on the weekly page too.
    function shabbosRows() {
      var kv = document.createDocumentFragment();
      rows.forEach(function (r) {
        var row = el('div', 'kv-row');
        row.appendChild(el('span', 'k', r[0]));
        row.appendChild(el('span', 'v', r[1]));
        kv.appendChild(row);
      });
      return kv;
    }
    fillWith('shabbosTimes', shabbosRows());
    fillWith('weeklyShabbos', shabbosRows());
    fillWith('shabbosFull', shabbosRows());
    renderComingUp(coming);
    setText('shabbosParsha', cal.parsha
      ? 'Parashas ' + cal.parsha.en + (cal.parsha.isDouble ? ' (double)' : '') : '');
    setText('weekSub', cal.parsha ? 'Parashas ' + cal.parsha.en : '');
    setText('rowShabbos', cal.candles
      ? 'Candles ' + clock(cal.candles.time) : 'candle lighting and havdalah');
    setText('weeklyParshaTag', cal.parsha ? (cal.parsha.he || cal.parsha.en) : '');

    renderYahrzeits(data.yahrzeits);
    renderUshpizin(data.ushpizin);
    renderZmanim(data.zmanim, cal);
    renderWeekly(data.weekly);
    renderTehillim(data.tehillim);
  }

  /**
   * Whoever's yahrzeit it is today.
   *
   * Shown from nightfall, because that is when the Jewish day turns and when
   * a yahrzeit begins. The passage under it, when there is one, is a real
   * piece of that tzaddik's own sefer fetched from Sefaria like everything
   * else here -- and where his sefer is not on Sefaria there is no passage,
   * rather than words he never said.
   */
  /**
   * The day's guest, on the seven days of Sukkos.
   *
   * On three of those days the two minhagim name a different guest, and the
   * card says so rather than choosing for you. Showing one order silently is
   * the one thing it must not do: somebody holding the other has no way to
   * know a choice was made on their behalf.
   */
  /**
   * The נקודה: the first meaningful thing on the screen, and text first.
   *
   * The Hebrew is the teaching, so the Hebrew is what is set large. The
   * English sits under it when the reader has asked for it -- that switch is
   * in Settings and there is deliberately no second one here, because two
   * controls for one thing is how people stop trusting either.
   *
   * Under the teaching, a quiet line saying where it is from. It is a button
   * only when there is somewhere to go.
   */
  function renderNekuda(nekuda) {
    var body = $('nekudaBody');
    var source = $('nekudaSource');
    if (!body) return;

    if (!nekuda || !nekuda.available) {
      setText('nekudaWhy', '');
      setHidden('nekudaSource', true);
      fill(body, unavailableNotice('today\'s teaching', nekuda && nekuda.reason, refresh));
      return;
    }

    // Why this, today. One line, and only when there is a reason worth
    // giving -- an ordinary weekday says nothing rather than saying
    // "an ordinary weekday".
    var ctx = nekuda.context || {};
    setText('nekudaWhy', ctx.kind === 'yomtov' || ctx.kind === 'occasion'
      ? 'For ' + ctx.label
      : (ctx.parsha ? 'From the week of ' + ctx.parsha.en : ''));

    var wrap = document.createDocumentFragment();
    if (nekuda.snippetHe) wrap.appendChild(el('p', 'nekuda-he he', nekuda.snippetHe));
    if (nekuda.snippetEn) wrap.appendChild(el('p', 'nekuda-en', nekuda.snippetEn));
    else if (wantsEnglish(nekuda)) wrap.appendChild(noTranslation());
    fill(body, wrap);

    // "Based on Keter Shem Tov · 84" when a talmid wrote it down,
    // "Likutei Moharan · Torah 24" when the rebbe wrote it himself.
    var where = nekuda.source || {};
    var line = [];
    if (nekuda.quoting === 'based-on') line.push('Based on');
    if (where.sefer) line.push(where.sefer);
    var tail = where.place ? ' · ' + where.place : '';
    if (source) {
      source.textContent = (line.join(' ') || nekuda.ref) + tail;
      source.hidden = false;
      source.disabled = false;
    }

    // The whole piece, folded away until it is asked for.
    fill($('nekudaFull'), passage(nekuda));
    setHidden('nekudaFull', true);
  }

  /** Quick Torah, which is what the old "a word for today" became. */
  function renderQuickTorah(spark) {
    if (!spark || !spark.available) {
      setText('torahRef', '');
      fill($('torahBody'), unavailableNotice('Quick Torah', spark && spark.reason, refresh));
      setHidden('torahFullBtn', true);
      return;
    }
    setText('torahRef', spark.heading || spark.ref);
    setText('rowTorah', spark.heading || spark.ref);
    setText('aboutSpark', spark.heading || spark.ref);

    var v = document.createDocumentFragment();
    if (spark.snippetHe) v.appendChild(el('p', 'verse-he he', spark.snippetHe));
    if (spark.snippetEn) v.appendChild(el('p', 'verse-en', spark.snippetEn));
    else if (wantsEnglish(spark)) v.appendChild(noTranslation());
    fill($('torahBody'), v);

    fill($('torahFull'), passage(spark));
    setHidden('torahFull', true);
    var btn = $('torahFullBtn');
    if (btn) { btn.hidden = false; btn.textContent = 'Read the whole lesson'; }

  }

  /**
   * Today at a glance: four rows, not a wall of cards.
   *
   * Each one says what it is and what is actually in it today -- "Tehillim
   * 104–105", not "today's portion" -- because a row that cannot tell you
   * anything before you tap it is a button with extra steps.
   */
  function renderTodayRows(data) {
    var into = $('todayRows');
    if (!into) return;

    var rows = [];
    if (data.tehillim && data.tehillim.available) {
      rows.push(['tehillim', "Today's Tehillim", data.tehillim.label]);
      setText('rowTehillim', data.tehillim.label);
    } else {
      rows.push(['tehillim', "Today's Tehillim", 'the day\'s portion']);
    }
    rows.push(['tikkun', 'Tikkun HaKlali', resumeLine()]);
    if (data.spark && data.spark.available) {
      rows.push(['torah', 'Quick Torah', data.spark.heading || data.spark.ref]);
    }
    if (data.weekly && data.weekly.available) {
      rows.push(['weekly', 'Dvar Torah', data.weekly.mode === 'yomtov'
        ? 'for ' + data.weekly.yomTov
        : 'for Parashas ' + (data.weekly.parsha || '')]);
      setText('rowWeekly', data.weekly.mode === 'yomtov'
        ? 'for ' + data.weekly.yomTov : 'for Parashas ' + (data.weekly.parsha || ''));
    }

    var frag = document.createDocumentFragment();
    rows.forEach(function (r) {
      var b = el('button', 'row');
      b.type = 'button';
      b.setAttribute('data-goto', r[0]);
      var main = el('span', 'row-main');
      main.appendChild(el('span', 'row-title', r[1]));
      if (r[2]) main.appendChild(el('span', 'row-sub', r[2]));
      b.appendChild(main);
      b.appendChild(el('span', 'row-go'));
      b.addEventListener('click', function () { showPanel(r[0]); });
      frag.appendChild(b);
    });
    fill(into, frag);
  }

  /**
   * The one or two things that are true of today and of no other day.
   *
   * This is deliberately not a place for everything the calendar knows. The
   * rows above already say what there is to read; a yom tov already names
   * itself in the line under the date. What is left is the small number of
   * facts that change what somebody does today and are not written anywhere
   * else on the screen: the Omer, which is counted out loud for forty-nine
   * nights running, and when a fast begins and ends.
   *
   * Two at most, and the section hides itself when there are none. A "more"
   * heading over an empty box is worse than no heading.
   */
  function renderMoreToday(cal) {
    var into = $('moreTodayBody');
    var section = $('moreToday');
    if (!into || !section) return;

    var items = [];

    if (cal.omer && cal.omer.day) {
      // "Thirty-three days, which are four weeks and five days" -- the way it
      // is actually counted, not just a number.
      var count = cal.omer.day + (cal.omer.day === 1 ? ' day' : ' days');
      var parts = [];
      if (cal.omer.weeks) {
        parts.push(cal.omer.weeks + (cal.omer.weeks === 1 ? ' week' : ' weeks'));
      }
      if (cal.omer.days) {
        parts.push(cal.omer.days + (cal.omer.days === 1 ? ' day' : ' days'));
      }
      var said = cal.omer.weeks && parts.length > 1
        ? count + ', which are ' + parts.join(' and ')
        : count;
      items.push({ k: 'Sefiras HaOmer', v: said, he: cal.omer.he });
    }

    if (cal.fast && (cal.fast.begins || cal.fast.ends)) {
      var when = [];
      if (cal.fast.begins) when.push('begins ' + clock(cal.fast.begins));
      if (cal.fast.ends) when.push('ends ' + clock(cal.fast.ends));
      items.push({ k: 'The fast', v: when.join(' · '), he: '' });
    }

    if (!items.length) { section.hidden = true; fill(into, document.createDocumentFragment()); return; }

    var frag = document.createDocumentFragment();
    items.slice(0, 2).forEach(function (it) {
      var row = el('div', 'kv-row');
      row.appendChild(el('span', 'k', it.k));
      var v = el('span', 'v', it.v);
      if (it.he) {
        v.appendChild(document.createTextNode(' '));
        v.appendChild(el('span', 'he', it.he));
      }
      row.appendChild(v);
      frag.appendChild(row);
    });
    var kv = el('div', 'kv');
    kv.appendChild(frag);
    fill(into, kv);
    section.hidden = false;
  }

  /**
   * What the calendar has coming, on the Shabbos page.
   *
   * A week or so forward, which is as far as anybody plans. Each one is a row
   * rather than a line in a table of times, because a yom tov is a day and
   * not a reading off a clock -- and because the section was in the markup
   * with nothing ever put into it, so on most weeks the page simply ended
   * early and on the rest it said the same thing twice.
   */
  function renderComingUp(coming) {
    var strip = $('yomTovStrip');
    var into = $('yomTovList');
    if (!strip || !into) return;

    if (!coming || !coming.length) {
      strip.hidden = true;
      fill(into, document.createDocumentFragment());
      return;
    }

    var frag = document.createDocumentFragment();
    coming.slice(0, 6).forEach(function (h) {
      var row = el('div', 'row is-plain');
      var main = el('span', 'row-main');
      main.appendChild(el('span', 'row-title', h.en));
      var sub = prettyDate(h.date);
      if (h.he) sub += ' · ';
      main.appendChild(el('span', 'row-sub', sub));
      if (h.he) main.lastChild.appendChild(el('span', 'he', h.he));
      row.appendChild(main);
      frag.appendChild(row);
    });
    fill(into, frag);
    strip.hidden = false;
  }

  /** Where the Tikkun was left, said in words. */
  function resumeLine() {
    var at = load(STORE.tikkunPlace, null);
    if (at && at.index > 0) return 'you stopped at ' + (at.index + 1) + ' of 10';
    return 'ten psalms, in order';
  }

  /**
   * The month's yahrzeits, as rows.
   *
   * Only the built-in figures, and only the ones whose date is settled: a
   * yahrzeit on the wrong day is worse than no yahrzeit, so where the
   * sources disagree the name is left out of the list rather than guessed
   * at. The names here are the ones that are not in doubt.
   */
  /**
   * A number wheel, the way a phone picks a number.
   *
   * The horizontal strip this replaces was ten 27px targets with a lens
   * sliding along them. It was called ugly more than once and the complaint
   * was right: that is a control from a settings screen, not something you
   * pick a psalm with.
   *
   * Three rows at a time, the chosen one in the middle, the ones either side
   * smaller and fainter so the eye knows which is chosen without anything
   * being drawn round it.
   *
   * The scrolling is the browser's own, which is the whole point: momentum,
   * rubber-banding at the ends and the feel of the platform come free and
   * cannot be imitated convincingly in script. Snapping is CSS. What is left
   * for JavaScript is reading which number is in the middle.
   */
  function numberWheel(numbers, options) {
    var opts = options || {};
    var wrap = el('div', 'wheel');
    var list = el('div', 'wheel-list');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', opts.label || 'Choose a number');
    list.tabIndex = 0;

    var items = numbers.map(function (n, i) {
      var item = el('button', 'wheel-item', String(n));
      item.type = 'button';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      item.setAttribute('data-index', String(i));
      list.appendChild(item);
      return item;
    });

    wrap.appendChild(list);
    // Two hairlines marking the middle, not a box: the chosen number is
    // already the biggest and darkest thing in the wheel.
    wrap.appendChild(el('div', 'wheel-rails'));

    var chosen = -1;
    var settling = 0;
    // Set while the wheel is being moved by something other than a finger --
    // the page scrolling past a psalm, say. Without it the two chase each
    // other: the page turns the wheel, the wheel reports a pick, the pick
    // scrolls the page, and a smooth scroll through five psalms leaves the
    // wheel wherever the race finished rather than where it was sent.
    var quiet = false;

    function paint() {
      var box = list.getBoundingClientRect();
      if (!box.height) return;
      var middle = box.top + box.height / 2;
      var near = 0;
      var gap = Infinity;
      items.forEach(function (item, i) {
        var r = item.getBoundingClientRect();
        var away = Math.abs((r.top + r.height / 2) - middle);
        if (away < gap) { gap = away; near = i; }
        // One row away is faded and a little smaller; two away is nearly
        // gone. The falloff is what makes it read as a wheel.
        var steps = Math.min(3, away / Math.max(1, r.height));
        item.style.setProperty('--near', String(Math.max(0, 1 - steps)));
      });
      items.forEach(function (item, i) {
        item.classList.toggle('is-chosen', i === near);
        item.setAttribute('aria-selected', String(i === near));
      });
      if (near !== chosen) {
        chosen = near;
        if (opts.onMove) opts.onMove(numbers[near], near);
      }
    }

    function centre(index, how) {
      var item = items[index];
      if (!item) return;
      var to = item.offsetTop - (list.clientHeight - item.offsetHeight) / 2;
      try { list.scrollTo({ top: to, behavior: how || 'smooth' }); }
      catch (e) { list.scrollTop = to; }
    }

    var waiting = false;
    list.addEventListener('scroll', function () {
      if (!waiting) {
        waiting = true;
        window.requestAnimationFrame(function () { waiting = false; paint(); });
      }
      // Settled is the only moment worth telling anybody about: firing on
      // every frame of a flick would open ten psalms on the way past.
      window.clearTimeout(settling);
      settling = window.setTimeout(function () {
        paint();
        if (quiet) { quiet = false; return; }
        if (opts.onPick) opts.onPick(numbers[chosen], chosen);
      }, 150);
    }, { passive: true });

    items.forEach(function (item, i) {
      item.addEventListener('click', function () {
        centre(i);
        if (opts.onPick) opts.onPick(numbers[i], i);
      });
    });

    // A wheel that only answers to a finger is a wheel half the people
    // cannot use.
    list.addEventListener('keydown', function (e) {
      var step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      var want = Math.max(0, Math.min(items.length - 1, chosen + step));
      centre(want);
      if (opts.onPick) opts.onPick(numbers[want], want);
    });

    /**
     * Put a number in the middle without saying anything about it.
     *
     * Jumped rather than eased, deliberately: an eased move fires scroll
     * events for a third of a second, and every one of them is a chance for
     * the page to be told something it is in the middle of doing itself.
     */
    wrap.setTo = function (index, how) {
      if (index === chosen) return;
      quiet = true;
      centre(index, how || 'auto');
      paint();
      window.clearTimeout(settling);
      settling = window.setTimeout(function () { quiet = false; }, 200);
    };
    window.requestAnimationFrame(function () {
      centre(Math.max(0, opts.start || 0), 'auto');
      paint();
    });
    return wrap;
  }

  function renderYahrzeitMonth(data) {
    var into = $('yahrzeitMonth');
    if (!into) return;
    var people = (data && data.people) || [];

    var frag = document.createDocumentFragment();
    var head = el('h2', 'rows-head', (data.month || 'This month'));
    frag.appendChild(head);

    if (!people.length) {
      frag.appendChild(el('p', 'rows-note',
        'Nobody on the built-in list has a yahrzeit in ' + (data.month || 'this month') + '.'));
      fill(into, frag);
      return;
    }

    var rows = el('div', 'rows');
    people.forEach(function (p) {
      var row = el('div', 'row row-static' + (p.today ? ' is-today' : ''));
      var main = el('span', 'row-main');
      var title = el('span', 'row-title', p.name);
      if (p.today) title.appendChild(el('span', 'row-now', 'today'));
      main.appendChild(title);
      var sub = [p.day + ' ' + (p.month || '')];
      if (p.years) sub.push(p.years + ' years');
      main.appendChild(el('span', 'row-sub', sub.join(' · ')));
      row.appendChild(main);
      row.appendChild(el('span', 'row-value he', p.he || ''));
      rows.appendChild(row);
    });
    frag.appendChild(rows);
    frag.appendChild(el('p', 'rows-note',
      'A Torah from whoever\'s yahrzeit it is appears on the Today screen. ' +
      'It never takes the place of the day\'s נקודה.'));
    fill(into, frag);
  }

  function renderUshpizin(data) {
    var card = $('ushpizinCard');
    if (!card) return;
    if (!data || !data.guests || !data.guests.length) { card.hidden = true; return; }

    card.hidden = false;
    setText('ushpizinTitle', 'Ushpizin');
    setText('ushpizinHe', 'אוּשְׁפִּיזִין');

    // Seven nights, and which one this is. A row of marks says it at a
    // glance where "day 4 of 7" has to be read.
    var nights = $('ushpizinNights');
    if (nights) {
      var marks = document.createDocumentFragment();
      for (var n = 1; n <= data.of; n++) {
        var dot = el('span', 'night' + (n === data.day ? ' is-now' : (n < data.day ? ' is-past' : '')));
        dot.setAttribute('aria-hidden', 'true');
        marks.appendChild(dot);
      }
      fill(nights, marks);
      nights.setAttribute('aria-label', 'Night ' + data.day + ' of ' + data.of);
    }

    var body = $('ushpizinBody');
    if (!body) return;
    var wrap = document.createDocumentFragment();

    data.guests.forEach(function (g) {
      var row = el('div', 'ushpiz');

      // The guest, in Hebrew first and large: it is his night.
      var head = el('div', 'ushpiz-head');
      head.appendChild(el('span', 'ushpiz-he he', g.he));
      head.appendChild(el('span', 'ushpiz-name', g.name));
      row.appendChild(head);

      var tags = el('div', 'ushpiz-tags');
      var sef = el('span', 'ushpiz-sefirah');
      sef.appendChild(el('span', 'he', g.sefirahHe || ''));
      sef.appendChild(document.createTextNode(g.sefirah));
      tags.appendChild(sef);
      if (g.minhag) tags.appendChild(el('span', 'ushpiz-minhag', 'the order of ' + g.minhag));
      row.appendChild(tags);

      row.appendChild(el('p', 'ushpiz-about', g.about));

      // The Torah of the day, under the guest it belongs to.
      if (g.passage && g.passage.available) {
        row.appendChild(passageBox(g.passage));
      } else {
        row.appendChild(el('p', 'hint',
          'The passage could not be loaded from Sefaria just now.'));
      }

      // And a word on it from Rebbe Nachman or Reb Noson, where Sefaria
      // records one. Named by whoever actually said it.
      if (g.dvar && g.dvar.available) {
        var said = el('div', 'dvar');
        said.appendChild(el('div', 'dvar-label', (g.dvar.says || 'Breslov') + ' on this'));
        said.appendChild(passageBox(g.dvar, 'is-dvar'));
        row.appendChild(said);
      }
      wrap.appendChild(row);
    });

    if (!data.agreed) {
      wrap.appendChild(el('p', 'hint ushpiz-both',
        'Two orders are kept for the Ushpizin, and today is one of the three ' +
        'days they differ. Both are given; keep the one your family keeps.'));
    }

    fill(body, wrap);
  }

  function renderYahrzeits(list) {
    var card = $('yahrzeitCard');
    if (!card) return;
    var today = (list || [])[0];
    if (!today) { card.hidden = true; return; }

    card.hidden = false;
    setText('yahrzeitTitle', 'Yahrzeit · ' + today.name);
    setText('yahrzeitHe', today.he || '');

    var about = today.about || '';
    if (today.years) about = today.years + ' years today. ' + about;
    if (today.inSecondAdar) about += ' (Marked in Adar II this year.)';
    setText('yahrzeitAbout', about);

    var body = $('yahrzeitBody');
    if (!body) return;
    var p = today.passage;
    if (!p || !p.available) {
      fill(body, el('p', 'hint',
        'His sefer is not on Sefaria, so there is nothing quoted here rather than something he did not say.'));
      return;
    }

    fill(body, passageBox(p));
  }

  /**
   * An excerpt, with its reference and a way through to the whole piece.
   *
   * The yahrzeit card and the Ushpizin card show a passage the same way, so
   * they draw it with the same function rather than each with its own copy.
   */
  function passageBox(p, extra) {
    var box = el('div', 'passage' + (extra ? ' ' + extra : ''));
    if (p.ref) box.appendChild(el('div', 'passage-label', p.heRef || p.ref));
    if (p.he) box.appendChild(el('div', 'he', p.he));
    if (p.en && state.english) box.appendChild(el('div', 'en', p.en));
    else if (!p.en && wantsEnglish(p)) box.appendChild(noTranslation());

    var src = el('div', 'source');
    if (p.credit) {
      var bits = [];
      if (p.credit.hebrew) bits.push('Hebrew: ' + p.credit.hebrew);
      if (p.credit.english) bits.push('Translation: ' + p.credit.english);
      if (p.credit.license) bits.push('License: ' + p.credit.license);
      src.appendChild(document.createTextNode(bits.join(' · ')));
    }
    if (p.url) {
      src.appendChild(document.createElement('br'));
      var a = el('a', null, 'Read the whole piece on Sefaria →');
      a.href = p.url;
      a.target = '_blank';
      a.rel = 'noopener';
      src.appendChild(a);
    }
    box.appendChild(src);
    return box;
  }

  function renderZmanim(zmanim, cal) {
    setText('zmanimPlace', cal.place.name);

    // The next zman, said once and said large, above the list rather than
    // inside it. The list still marks it, because somebody reading down the
    // day wants to know where they are in it -- but nobody should have to
    // read eighteen lines to find the one that has not happened yet.
    var next = zmanim.next;
    var card = $('zmanimNextCard');
    if (card) {
      if (next) {
        card.hidden = false;
        setText('zmanimNextName', next.en);
        setText('zmanimNextHe', next.he);
        setText('zmanimNextTime', next.time);
        setText('zmanimNextAway', friendlyMinutes(next.minutesAway));
        var note = $('zmanimNextNote');
        if (note) {
          note.textContent = next.note || '';
          note.hidden = !next.note;
        }
      } else {
        card.hidden = true;
      }
    }

    var list = document.createDocumentFragment();
    (zmanim.times || []).forEach(function (t) {
      var isNext = zmanim.next && zmanim.next.key === t.key && zmanim.next.choiceId === t.choiceId;
      var row = el('div', 'zman' + (isNext ? ' is-next' : '') + (t.isChosen ? '' : ' is-alt'));
      var labels = el('div', 'labels');
      labels.appendChild(el('div', 'name', t.en));
      labels.appendChild(el('div', 'he-label', t.he));
      if (isNext && t.note) labels.appendChild(el('div', 'note', t.note));
      else if (!t.isChosen && t.opinion) labels.appendChild(el('div', 'note', t.opinion));
      row.appendChild(labels);
      row.appendChild(el('div', 't', t.time));
      list.appendChild(row);
    });
    fillWith('zmanimList', list);

    renderMinhag(zmanim);
  }

  /** The minhag picker: a preset row, then per-line choices. */
  function renderMinhag(zmanim) {
    var opts = zmanim.options;
    if (!opts) return;

    var wrap = document.createDocumentFragment();

    var presets = el('div', 'pills');
    opts.presets.forEach(function (p) {
      var b = el('button', 'pill' + (zmanim.prefs.minhag === p.id ? ' is-active' : ''), p.label);
      b.type = 'button';
      b.title = p.about;
      b.addEventListener('click', function () {
        state.zmanim = { minhag: p.id, showAll: state.zmanim.showAll };
        save(STORE.zmanim, state.zmanim);
        refresh();
      });
      presets.appendChild(b);
    });
    wrap.appendChild(presets);

    opts.slots.forEach(function (slot) {
      var row = el('label', 'choice-row');
      row.appendChild(el('span', 'choice-name', slot.en));
      var sel = el('select', 'choice');
      slot.choices.forEach(function (c) {
        var o = el('option', null, c.name);
        o.value = c.id;
        if (zmanim.prefs[slot.key] === c.id) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () {
        state.zmanim = Object.assign({}, state.zmanim, { minhag: 'custom' });
        state.zmanim[slot.key] = sel.value;
        save(STORE.zmanim, state.zmanim);
        refresh();
      });
      row.appendChild(sel);
      wrap.appendChild(row);
    });

    var showAll = el('label', 'choice-row');
    showAll.appendChild(el('span', 'choice-name', 'Show every opinion'));
    var sw = el('button', 'switch');
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    // Named, like the two in Settings. An empty button with role="switch"
    // is announced as "switch, off" and nothing else, which tells a screen
    // reader user there is a control and not what it does.
    sw.setAttribute('aria-label', 'Show every opinion');
    sw.setAttribute('aria-checked', String(!!state.zmanim.showAll));
    sw.addEventListener('click', function () {
      state.zmanim = Object.assign({}, state.zmanim, { showAll: !state.zmanim.showAll });
      save(STORE.zmanim, state.zmanim);
      refresh();
    });
    showAll.appendChild(sw);
    wrap.appendChild(showAll);

    fillWith('minhagPicker', wrap);
  }

  function renderTehillim(teh) {
    setText('tehillimDayTag', teh && teh.available ? teh.label : '');
    if (!teh || !teh.available) {
      fill($('tehillimBody'), unavailableNotice("day's Tehillim", teh && teh.reason, refresh));
      return;
    }
    // Each psalm gets somewhere to jump to, and a number to jump from. On a
    // six-psalm day the last one was a long scroll away.
    var wrap = document.createDocumentFragment();
    teh.parts.forEach(function (part, i) {
      var section = el('section', 'teh-chapter');
      section.id = 'teh-ch-' + i;
      section.setAttribute('data-index', String(i));
      section.appendChild(passage(part, part.label));
      wrap.appendChild(section);
    });
    fillWith('tehillimBody', wrap);

    // One psalm is not a list to choose from.
    if (teh.parts.length > 1) {
      fillWith('tehillimNav', numberWheel(
        teh.parts.map(function (part, i) { return part.chapter || (i + 1); }),
        {
          label: "Which of today's psalms",
          onPick: function (chapter, i) {
            var node = $('teh-ch-' + i);
            if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        }));
    } else {
      fillWith('tehillimNav', document.createDocumentFragment());
    }
    watchTehillim(teh.parts.length);
  }

  function renderWeekly(weekly) {
    if (!weekly || !weekly.available) {
      setText('weeklyTag', '');
      setText('weeklyWhy', '');
      fill($('weeklyBody'), unavailableNotice('weekly Torah', weekly && weekly.reason, refresh));
      return;
    }
    // On a yom tov week the card belongs to the chag, not to next Shabbos.
    var isChag = weekly.mode === 'yomtov';
    setText('weeklyTitle', isChag ? 'Torah for ' + weekly.yomTov : 'Torah of the week');
    setText('weeklyTag', (isChag ? weekly.yomTovHe : weekly.parshaHe) || weekly.parsha || '');

    var why;
    if (isChag) {
      why = 'A lesson that speaks about ' + weekly.yomTov + '.';
    } else if (weekly.mode === 'parsha') {
      // The strong case: Sefaria records this lesson against a verse in it.
      why = 'On a verse in Parashas ' + weekly.parsha + '.';
    } else if (weekly.mode === 'parsha-named') {
      // The weaker one, and said as such rather than dressed up as the other.
      why = 'A lesson that mentions Parashas ' + weekly.parsha + '.';
    } else {
      why = weekly.why || '';
    }
    $('weeklyWhy').textContent = why + ' It stays the same all week.';

    var weeklyWrap = document.createDocumentFragment();
    // Whose Torah this is, said once and said plainly, above the piece
    // itself -- the same line the Ushpizin card uses.
    if (weekly.says) weeklyWrap.appendChild(el('div', 'dvar-label', weekly.says));
    weeklyWrap.appendChild(passage(weekly, weekly.ref));
    fill($('weeklyBody'), weeklyWrap);
  }

  /**
   * The Tikkun HaKlali, laid out as one continuous reading.
   *
   * It is said from beginning to end, so all ten psalms are on the page at
   * once and you simply keep scrolling. The numbers along the top jump
   * between them and highlight whichever you are in, and where you stopped is
   * remembered -- being interrupted partway through is the normal case, not
   * an unusual one.
   */
  function renderTikkun(tikkun) {
    if (!tikkun || !tikkun.available) {
      fill($('tikkunBody'), unavailableNotice('Tikkun HaKlali', tikkun && tikkun.reason, function () {
        loaded.tikkun = false;
        fill($('tikkunBody'), textSkeleton(10));
        showPanel('tikkun');
      }));
      return;
    }

    var total = tikkun.parts.length;

    // ---- the psalms themselves, one after another
    var body = document.createDocumentFragment();
    tikkun.parts.forEach(function (part, i) {
      var section = el('section', 'tikkun-chapter');
      section.id = 'tikkun-ch-' + i;
      section.setAttribute('data-index', String(i));

      var head = el('div', 'tikkun-heading');
      head.appendChild(el('span', 'n', 'Tehillim ' + part.chapter));
      head.appendChild(el('span', 'of', (i + 1) + ' of ' + total));
      section.appendChild(head);
      section.appendChild(passage(part));
      body.appendChild(section);
    });
    fillWith('tikkunBody', body);

    // ---- the numbers along the top
    // The numbers sit on a track of their own inside the sticky band, so the
    // band can run the full width of the card -- covering the words as they
    // pass behind it -- while the numbers themselves stay a sensible size
    // together on the left, the way a segmented control does.
    tikkunWheel = numberWheel(
      tikkun.parts.map(function (part) { return part.chapter; }),
      {
        label: 'Which psalm of the Tikkun HaKlali',
        start: state.tikkunChapter || 0,
        onPick: function (chapter, i) { goToChapter(i); },
      });
    fillWith('tikkunNav', tikkunWheel);

    markChapter(state.tikkunChapter || 0, total);
    offerResume(tikkun, total);
    watchScroll(total);
  }

  /** Highlight a number and update the "3 of 10" counter. */
  /**
   * Scrolling the psalms turns the wheel, and turning the wheel scrolls the
   * psalms. The guard is what stops those two chasing each other: a wheel
   * moved by the page must not then tell the page to move.
   */
  function markChapter(index, total) {
    state.tikkunChapter = index;
    // The wheel keeps itself quiet while it is being moved from here, so
    // this can simply say where the reading has got to.
    if (tikkunWheel) tikkunWheel.setTo(index);
    setText('tikkunProgress', (index + 1) + ' of ' + total);
  }

  function goToChapter(index) {
    var node = $('tikkun-ch-' + index);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    rememberPlace(index);
  }

  function rememberPlace(index) {
    save(STORE.tikkunPlace, { index: index, at: Date.now() });
  }

  /**
   * If the last reading was recent and not finished, say so and offer to carry
   * on. Anything older than a day is treated as a fresh start.
   */
  function offerResume(tikkun, total) {
    var bar = $('tikkunResume');
    if (!bar) return;
    var saved = load(STORE.tikkunPlace, null);
    var fresh = saved && (Date.now() - saved.at) < 24 * 3600 * 1000;

    if (!fresh || !saved.index || saved.index >= total) {
      bar.hidden = true;
      return;
    }

    var chapter = tikkun.parts[saved.index];
    bar.textContent = '';
    bar.appendChild(el('span', null,
      'You stopped at Tehillim ' + chapter.chapter + '.'));
    var carry = el('button', null, 'Carry on');
    carry.type = 'button';
    carry.addEventListener('click', function () {
      goToChapter(saved.index);
      bar.hidden = true;
    });
    var restart = el('button', null, 'Start again');
    restart.type = 'button';
    restart.addEventListener('click', function () {
      goToChapter(0);
      rememberPlace(0);
      bar.hidden = true;
    });
    var actions = el('span');
    actions.style.display = 'flex';
    actions.style.gap = '6px';
    actions.appendChild(carry);
    actions.appendChild(restart);
    bar.appendChild(actions);
    bar.hidden = false;
  }

  /** Follow the reading as it scrolls, so the numbers and the place keep up. */
  var tikkunWatcher = null;
  function watchScroll(total) {
    if (tikkunWatcher) { tikkunWatcher.disconnect(); tikkunWatcher = null; }
    if (!('IntersectionObserver' in window)) return;

    var top = topbarHeight() + 70;
    tikkunWatcher = new IntersectionObserver(function (entries) {
      // The psalm nearest the top of the screen is the one being said.
      var best = null;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        if (!best || entry.boundingClientRect.top < best.boundingClientRect.top) best = entry;
      });
      if (!best) return;
      var index = Number(best.target.getAttribute('data-index'));
      if (index !== state.tikkunChapter) {
        markChapter(index, total);
        rememberPlace(index);
      }
    }, { rootMargin: '-' + top + 'px 0px -55% 0px', threshold: 0 });

    for (var i = 0; i < total; i++) {
      var node = $('tikkun-ch-' + i);
      if (node) tikkunWatcher.observe(node);
    }
  }

  /**
   * The same following-along for the Tehillim of the day: the number of the
   * psalm you are in lights up as you scroll past it.
   */
  var tehillimWatcher = null;
  function watchTehillim(total) {
    if (tehillimWatcher) { tehillimWatcher.disconnect(); tehillimWatcher = null; }
    if (!('IntersectionObserver' in window) || total < 2) return;

    var nav = $('tehillimNav');
    if (!nav) return;
    var top = topbarHeight() + 70;

    function light(index) {
      Array.prototype.forEach.call(nav.querySelectorAll('button'), function (b, i) {
        b.classList.toggle('is-active', i === index);
      });
    }
    light(0);

    tehillimWatcher = new IntersectionObserver(function (entries) {
      var best = null;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        if (!best || entry.boundingClientRect.top < best.boundingClientRect.top) best = entry;
      });
      if (!best) return;
      light(Number(best.target.getAttribute('data-index')));
    }, { rootMargin: '-' + top + 'px 0px -55% 0px', threshold: 0 });

    for (var i = 0; i < total; i++) {
      var node = $('teh-ch-' + i);
      if (node) tehillimWatcher.observe(node);
    }
  }

  /** The sticky header's height, so things can sit just below it. */
  function topbarHeight() {
    var bar = document.querySelector('.topbar');
    return bar ? Math.round(bar.getBoundingClientRect().height) : 96;
  }

  /**
   * The top bar gets out of the way while you read.
   *
   * Scroll down a psalm and it slides up out of sight; scroll back and it
   * comes straight down again, the way Safari's own bar does. On a phone the
   * header is 154px of a 844px screen -- nearly a fifth of the page given to
   * a date you have already read and a button you are not reaching for.
   *
   * Four things make it behave rather than flicker:
   *
   *   A dead zone. Three pixels of movement is a thumb resting, not a scroll,
   *   and reacting to it means the bar twitches while you hold the phone.
   *
   *   Nothing hides until you are past the bar's own height. Hiding it in the
   *   first few pixels takes the date away before it has gone anywhere, and
   *   the page jumps as it goes.
   *
   *   It always comes back at the top, whatever the last direction was.
   *
   *   And it never hides while the search field is open, while the menu is
   *   open, or while something in the bar has focus -- taking a text field
   *   off the screen while somebody is typing in it is its own kind of rude,
   *   and a keyboard user would lose the control they were on.
   */
  function hideBarWhileReading() {
    var bar = document.querySelector('.topbar');
    if (!bar) return;
    var lastY = window.scrollY || 0;
    var hidden = false;
    var waiting = false;

    var decide = function () {
      waiting = false;
      var y = Math.max(0, window.scrollY || 0);
      var dy = y - lastY;
      if (Math.abs(dy) < 3) return;            // a thumb resting on the glass
      lastY = y;

      // Only a field somebody is typing in holds the bar open. The first
      // version held it for anything focused inside it -- and closing the
      // menu hands focus back to the menu button, which is in the bar, so
      // after one visit to the settings the header never hid again.
      var on = document.activeElement;
      var typing = !!on && bar.contains(on) &&
        /^(INPUT|TEXTAREA|SELECT)$/.test(on.tagName);
      var busy = searchBarOpen() || typing || stillness();
      var tall = bar.offsetHeight || 120;

      var wantHidden = !busy && dy > 0 && y > tall;
      if (y <= 2) wantHidden = false;          // the top always shows it
      if (wantHidden === hidden) return;
      hidden = wantHidden;
      bar.classList.toggle('is-tucked', hidden);
    };

    window.addEventListener('scroll', function () {
      if (waiting) return;
      waiting = true;
      window.requestAnimationFrame(decide);
    }, { passive: true });

    // Changing page starts again from the top with the bar showing.
    document.addEventListener('bd:panel', function () {
      hidden = false;
      lastY = 0;
      bar.classList.remove('is-tucked');
    });
  }

  function syncTopbarHeight() {
    document.documentElement.style.setProperty('--topbar-h', topbarHeight() + 'px');
  }

  /**
   * Keep that measurement honest.
   *
   * It used to be taken once at startup and again on resize. But the header
   * grows after startup -- the next zman appears in it as soon as the times
   * arrive -- so the figure was about 50px short for the whole visit, and the
   * psalm numbers, which park themselves just below the header, parked
   * underneath it instead and were half hidden. Watching the header itself
   * catches every reason it changes size, not just the one we thought of.
   */
  function watchTopbarHeight() {
    var bar = document.querySelector('.topbar');
    if (!bar || typeof ResizeObserver === 'undefined') return;
    new ResizeObserver(syncTopbarHeight).observe(bar);
  }

  // ------------------------------------------------------------- helpers

  function clock(hhmm) {
    if (!hhmm) return '';
    var bits = String(hhmm).split(':');
    var h = Number(bits[0]);
    var suffix = h >= 12 ? 'PM' : 'AM';
    return (h % 12 === 0 ? 12 : h % 12) + ':' + bits[1] + ' ' + suffix;
  }

  function prettyDate(iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function friendlyMinutes(mins) {
    if (mins == null) return '';
    if (mins < 1) return 'now';
    if (mins < 60) return 'in ' + mins + ' min';
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return 'in ' + h + 'h' + (m ? ' ' + m + 'm' : '');
  }

  /** Restart the entrance animation on a node whose contents just changed. */
  /**
   * Play the page's entrance, and then get out of the way.
   *
   * The class used to stay on until the next page change, and that is a
   * quiet trap: the entry animation ends on `transform: none` with a `both`
   * fill, and a filled animation beats a transition. So once a page had
   * finished arriving, nothing that was a direct child of it could be
   * transformed by CSS any more -- every button on it stopped pressing in
   * under a finger. Measured as scale 1.000 while held, on a button whose
   * rule says 0.955 and whose transition was running.
   *
   * It comes off as soon as the animation is done, which is also the moment
   * it has nothing left to do.
   */
  function replay(node) {
    node.classList.remove('is-entering');
    void node.offsetWidth; // forces the browser to notice the class really left
    node.classList.add('is-entering');

    window.clearTimeout(node._entering);
    var done = function () { node.classList.remove('is-entering'); };
    // The longest of the staggered children, plus a little. A timer rather
    // than animationend because the children animate, not the panel, and
    // their events arrive in an order nobody should have to reason about.
    node._entering = window.setTimeout(done, 520);
  }

  function applyReadingPrefs() {
    document.body.classList.toggle('hide-english', !state.english);
    var sw = $('toggleEnglish');
    sw.setAttribute('aria-checked', String(state.english));
    document.documentElement.style.setProperty('--reading',
      (1.0625 * state.fontScale).toFixed(3) + 'rem');
  }

  // ------------------------------------------------------------- search

  var searchState = { query: '', scope: 'breslov', last: null };
  var suggestState = { items: [], active: -1, timer: null, seq: 0 };

  /**
   * Suggestions as you type.
   *
   * Each keystroke does not fetch: the request waits until typing pauses, and
   * a reply that arrives after a newer one has gone out is discarded, so a
   * slow answer for "lik" cannot overwrite the list for "likutei".
   */
  function onSearchTyping() {
    var input = $('searchInput');
    if (!input) return;
    var q = input.value.trim();

    clearTimeout(suggestState.timer);
    if (q.length < 2) { closeSuggest(); return; }

    suggestState.timer = setTimeout(function () {
      var mine = ++suggestState.seq;
      fetch('/api/suggest?q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (mine !== suggestState.seq) return;      // a newer request has overtaken this one
          renderSuggest(data.suggestions || []);
        })
        .catch(function () { closeSuggest(); });
    }, 180);
  }

  function renderSuggest(items) {
    var box = $('searchSuggest');
    var input = $('searchInput');
    if (!box) return;

    suggestState.items = items;
    suggestState.active = -1;

    if (!items.length) { closeSuggest(); return; }

    var list = document.createDocumentFragment();
    items.forEach(function (item, i) {
      var b = el('button', 'suggest-item');
      b.type = 'button';
      b.id = 'suggest-' + i;
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', 'false');
      b.appendChild(el('span', null, item.text));
      if (item.note || item.kind === 'book' || item.kind === 'topic') {
        b.appendChild(el('span', 's-note', item.note || item.kind));
      }
      // mousedown, not click: the input blurs before a click would land.
      b.addEventListener('mousedown', function (e) {
        e.preventDefault();
        chooseSuggestion(i);
      });
      list.appendChild(b);
    });
    fillWith('searchSuggest', list);
    box.hidden = false;
    if (input) input.setAttribute('aria-expanded', 'true');
  }

  function closeSuggest() {
    var box = $('searchSuggest');
    var input = $('searchInput');
    // Closing it has to outrank a reply that is already on its way back.
    //
    // The sequence number guarded against an older request overtaking a
    // newer one, but it was never bumped when the list was closed on
    // purpose -- so pressing Enter ran the search, closed the suggestions,
    // and then the reply to the last keystroke landed and reopened them
    // directly over the results. Cancel the pending request too, or the same
    // thing happens 180ms later.
    window.clearTimeout(suggestState.timer);
    suggestState.seq++;
    if (box) { box.hidden = true; box.textContent = ''; }
    if (input) {
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
    suggestState.items = [];
    suggestState.active = -1;
  }

  function highlightSuggestion(index) {
    var box = $('searchSuggest');
    var input = $('searchInput');
    if (!box) return;
    var count = suggestState.items.length;
    if (!count) return;
    // Wrap around at either end.
    suggestState.active = ((index % count) + count) % count;
    Array.prototype.forEach.call(box.children, function (node, i) {
      var on = i === suggestState.active;
      node.classList.toggle('is-active', on);
      node.setAttribute('aria-selected', String(on));
      if (on) {
        node.scrollIntoView({ block: 'nearest' });
        if (input) input.setAttribute('aria-activedescendant', node.id);
      }
    });
  }

  function chooseSuggestion(index) {
    var item = suggestState.items[index];
    if (!item) return;
    var input = $('searchInput');
    if (input) input.value = item.text;
    closeSuggest();
    runSearch(item.text);
    if (input) input.blur();
  }

  function onSearchKeys(e) {
    if ($('searchSuggest') && $('searchSuggest').hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlightSuggestion(suggestState.active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlightSuggestion(suggestState.active - 1); }
    else if (e.key === 'Enter' && suggestState.active >= 0) { e.preventDefault(); chooseSuggestion(suggestState.active); }
    else if (e.key === 'Escape') { closeSuggest(); }
  }

  /**
   * Words worth starting from.
   *
   * An empty search page used to be one grey sentence on a page of nothing.
   * These are the things people actually come looking for, and one tap runs
   * the search, so the page teaches what it can do instead of describing it.
   */
  var SEARCH_IDEAS = [
    'simcha', 'hisbodedus', 'emunah', 'hakaras hatov', 'niggun',
    'tefillah', 'teshuvah', 'shalom bayis', 'parnassah', 'azamra',
  ];

  function searchFor(word) {
    var input = $('searchInput');
    if (input) input.value = word;
    closeSuggest();
    runSearch(word);
  }

  /** What the search page shows before anything has been asked of it. */
  function searchStartPage() {
    var box = el('div', 'search-start');

    box.appendChild(el('p', 'search-lead',
      'Every sefer of Rebbe Nachman at once. A word, an idea, or the name of ' +
      'a sefer — in English or in Hebrew.'));

    var ideas = el('div', 'search-ideas');
    SEARCH_IDEAS.forEach(function (word) {
      var b = el('button', 'pill small', word);
      b.type = 'button';
      b.addEventListener('click', function () { searchFor(word); });
      ideas.appendChild(b);
    });
    box.appendChild(ideas);

    var shelf = el('div', 'search-shelf');
    shelf.appendChild(el('h3', 'shelf-title', 'What it looks through'));
    var list = el('div', 'shelf-list');
    shelf.appendChild(list);
    box.appendChild(shelf);

    fillWith('searchResults', box);
    fillShelf(list);
  }

  /**
   * The seforim on the shelf, from the app itself rather than typed in here,
   * so this page cannot drift out of step with what is really being searched.
   */
  var shelfBooks = null;
  function fillShelf(into) {
    function draw(books) {
      var frag = document.createDocumentFragment();
      books.forEach(function (book) {
        var b = el('button', 'shelf-book', book.label);
        b.type = 'button';
        if (book.he) b.appendChild(el('span', 'shelf-he', book.he));
        b.addEventListener('click', function () { searchFor(book.label); });
        frag.appendChild(b);
      });
      fill(into, frag);
    }
    if (shelfBooks) { draw(shelfBooks); return; }
    fetch('/api/library', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        shelfBooks = data.books || [];
        draw(shelfBooks);
      })
      .catch(function () { /* the ideas above still work without it */ });
  }

  function runSearch(query) {
    var q = String(query || '').trim();
    searchState.query = q;
    if (!q) {
      searchStartPage();
      setText('searchCount', '');
      return;
    }

    fillWith('searchResults', textSkeleton(5));
    setText('searchCount', 'searching…');

    api('search?q=' + encodeURIComponent(q) + '&scope=' + searchState.scope)
      .then(function (data) {
        searchState.last = data;
        renderSearch(data);
      })
      .catch(function (err) {
        fillWith('searchResults', unavailableNotice('search results', err, function () {
          runSearch(q);
        }));
        setText('searchCount', '');
      });
  }

  function renderSearch(data) {
    if (!data.available) {
      setText('searchCount', '');
      var box = el('div', 'notice');
      box.appendChild(el('strong', null, 'Search is not working.'));
      box.appendChild(document.createTextNode(
        'The rest of the app is fine — this is the part that asks Sefaria to ' +
        'search, and it answered in a way it did not used to.'));
      // `data.reason` is Sefaria's own error text. It was printed here, under
      // the message, in small type. It is a note to whoever maintains this,
      // not to whoever is trying to look something up, so it goes to the
      // console and stays in /api/diagnostics.
      if (data.reason) console.warn('[breslov] search failed:', data.reason);
      var again = el('button', 'btn notice-retry', 'Try again');
      again.type = 'button';
      again.addEventListener('click', function () { runSearch(searchState.query); });
      box.appendChild(again);
      fillWith('searchResults', box);
      return;
    }

    setText('searchCount', data.hits.length
      ? data.hits.length + (data.hits.length === 1 ? ' result' : ' results')
      : 'nothing found');

    renderScopePills(data);

    if (!data.hits.length) {
      var message = data.scope === 'breslov' && data.everywhere
        ? 'Nothing in Reb Nachman\'s seforim. There are ' + data.everywhere +
          ' results elsewhere on Sefaria — tap "Everywhere" above to see them.'
        : 'Nothing found for “' + data.query + '”.';
      fillWith('searchResults', el('p', 'search-empty', message));
      return;
    }

    var list = el('div', 'results');
    data.hits.forEach(function (hit) {
      var item = el('a', 'result');
      item.href = hit.url || '#';
      item.target = '_blank';
      item.rel = 'noopener';
      var head = el('div', 'r-head');
      var shown = hit.heRef || hit.ref;
      head.appendChild(el('span', 'r-ref', shown));
      // Which sefer it came from -- but only when the reference does not
      // already say. A Sefaria reference almost always opens with the name of
      // the sefer, and a tag repeating the words next to them is noise.
      var book = hit.book || bookOf(hit.ref);
      if (book && String(shown).indexOf(book) !== 0) {
        head.appendChild(el('span', 'r-book', book));
      }
      item.appendChild(head);
      // A result is worth showing for its reference alone; the passage is
      // there to read either way.
      if (hit.snippet) {
        // Hebrew results are set right to left, English left to right.
        var isHebrew = /[\u0590-\u05FF]/.test(hit.snippet);
        item.appendChild(el('div', 'r-text' + (isHebrew ? ' is-he' : ''), hit.snippet));
      } else {
        item.appendChild(el('div', 'r-text', 'Open to read this passage.'));
      }
      list.appendChild(item);
    });
    fillWith('searchResults', list);
  }

  /** The sefer a reference belongs to: everything before the last number. */
  function bookOf(ref) {
    var text = String(ref || '').trim();
    if (!text) return '';
    var cut = text.replace(/[\s,:]*[\d.:\-]+\s*$/, '').trim();
    return cut && cut !== text ? cut : '';
  }

  /** Let the reader widen the search past Reb Nachman if nothing turns up. */
  function renderScopePills(data) {
    var wrap = document.createDocumentFragment();
    [
      { id: 'breslov', label: 'Reb Nachman', count: data.inBreslov },
      { id: 'all', label: 'Everywhere', count: data.everywhere },
    ].forEach(function (opt) {
      var b = el('button', 'pill' + (searchState.scope === opt.id ? ' is-active' : ''),
        opt.label + (opt.count == null ? '' : ' (' + opt.count + ')'));
      b.type = 'button';
      b.addEventListener('click', function () {
        if (searchState.scope === opt.id) return;
        searchState.scope = opt.id;
        runSearch(searchState.query);
      });
      wrap.appendChild(b);
    });
    fillWith('searchScope', wrap);
  }

  // ------------------------------------------------------------- daily reminder

  /**
   * The reminder is a calendar subscription rather than a push notification.
   * On an iPhone web push only works for a site added to the home screen, needs
   * a permission prompt, and stops arriving often enough that it cannot be
   * relied on. A calendar the phone subscribes to is handled by the Calendar
   * app itself: it fires whether or not this site has been opened in weeks.
   */
  /**
   * When the site is locked, the Calendar app cannot be shown a password box,
   * so the subscription address has to carry the key itself. The key is asked
   * for once, by a page that is already past the lock.
   */
  var accessKey = '';

  function learnAccessKey() {
    return fetch('/api/access', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (body) { if (body && body.key) accessKey = body.key; })
      .catch(function () { /* not locked, or offline -- the link still works */ });
  }

  function reminderUrl(scheme) {
    var saved = load(STORE.reminder, { hour: 7, minute: 0 });
    var tz = 'America/New_York';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (e) { /* default */ }
    var host = window.location.host;
    return scheme + '//' + host + '/api/reminders.ics' +
      '?hour=' + saved.hour + '&minute=' + saved.minute + '&tz=' + encodeURIComponent(tz) +
      (accessKey ? '&key=' + encodeURIComponent(accessKey) : '');
  }

  function setUpReminder() {
    var select = $('reminderTime');
    if (!select) return;
    var saved = load(STORE.reminder, { hour: 7, minute: 0 });

    select.textContent = '';
    for (var h = 0; h < 24; h++) {
      for (var m = 0; m < 60; m += 30) {
        var option = el('option', null, clock(h + ':' + (m === 0 ? '00' : '30')));
        option.value = h + ':' + m;
        if (h === saved.hour && m === saved.minute) option.selected = true;
        select.appendChild(option);
      }
    }

    select.addEventListener('change', function () {
      var bits = select.value.split(':');
      save(STORE.reminder, { hour: Number(bits[0]), minute: Number(bits[1]) });
      setText('reminderNote', '');
    });

    on('reminderAdd', 'click', function () {
      // webcal: asks the phone to subscribe rather than download a one-off file.
      window.location.href = reminderUrl('webcal:');
      setText('reminderNote',
        'Your Calendar app should offer to subscribe. If nothing happened, ' +
        'copy this address into Calendar → Add Subscription Calendar: ' +
        reminderUrl(window.location.protocol));
    });
  }

  // ------------------------------------------------------- the search bar

  /**
   * The search bar lives in the header now, not down inside the search page.
   *
   * It drops out from under the date, centred, and springs into place; the
   * results appear on the page below. Closing it puts the page back where it
   * was, so a search is something you open over what you were reading rather
   * than somewhere you have to go.
   */
  function searchBarOpen() {
    var drop = $('searchDrop');
    return !!(drop && !drop.hidden);
  }

  /**
   * Search takes the date's place in the header rather than a row of its own.
   *
   * The class goes on the <header>, because what has to change is two things
   * at once -- the date block steps aside and the search button turns into a
   * cross -- and a class on the thing that contains both is how CSS is told
   * that in one move. The header's height does not change, so nothing on the
   * page under it moves; that was the bug.
   */
  function openSearchBar() {
    var drop = $('searchDrop');
    var btn = $('searchBtn');
    var topbar = document.querySelector('.topbar');
    if (!drop) return;
    if (topbar) topbar.classList.add('is-searching');
    drop.hidden = false;
    // Restart the animation even if it was opened a moment ago, and take the
    // class off again when it has run.
    //
    // `field-open` animates `transform` with `fill-mode: both`, so while the
    // class is on, the element is permanently mid-animation as far as the
    // browser is concerned -- and an element with a filling transform
    // animation is its own stacking context. That trapped the suggestion
    // list: it has `z-index: 25` and the next-zman line under it has none,
    // but the two were never competing, because the list's z-index only
    // counted inside the box the class had fenced off. The suggestions came
    // up with the header's own text printed straight through them.
    drop.classList.remove('is-dropping');
    void drop.offsetWidth;
    drop.classList.add('is-dropping');
    window.clearTimeout(drop._dropping);
    drop._dropping = window.setTimeout(function () {
      drop.classList.remove('is-dropping');
    }, 320);
    if (btn) {
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Close search');
    }
    syncTopbarHeight();
    var input = $('searchInput');
    if (input) { input.focus(); input.select(); }
    if (state.panel !== 'search') showPanel('search');
  }

  function closeSearchBar() {
    var drop = $('searchDrop');
    var btn = $('searchBtn');
    var topbar = document.querySelector('.topbar');
    if (!drop || drop.hidden) return;
    closeSuggest();
    if (topbar) topbar.classList.remove('is-searching');
    drop.hidden = true;
    drop.classList.remove('is-dropping');
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Search the seforim');
    }
    syncTopbarHeight();
  }

  function wireSearchBar() {
    on('searchBtn', 'click', function (e) {
      e.stopPropagation();
      if (searchBarOpen()) closeSearchBar(); else openSearchBar();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && searchBarOpen()) {
        closeSearchBar();
        var btn = $('searchBtn');
        if (btn) btn.focus();
      }
    });
  }

  // The settings drawer that used to live here is gone, and so is the code
  // that opened it, dragged it and put it away. Settings is a page under
  // More now. Everything it held is on that page; nothing it did is left
  // behind as a function nobody calls.

  // ------------------------------------------------------------- the lens

  /**
   * A bar you can drag your finger along.
   *
   * Two bars use this. On the tab bar a piece of glass slides: put a finger
   * down and it comes to meet you, drag and it follows, lift and it settles
   * on whatever it is holding and takes you there. On the Tikkun and Tehillim
   * number bars there is no sliding pane -- the one you are on already has a
   * lens of its own, measured and tuned -- but the finger still magnifies
   * whatever it passes over, and lifting opens it.
   *
   * Smoothness is the whole job, and the first version had none. Three things
   * were wrong and all three had to go:
   *
   *   The pane had a transition on its width while the finger was down, so it
   *   was always arriving where the finger had been. Nothing is animated
   *   during a drag now. It is placed exactly under the finger on every
   *   frame, which is as smooth as a thing can be, by definition.
   *
   *   Every move measured all five tabs. Reading an element's box forces the
   *   browser to settle the layout first, so a drag was asking for five
   *   layouts a frame. The geometry is read once, when the finger lands.
   *
   *   Moves were handled as they arrived, several per frame, each one writing
   *   a new position that would never be drawn. They are collected and the
   *   last one is written once per frame.
   */
  function wireBarGesture(bar, itemSelector, options) {
    if (!bar || bar.getAttribute('data-gesture') === 'on') return null;
    bar.setAttribute('data-gesture', 'on');

    var opts = options || {};
    var lens = null;
    if (opts.lens) {
      lens = el('span', 'bar-lens');
      lens.setAttribute('aria-hidden', 'true');
      bar.insertBefore(lens, bar.firstChild);
    }

    var boxes = [];        // where each item is, read once per gesture
    var drift = 0;         // how far translateX(0) is from the bar's left edge
    var flight = 0;        // the frame loop that runs while the pane travels

    /**
     * Where the pane sits when it is told to move nowhere.
     *
     * `translateX(0)` is not the bar's left edge. The pane is absolutely
     * placed, so it starts at the bar's padding edge, and the two bars pad
     * differently -- the tab bar happened to land right and the number bar
     * landed half a number out. It is measured rather than worked out,
     * because the number that matters is where the browser actually put it.
     *
     * Measured with the transition off and read back in the same frame. An
     * earlier version placed the pane, read where it had got to and corrected
     * the difference, which cannot work: the read lands in the middle of the
     * spring, so it corrects towards wherever the pane happens to be passing
     * -- it left the number bar 8px out and threw the tab bar 136px.
     */
    function calibrate() {
      if (!lens) return;
      var was = lens.style.transition;
      lens.style.transition = 'none';
      var hadTransform = lens.style.transform;
      lens.style.transform = 'translateX(0px)';
      drift = lens.getBoundingClientRect().left - bar.getBoundingClientRect().left;
      lens.style.transform = hadTransform;
      // Forced read, so the restored transform is not animated from nowhere.
      void lens.offsetWidth;
      lens.style.transition = was;
    }
    var holding = null;
    var startX = 0, startY = 0;
    var engaged = false, decided = false;
    // Set on the first move of a gesture, not when the finger lands: it is
    // what turns the easing off, and turning it off on touchdown is what made
    // the pill teleport instead of travel.
    var following = false;
    var pending = null, frame = 0;

    function live() {
      // The tab bar stops being a bar at 900px, and a number bar that has
      // more numbers than it can show belongs to the scroll, not to us.
      if (opts.onlyWhenFixed && window.getComputedStyle(bar).position !== 'fixed') return false;
      if (bar.scrollWidth > bar.clientWidth + 1) return false;
      return true;
    }

    function measure() {
      var p = bar.getBoundingClientRect();
      boxes = Array.prototype.map.call(bar.querySelectorAll(itemSelector), function (node) {
        var r = node.getBoundingClientRect();
        return { node: node, x: r.left - p.left, w: r.width, mid: r.left + r.width / 2 };
      });
      return p;
    }

    function nearest(clientX) {
      var best = null, gap = Infinity;
      for (var i = 0; i < boxes.length; i++) {
        var d = Math.abs(boxes[i].mid - clientX);
        if (d < gap) { gap = d; best = boxes[i]; }
      }
      return best;
    }

    function draw() {
      frame = 0;
      if (pending === null || !boxes.length) return;
      var clientX = pending;
      pending = null;
      var near = nearest(clientX);
      if (!near) return;
      holding = near.node;
      boxes.forEach(function (b) {
        b.node.classList.toggle('is-under', b.node === near.node);
      });
      if (!lens) return;
      var p = bar.getBoundingClientRect();
      // It follows the finger rather than hopping from one to the next, but
      // it never leaves the bar: a pane hanging off the end reads as a bug.
      var want = clientX - p.left - near.w / 2;
      var x = Math.max(0, Math.min(want, p.width - near.w)) - drift;
      lens.style.width = near.w + 'px';
      lens.style.transform = 'translateX(' + x + 'px) scale(1.06)';
      lens.style.opacity = '1';
    }

    function queue(clientX) {
      pending = clientX;
      if (!frame) frame = window.requestAnimationFrame(draw);
    }

    /** Put the pane back on the item that is actually selected, with a spring. */
    function settle() {
      if (!lens) return;
      if (!live()) { lens.style.opacity = '0'; return; }
      var on = bar.querySelector(itemSelector + '.is-active');
      if (!on) { lens.style.opacity = '0'; return; }
      var p = bar.getBoundingClientRect();
      var r = on.getBoundingClientRect();
      lens.style.width = r.width + 'px';
      lens.style.transform = 'translateX(' + (r.left - p.left - drift) + 'px)';
      lens.style.opacity = '1';
      watchFlight();
    }

    /**
     * Follow the pane while it springs across, and colour whatever it is
     * passing over.
     *
     * The pane is bright and the labels that are not selected are white, so
     * for the few frames it is over one of them that label is white on white.
     * Caught at 1.01:1 -- as close to invisible as a measurement goes. Under
     * a finger this never happened, because the thing being dragged over is
     * marked as it goes; on a tap there was nothing doing that job.
     *
     * It stops as soon as the pane stops, so nothing runs between taps.
     */
    function watchFlight() {
      if (flight) window.cancelAnimationFrame(flight);
      var still = 0, wasAt = null, frames = 0;
      var step = function () {
        flight = 0;
        var box = lens.getBoundingClientRect();
        var at = Math.round(box.left + box.width / 2);
        still = (at === wasAt) ? still + 1 : 0;
        wasAt = at;

        var near = null, gap = Infinity;
        Array.prototype.forEach.call(bar.querySelectorAll(itemSelector), function (node) {
          var b = node.getBoundingClientRect();
          var d = Math.abs((b.left + b.width / 2) - at);
          if (d < gap) { gap = d; near = node; }
        });
        Array.prototype.forEach.call(bar.querySelectorAll(itemSelector), function (node) {
          node.classList.toggle('is-passing', node === near && !node.classList.contains('is-active'));
        });

        // Two still frames means it has arrived; the cap is for a spring that
        // never quite settles on a fractional pixel.
        if (still >= 2 || ++frames > 90) {
          Array.prototype.forEach.call(bar.querySelectorAll(itemSelector), function (node) {
            node.classList.remove('is-passing');
          });
          return;
        }
        flight = window.requestAnimationFrame(step);
      };
      flight = window.requestAnimationFrame(step);
    }

    function release() {
      bar.classList.remove('is-dragging');
      if (flight) { window.cancelAnimationFrame(flight); flight = 0; }
      boxes.forEach(function (b) { b.node.classList.remove('is-under'); });
      if (frame) { window.cancelAnimationFrame(frame); frame = 0; }
      pending = null;
      engaged = false;
      decided = false;
    }

    bar.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1 || !live()) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      decided = false;
      engaged = !!opts.grabAtOnce;
      following = false;
      measure();
      calibrate();
      if (engaged) {
        // It comes to meet the finger -- but it TRAVELS there. `is-dragging`
        // turns every transition off, and adding it here meant the pane was
        // already under the finger on the frame the finger landed: on a real
        // tap the pill did not glide across the bar at all, it was simply
        // somewhere else. Measured at 1 distinct position in 400ms against 7
        // for a synthetic click, which is why this was invisible until the
        // check used a real pointer.
        //
        // Nothing is turned off until the finger actually moves, which is the
        // only moment a transition would be in the way.
        queue(startX);
      }
    }, { passive: true });

    bar.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 1 || !boxes.length) return;
      var t = e.touches[0];
      if (!decided && !engaged) {
        var dx = Math.abs(t.clientX - startX);
        var dy = Math.abs(t.clientY - startY);
        if (dy > 10 && dy > dx) { decided = true; return; }   // the page is scrolling
        if (dx > 10 && dx > dy) { decided = true; engaged = true; bar.classList.add('is-dragging'); }
        else return;
      }
      if (!engaged) return;
      // The finger is moving, so now the pane must stop easing and simply be
      // where the finger is. A spring under a moving finger is the pane always
      // arriving where the finger has just been.
      if (!following) { following = true; bar.classList.add('is-dragging'); }
      // Once this is our gesture the page must not scroll under it.
      if (e.cancelable) e.preventDefault();
      queue(t.clientX);
    }, { passive: false });

    bar.addEventListener('touchend', function (e) {
      if (!engaged) { release(); return; }
      var moved = Math.abs((e.changedTouches[0] || {}).clientX - startX) > 8;
      var picked = holding;
      release();
      settle();
      // A tap is left to the click that follows it, so a thing is opened in
      // exactly one place. A drag has no click worth having -- the finger
      // comes up over an item it never went down on, and the browser would
      // send the click to the wrong one -- so that is stopped and acted on
      // here instead.
      if (moved && picked) {
        if (e.cancelable) e.preventDefault();
        if (opts.onPick) opts.onPick(picked);
      }
    }, { passive: false });

    bar.addEventListener('touchcancel', function () { release(); settle(); });

    try {
      new ResizeObserver(function () { calibrate(); settle(); }).observe(bar);
    } catch (err) {
      window.addEventListener('resize', function () { calibrate(); settle(); });
    }

    // The selection can change without anyone touching this bar: a tap, a
    // scroll that carries the reading position into the next psalm, a jump
    // from another page. Watching for it here means the pane follows all of
    // them, rather than only the ones something remembered to tell it about.
    if (lens) {
      try {
        var waiting = 0;
        new MutationObserver(function () {
          if (engaged || waiting) return;
          waiting = window.requestAnimationFrame(function () { waiting = 0; settle(); });
        }).observe(bar, { subtree: true, attributes: true, attributeFilter: ['class'] });
      } catch (err) { /* older browser: the pane still moves on a tap */ }
    }

    calibrate();
    settle();
    return function () { calibrate(); settle(); };
  }

  /* The tab bar's pane, and the function that puts it back where it belongs
     whenever the page changes underneath it. */
  var settleTabLens = null;

  function positionTabLens() {
    if (settleTabLens) settleTabLens();
  }

  function wireTabLens() {
    settleTabLens = wireBarGesture(document.querySelector('.tabs'), '.tab', {
      lens: true,
      // The pane comes to meet a finger the moment it lands, before any
      // movement -- that is most of what makes the bar feel alive.
      grabAtOnce: true,
      onlyWhenFixed: true,
      onPick: function (tab) { showPanel(tab.getAttribute('data-panel')); },
    });
  }

  /* The number bars. No sliding pane here: the number you are on already has
     a lens of its own, measured against the psalm passing behind it, and a
     second one would be two. The finger still magnifies what it passes over,
     and lifting opens it. */
  function wireNumberBars() {
    Array.prototype.forEach.call(document.querySelectorAll('.chapter-track'), function (track) {
      wireBarGesture(track, 'button', {
        // The same sliding pane as the tab bar. The number you are on used to
        // carry its own, which meant it could only ever vanish from one
        // number and appear on another; this one travels.
        lens: true,
        // Not at once, though. A finger landing on this bar may be about to
        // scroll the psalm rather than to drag along the numbers, so it waits
        // to see which before it takes the gesture.
        onPick: function (button) { button.click(); },
      });
    });
  }

  // ------------------------------------------------------------- navigation

  /**
   * Every page, and which of them the tab bar shows.
   *
   * Five destinations: Today, Read, Week, Zmanim, More. The other nine are
   * reached from one of the three hubs, and each keeps the address it always
   * had -- /tehillim is still /tehillim -- so nothing anybody bookmarked has
   * moved.
   */
  var PANELS = ['today',
                'read', 'tehillim', 'tikkun', 'torah',
                'week', 'weekly', 'shabbos', 'yahrzeit',
                'zmanim',
                'more', 'search', 'settings', 'about', 'sources', 'privacy', 'terms'];

  /** Which hub a page belongs to, for the tab bar and the back row. */
  var HOME_OF = {
    tehillim: 'read', tikkun: 'read', torah: 'read',
    weekly: 'week', shabbos: 'week', yahrzeit: 'week',
    search: 'more', settings: 'more', about: 'more',
    sources: 'more', privacy: 'more', terms: 'more',
  };
  var tikkunWheel = null;
  var loaded = { tikkun: false, library: false, site: false, yahrzeits: false };

  /**
   * What each page is called, for the browser's own title bar and history.
   *
   * The whole app lived at one address. Opening Tehillim changed nothing a
   * browser could see, so: the phone's back gesture left the app instead of
   * going back a page, the title said "Breslov Daily" whichever page you were
   * on (which is also what the entry in the phone's app switcher said), and
   * there was no way to send somebody the Tikkun HaKlali -- only the app.
   */
  var PANEL_TITLES = {
    today: null,                         // the home page keeps the plain title
    read: 'Read',
    tehillim: "Today's Tehillim",
    tikkun: 'Tikkun HaKlali',
    torah: 'Quick Torah',
    week: 'This week',
    weekly: 'Dvar Torah',
    shabbos: 'Shabbos',
    yahrzeit: 'Yahrzeits',
    zmanim: 'Zmanim',
    more: 'More',
    search: 'Search',
    settings: 'Settings',
    about: 'About',
    sources: 'Sources',
    privacy: 'Privacy policy',
    terms: 'Terms of use',
  };

  /**
   * The panel a web address asks for, or nothing if it asks for no panel.
   *
   * By path rather than by #hash, because the server already answers every
   * path that is not an API call with the app itself, so /tikkun is a real
   * address that can be bookmarked, shared or opened cold.
   */
  function panelFromUrl() {
    var path = String(window.location.pathname || '').replace(/^\/+|\/+$/g, '').toLowerCase();
    return PANELS.indexOf(path) >= 0 ? path : null;
  }

  /**
   * Put the current page in the browser's history and title.
   *
   * `replace` is for the first page of the session and for a panel opened
   * because the address asked for it: pushing there would put a duplicate
   * entry in the history and make the back gesture do nothing once.
   */
  function rememberPanel(name, replace) {
    var title = PANEL_TITLES[name]
      ? PANEL_TITLES[name] + ' · Breslov Daily'
      : 'Breslov Daily';
    document.title = title;
    if (!window.history || !window.history.pushState) return;
    var url = (name === 'today' ? '/' : '/' + name) + window.location.search;
    try {
      if (replace || panelFromUrl() === name) window.history.replaceState({ panel: name }, '', url);
      else window.history.pushState({ panel: name }, '', url);
    } catch (e) { /* a browser that will not take it still shows the page */ }
  }

  /**
   * The back gesture, and an address pasted into a new tab.
   *
   * popstate covers back and forward; hashchange covers somebody editing the
   * address bar in a browser that does not fire popstate for it.
   */
  function watchHistory() {
    window.addEventListener('popstate', function () {
      var want = panelFromUrl() || 'today';
      if (want !== state.panel) showPanel(want, true);
    });
  }

  /** Which way along the tab bar this move went: +1 forwards, -1 back. */
  function travel(from, to) {
    var a = PANELS.indexOf(from);
    var b = PANELS.indexOf(to);
    if (a < 0 || b < 0 || a === b) return 1;
    return b > a ? 1 : -1;
  }

  /** Has the phone asked for no movement? */
  function stillness() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { return false; }
  }

  /**
   * Let a panel leave before it is taken away.
   *
   * It is lifted out of the flow first -- absolutely, at the top of <main> --
   * because two panels in the flow at once makes the page twice as tall for
   * three frames, and a scrollbar that appears and goes again is a jolt you
   * can feel even when you cannot see what caused it.
   */
  function handOver(panel, direction) {
    panel.setAttribute('data-to', direction > 0 ? 'left' : 'right');
    panel.classList.add('is-leaving');
    // Whatever was already running on it stops; it is on its way out.
    panel.classList.remove('is-entering');
    window.clearTimeout(panel._leaveTimer);
    panel._leaveTimer = window.setTimeout(function () {
      panel.classList.remove('is-leaving');
      panel.removeAttribute('data-to');
      // Only hide it if the page has not come back to it in the meantime.
      if (state.panel !== panel.id.replace('panel-', '')) panel.hidden = true;
    }, 190);
  }

  function showPanel(name, fromHistory) {
    var was = state.panel;
    state.panel = name;
    rememberPanel(name, !!fromHistory);

    // The search bar belongs to the search page. Going somewhere else puts it
    // away; coming back to search brings it out, since an empty search page
    // with no box on it is a dead end.
    if (name === 'search') {
      if (!searchBarOpen()) openSearchBar();
    } else if (searchBarOpen()) {
      closeSearchBar();
    }

    // The page you are leaving goes somewhere rather than vanishing.
    //
    // Changing page used to be a straight swap: one panel's `hidden` went on,
    // another's came off, and the pill at the bottom glided across while the
    // content under it cut. The pill was the only thing moving, which is what
    // made the app feel like a set of pages rather than one surface.
    //
    // Both are on screen for a sixth of a second now, passing each other in
    // the direction you moved through the tabs -- forwards and the old page
    // leaves to the left, backwards and it leaves to the right. The leaving
    // one is taken out of the flow for those few frames so the page does not
    // briefly become twice as tall and bounce the scroll.
    var leaving = $('panel-' + was);
    var direction = travel(was, name);
    var crossing = !!leaving && leaving !== $('panel-' + name) && !leaving.hidden && !stillness();
    if (crossing) handOver(leaving, direction);

    PANELS.forEach(function (p) {
      var node = $('panel-' + p);
      if (!node) return;
      // The one on its way out is hidden by handOver, once it has gone. Every
      // other panel -- including that one when there is no crossing, which is
      // what happens with motion turned off -- is hidden now. Leaving that
      // case out left the previous page on screen for good.
      if (crossing && p === was) return;
      node.hidden = p !== name;
    });
    // Open Tehillim and the Read tab stays lit: you are still inside Read.
    // Without this the bar goes blank the moment you leave a hub, which is
    // the moment you most need to know where you are.
    var lit = HOME_OF[name] || name;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-panel') === lit);
    });
    positionTabLens();

    var panel = $('panel-' + name);
    if (panel) {
      panel.setAttribute('data-from', direction > 0 ? 'right' : 'left');
      replay(panel);
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.dispatchEvent(new CustomEvent('bd:panel', { detail: name }));

    if (name === 'search' && !searchState.query) runSearch('');

    // The list of seforim comes from the app itself, so the page cannot drift
    // out of step with what is actually being read.
    if ((name === 'about' || name === 'sources') && !loaded.library) {
      loaded.library = true;
      fetch('/api/library', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var list = document.createDocumentFragment();
          (data.books || []).forEach(function (book) {
            var li = el('li');
            li.appendChild(document.createTextNode(book.label));
            if (book.by) li.appendChild(el('span', 'small', ' — ' + book.by));
            list.appendChild(li);
          });
          list.appendChild(el('li', null, 'Tehillim'));
          fillWith('sourceBooks', list);
        })
        .catch(function () { loaded.library = false; });
    }

    // Which version is actually running, so it can be read without hunting
    // for a web address.
    if (name === 'about' || name === 'settings' || name === 'more') {
      fetch('/api/health', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (h) {
          setText('aboutBuild', 'Version ' + h.build);
          setText('moreBuild', 'Breslov Daily · version ' + h.build);
        })
        .catch(function () { setText('aboutBuild', ''); });
    }
    if (name === 'settings') setText('settingsPlace', state.place.name);

    // The month's yahrzeits. Today's is on the home screen; this page is
    // about who else is coming, which is the question somebody opens it to
    // ask.
    if (name === 'yahrzeit' && !loaded.yahrzeits) {
      loaded.yahrzeits = true;
      api('yahrzeits')
        .then(renderYahrzeitMonth)
        .catch(function () {
          loaded.yahrzeits = false;
          fill($('yahrzeitMonth'), unavailableNotice('yahrzeits', null, function () {
            loaded.yahrzeits = false; showPanel('yahrzeit');
          }));
        });
    }

    // A policy page that says when it last changed, taken from the build the
    // page is actually running rather than from a date typed in by hand --
    // which is the one thing on a policy page that always goes stale.
    if (name === 'privacy') {
      setText('privacyUpdated', 'This is version ' + BUILD + ' of the app, and of this page.');
    }

    // Who runs this site, on both pages that promise you can write to them.
    if ((name === 'privacy' || name === 'terms') && !loaded.site) {
      loaded.site = true;
      fetch('/api/site', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(fillSite)
        .catch(function () { loaded.site = false; fillSite(null); });
    }

    if (name === 'tikkun' && !loaded.tikkun) {
      loaded.tikkun = true;
      api('tikkun').then(renderTikkun).catch(function (err) {
        fill($('tikkunBody'), unavailableNotice('Tikkun HaKlali', err, function () {
          fill($('tikkunBody'), textSkeleton(10));
          showPanel('tikkun');
        }));
        loaded.tikkun = false;
      });
    }
  }

  /**
   * The name and address of whoever put this online.
   *
   * It comes from the server's own settings, not from a file in the code: a
   * policy that says "write to us" has to say where, and it is not for this
   * app to decide whose name goes on it. Until it is set, the page says so --
   * which is the truth, and better than a blank line that reads like an
   * oversight.
   */
  function fillSite(site) {
    var owner = (site && site.owner) || '';
    var contact = (site && site.contact) || '';
    var where = (site && site.where) || '';

    var said;
    if (owner || contact) {
      said = [owner, where, contact].filter(Boolean).join(' · ');
    } else {
      said = 'This copy has not had its owner set yet. Whoever put it online ' +
             'can add SITE_OWNER and SITE_CONTACT to the server settings and ' +
             'their name and address will appear here.';
    }
    setText('siteOwner', said);
    setText('termsOwner', owner || contact
      ? 'Questions about this site: ' + [owner, contact].filter(Boolean).join(' · ')
      : said);
  }

  /**
   * "Delete everything saved about me", and it means it.
   *
   * Two things exist and both go: the settings in this browser's own storage,
   * and the cookie that remembers you got past the password. There is no
   * account, no database and no record of what anyone read, so there is
   * nothing else -- and the page says that rather than implying some larger
   * erasure is happening out of sight.
   *
   * It is deliberately one tap with one confirmation. The whole point of the
   * dark-patterns rule is that leaving is as easy as arriving; a five-step
   * "are you sure you want to lose everything" would be the thing it is
   * meant to prevent.
   */
  function wireForgetMe() {
    var button = $('forgetMe');
    if (!button) return;
    button.addEventListener('click', function () {
      var locked = window.confirm(
        'This clears your settings on this device and signs you out of this ' +
        'site. You will need the password again. Carry on?');
      if (!locked) return;

      setText('forgetNote', 'Clearing…');

      // The storage first, so it is gone even if the server cannot be reached.
      var cleared = [];
      try {
        Object.keys(STORE).forEach(function (which) {
          if (localStorage.getItem(STORE[which]) !== null) cleared.push(which);
          localStorage.removeItem(STORE[which]);
        });
      } catch (e) { /* private browsing: there was nothing to clear */ }

      fetch('/api/forget', { method: 'POST', headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .catch(function () { return null; })
        .then(function (answer) {
          setText('forgetNote',
            cleared.length + ' saved setting' + (cleared.length === 1 ? '' : 's') +
            ' cleared from this device' +
            (answer && answer.ok ? ', and the access cookie is gone.' :
              '. The server could not be reached, so the access cookie is still here; ' +
              'clearing this site\'s data in your browser removes it.') +
            ' Nothing else was held.');
        });
    });
  }

  function askForLocation() {
    if (!navigator.geolocation) {
      alert('This device will not share a location, so the app is using ' + state.place.name + '.');
      return;
    }
    navigator.geolocation.getCurrentPosition(function (pos) {
      var tz = DEFAULT_PLACE.tz;
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* keep default */ }
      // Rounded to two places -- about a kilometre -- because that is all the
      // precision zmanim need and a great deal less than an address. A whole
      // minute of time is roughly 28km of longitude, so this cannot move a
      // printed time, and the privacy page can honestly say the coordinates
      // are rounded. Four places, which is what this used to send, is eleven
      // metres: close enough to point at a house.
      state.place = {
        name: 'My location',
        lat: Number(pos.coords.latitude.toFixed(2)),
        lng: Number(pos.coords.longitude.toFixed(2)),
        tz: tz,
      };
      save(STORE.place, state.place);
      refresh();
    }, function () {
      alert('Location was not shared, so zmanim stay set to ' + state.place.name + '.');
    }, { timeout: 10000, maximumAge: 3600000 });
  }

  // ------------------------------------------------------------- start up

  function refresh() {
    return api('today').then(function (data) {
      var banner = $('offlineBanner');
      if (banner) banner.hidden = true;
      renderToday(data);
      var panel = $('panel-' + state.panel);
      if (panel) replay(panel);
    }).catch(function (err) {
      var saved = load(STORE.lastToday, null);
      if (saved) {
        var banner = $('offlineBanner');
        if (banner) banner.hidden = false;
        renderToday(saved);
      } else {
        // Into the נקודה, which is the page. This used to write the apology
        // into `#verseBody` -- a leftover from the old Today screen that is
        // `hidden` in the markup -- so when the day's data could not be
        // fetched and nothing was saved from last time, the screen simply sat
        // there with its skeleton and said nothing. The check that was meant
        // to catch it looked for a `.notice` inside the open panel, and found
        // one: querySelector does not care whether you can see it.
        fill($('nekudaBody'), unavailableNotice("day's learning", err, function () {
          fill($('nekudaBody'), textSkeleton(6));
          refresh();
        }));
        setText('nekudaWhy', '');
        setHidden('nekudaSource', true);
      }
    });
  }

  /**
   * The page you asked for, if you asked for one.
   *
   * Every address on this site is answered with the same page, so /tikkun
   * used to open on Today like everything else. That matters now: after the
   * password box sends you back to where you were going, landing somewhere
   * else makes it look as though it lost you.
   */
  function start() {
    applyTheme();
    applyFont();
    setUpFontChoice();
    applyReadingPrefs();
    wakeUpTouchPresses();
    followPresses();
    watchForHebrew();
    hideBarWhileReading();
    syncTopbarHeight();
    watchTopbarHeight();
    window.addEventListener('resize', syncTopbarHeight);

    // If no theme has been chosen, follow the phone when it changes.
    try {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () { if (!state.theme) applyTheme(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    } catch (e) { /* older browser: the saved choice still works */ }


    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      tab.addEventListener('click', function () { showPanel(tab.getAttribute('data-panel')); });
    });
    wireTabLens();
    Array.prototype.forEach.call(document.querySelectorAll('[data-goto]'), function (b) {
      b.addEventListener('click', function () { showPanel(b.getAttribute('data-goto')); });
    });

    // The source line opens the whole piece. It is the only control on the
    // teaching, and it does the one thing somebody tapping a source wants.
    on('nekudaSource', 'click', function () {
      var full = $('nekudaFull');
      if (!full) return;
      var opening = full.hidden;
      full.hidden = !opening;
      var btn = $('nekudaSource');
      if (btn) btn.setAttribute('aria-expanded', String(opening));
    });
    on('torahFullBtn', 'click', function () {
      var full = $('torahFull');
      if (!full) return;
      full.hidden = !full.hidden;
      var btn = $('torahFullBtn');
      if (btn) btn.textContent = full.hidden ? 'Read the whole lesson' : 'Close';
    });

    on('placeBtn', 'click', askForLocation);
    on('aboutLocation', 'click', askForLocation);
    on('themeBtn', 'click', toggleTheme);
    setUpReminder();

    wireSearchBar();
    wireForgetMe();

    var form = $('searchForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = $('searchInput');
        closeSuggest();
        runSearch(input ? input.value : '');
        if (input) input.blur();   // let the phone keyboard get out of the way
      });
    }

    on('searchInput', 'input', onSearchTyping);
    on('searchInput', 'keydown', onSearchKeys);
    on('searchInput', 'blur', function () { setTimeout(closeSuggest, 120); });
    document.addEventListener('click', function (e) {
      var field = document.querySelector('.search-field');
      if (field && !field.contains(e.target)) closeSuggest();
    });

    on('toggleEnglish', 'click', function () {
      state.english = !state.english;
      save(STORE.english, state.english);
      applyReadingPrefs();
    });
    on('fontLarger', 'click', function () {
      state.fontScale = Math.min(1.9, state.fontScale + 0.12);
      save(STORE.fontScale, state.fontScale);
      applyReadingPrefs();
    });
    on('fontSmaller', 'click', function () {
      state.fontScale = Math.max(0.8, state.fontScale - 0.12);
      save(STORE.fontScale, state.fontScale);
      applyReadingPrefs();
    });

    learnAccessKey();

    watchHistory();
    // The address decides which page opens, and the first page of the session
    // replaces the history entry rather than adding one, so the very first
    // back gesture leaves the app instead of doing nothing.
    showPanel(panelFromUrl() || 'today', true);

    // Show the saved copy straight away, then bring it up to date.
    var saved = load(STORE.lastToday, null);
    if (saved) { try { renderToday(saved); } catch (e) { /* ignore a stale shape */ } }
    refresh();

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refresh();
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(function () { /* offline is optional */ });
    }
  }

  /**
   * Make a tap feel like a press on an iPhone.
   *
   * Safari on iOS only applies :active styles while a finger is down if the
   * page is listening for touches at all. Without this, every press animation
   * in the stylesheet fires on a desktop click and does nothing on a phone --
   * and because the grey tap flash is turned off too, a tap gave back no sign
   * whatever that it had landed. The listener does nothing; its existence is
   * the whole point, so it is passive and never blocks a scroll.
   */
  function wakeUpTouchPresses() {
    try {
      document.addEventListener('touchstart', function () {}, { passive: true });
    } catch (e) {
      document.addEventListener('touchstart', function () {});
    }
  }

  /** Everything that is meant to squash when you press it. */
  // `.row:not(.is-plain)`: a row that only states a fact -- a yom tov coming
  // on Wednesday -- is not a control, and lighting it up under a finger
  // promises somewhere to go that does not exist.
  var PRESSABLE = '.btn, .pill, .stepper button, .icon-btn, .aa, .resume button,' +
                  '.tab, .row:not(.is-plain), .wheel-item, .backrow, .nekuda-source,' +
                  '.shelf-book, .result, .suggest-item';

  /**
   * Mark what is being pressed, rather than leaving it to :active.
   *
   * :active is the browser's own idea of "being pressed", and on a phone it
   * is not a reliable one -- Safari withholds it unless the page happens to
   * listen for touches, and even then it can be skipped. A class we put on
   * ourselves behaves the same on every device and under every kind of
   * pointer, so a tap on a phone feels exactly like a click on a desktop.
   *
   * A press is let go when the finger lifts, when the browser takes the
   * gesture away from us (which is what happens the moment a scroll starts),
   * or when the window loses focus mid-press.
   */
  function followPresses() {
    var held = null;

    function release() {
      if (!held) return;
      held.classList.remove('is-pressed');
      held = null;
    }

    document.addEventListener('pointerdown', function (e) {
      var node = e.target && e.target.closest ? e.target.closest(PRESSABLE) : null;
      release();
      if (!node) return;
      held = node;
      held.classList.add('is-pressed');
    }, { passive: true });

    ['pointerup', 'pointercancel', 'dragstart'].forEach(function (name) {
      document.addEventListener(name, release, { passive: true });
    });
    window.addEventListener('scroll', release, { passive: true });
    window.addEventListener('blur', release);
  }

  /** Check the page and this script agree before trusting either. */
  function init() {
    var pageBuild = document.documentElement.getAttribute('data-build');
    if (pageBuild !== BUILD && selfHeal()) return;

    try {
      start();
    } catch (err) {
      // Something in the page was not what this script expected. Clearing the
      // caches fixes the usual cause; if it does not, let the error surface.
      if (!selfHeal()) throw err;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
