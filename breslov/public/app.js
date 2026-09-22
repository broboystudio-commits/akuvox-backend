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
  var BUILD = '6';

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
    zmanim: 'bd.zmanim',
    theme: 'bd.theme',
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
    zmanim: load(STORE.zmanim, { minhag: 'standard', showAll: false }),
    theme: load(STORE.theme, null),   // null means follow the phone's own setting
    today: null,
    tikkunChapter: 0,
    panel: 'today',
  };

  var $ = function (id) { return document.getElementById(id); };

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
    document.documentElement.setAttribute('data-theme', theme);
    // Keep the iPhone status bar and the PWA chrome in step with the page.
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#14101a' : '#fdfbf9');
    var btn = $('themeBtn');
    if (btn) {
      btn.setAttribute('aria-label',
        theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
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

  /** One passage: Hebrew, then English, then the credit line. */
  function passage(data, label) {
    var box = el('div', 'passage');
    if (label) box.appendChild(el('div', 'passage-label', label));

    var he = textBlock(data.hebrew, 'he', data.startVerse);
    if (he) box.appendChild(he);
    var en = textBlock(data.english, 'en', data.startVerse);
    if (en) box.appendChild(en);

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
  function unavailableNotice(data, what) {
    var box = el('div', 'notice');
    box.appendChild(el('strong', null, 'The ' + what + ' could not be loaded.'));
    box.appendChild(document.createTextNode(
      'Every word here comes from Sefaria, and nothing is shown unless it arrives from there. ' +
      (data && data.hint ? data.hint : 'Check the connection and try again.')
    ));
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

    // ---- the hero
    setText('heroGreg', cal.gregorian.long || cal.gregorian.display);
    setText('heroHeb', cal.hebrew.gematriya || cal.hebrew.en);

    // Only what is true of *today*. The calendar hands back a week or so of
    // upcoming yomim tovim, and showing all of them buried the date under a
    // wall of chips; the ones still to come belong on the Shabbos card.
    var today = cal.gregorian.iso;
    var chips = document.createDocumentFragment();
    if (cal.parsha) {
      chips.appendChild(el('span', 'chip-tag', cal.parsha.he || cal.parsha.en));
    }
    if (cal.hebrew.isRoshChodesh) {
      chips.appendChild(el('span', 'chip-tag is-gold', 'Rosh Chodesh'));
    }
    (cal.holidays || [])
      .filter(function (h) {
        return h.date === today &&
               h.en.indexOf('Candle') !== 0 &&
               h.en.indexOf('Havdalah') !== 0;
      })
      .slice(0, 2)
      .forEach(function (h) {
        chips.appendChild(el('span', 'chip-tag is-gold', h.en));
      });
    fillWith('heroChips', chips);

    // ---- the small verse, with the full lesson folded away behind a button
    var spark = data.spark;
    if (spark && spark.available) {
      setText('verseRef', spark.heading || spark.ref);
      var v = document.createDocumentFragment();
      if (spark.snippetHe) v.appendChild(el('p', 'verse-he', spark.snippetHe));
      if (spark.snippetEn) v.appendChild(el('p', 'verse-en', spark.snippetEn));
      fillWith('verseBody', v);

      fill($('sparkFull'), passage(spark));
      setHidden('sparkFull', true);
      var btn = $('openFull');
      btn.hidden = false;
      btn.textContent = 'Read the whole lesson';
      setText('aboutSpark', spark.heading || spark.ref);
    } else {
      setText('verseRef', '');
      fill($('verseBody'), unavailableNotice(spark, 'daily teaching'));
      setHidden('openFull', true);
      setHidden('sparkFull', true);
    }

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

    // ---- the quick links
    if (data.tehillim && data.tehillim.available) {
      setText('quickTehillim', data.tehillim.label);
    }
    if (data.weekly && data.weekly.available) {
      setText('quickWeekly', data.weekly.parsha
        ? 'Parashas ' + data.weekly.parsha
        : data.weekly.ref);
    }

    // ---- Shabbos
    setText('parshaTag', cal.parsha ? (cal.parsha.he || cal.parsha.en) : '');
    var rows = [];
    if (cal.parsha) rows.push(['Parsha', cal.parsha.en + (cal.parsha.isDouble ? ' (double)' : '')]);
    if (cal.candles) rows.push(['Candle lighting', clock(cal.candles.time) + ' · ' + prettyDate(cal.candles.date)]);
    if (cal.havdalah) rows.push(['Havdalah', clock(cal.havdalah.time) + ' · ' + prettyDate(cal.havdalah.date)]);
    (cal.holidays || []).forEach(function (h) {
      if (h.date === today) return;                      // already a chip above
      if (h.en.indexOf('Candle') === 0 || h.en.indexOf('Havdalah') === 0) return;
      rows.push([prettyDate(h.date), h.en]);
    });
    var kv = document.createDocumentFragment();
    rows.forEach(function (r) {
      var row = el('div', 'kv-row');
      row.appendChild(el('span', 'k', r[0]));
      row.appendChild(el('span', 'v', r[1]));
      kv.appendChild(row);
    });
    fillWith('shabbosTimes', kv);

    renderZmanim(data.zmanim, cal);
    renderWeekly(data.weekly);
    renderTehillim(data.tehillim);
  }

  function renderZmanim(zmanim, cal) {
    setText('zmanimPlace', cal.place.name);

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
      fill($('tehillimBody'), unavailableNotice(teh, "day's Tehillim"));
      return;
    }
    var wrap = document.createDocumentFragment();
    teh.parts.forEach(function (part) { wrap.appendChild(passage(part, part.label)); });
    fillWith('tehillimBody', wrap);
  }

  function renderWeekly(weekly) {
    if (!weekly || !weekly.available) {
      setText('weeklyTag', '');
      setText('weeklyWhy', '');
      fill($('weeklyBody'), unavailableNotice(weekly, 'weekly Torah'));
      return;
    }
    setText('weeklyTag', weekly.parshaHe || weekly.parsha || '');
    $('weeklyWhy').textContent =
      (weekly.mode === 'parsha' ? 'Parashas ' + weekly.parsha + ' — ' + weekly.why : weekly.why) +
      ' It stays the same all week.';
    fill($('weeklyBody'), passage(weekly, weekly.ref));
  }

  function renderTikkun(tikkun) {
    if (!tikkun || !tikkun.available) {
      fill($('tikkunBody'), unavailableNotice(tikkun, 'Tikkun HaKlali'));
      return;
    }
    var nav = document.createDocumentFragment();
    tikkun.parts.forEach(function (part, i) {
      var b = el('button', i === state.tikkunChapter ? 'is-active' : null, String(part.chapter));
      b.type = 'button';
      b.addEventListener('click', function () {
        state.tikkunChapter = i;
        renderTikkun(tikkun);
      });
      nav.appendChild(b);
    });
    fillWith('tikkunNav', nav);

    var body = $('tikkunBody');
    fill(body, passage(tikkun.parts[state.tikkunChapter], tikkun.parts[state.tikkunChapter].label));
    replay(body);
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
  function replay(node) {
    node.classList.remove('is-entering');
    void node.offsetWidth; // forces the browser to notice the class really left
    node.classList.add('is-entering');
  }

  function applyReadingPrefs() {
    document.body.classList.toggle('hide-english', !state.english);
    var sw = $('toggleEnglish');
    sw.setAttribute('aria-checked', String(state.english));
    document.documentElement.style.setProperty('--reading',
      (1.0625 * state.fontScale).toFixed(3) + 'rem');
  }

  // ------------------------------------------------------------- navigation

  var PANELS = ['today', 'tehillim', 'tikkun', 'weekly', 'zmanim', 'about'];
  var loaded = { tikkun: false };

  function showPanel(name) {
    state.panel = name;
    PANELS.forEach(function (p) {
      var node = $('panel-' + p);
      if (node) node.hidden = p !== name;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-panel') === name);
    });

    var panel = $('panel-' + name);
    if (panel) replay(panel);
    window.scrollTo({ top: 0, behavior: 'auto' });

    if (name === 'tikkun' && !loaded.tikkun) {
      loaded.tikkun = true;
      api('tikkun').then(renderTikkun).catch(function (err) {
        fill($('tikkunBody'), unavailableNotice({ hint: err.message }, 'Tikkun HaKlali'));
        loaded.tikkun = false;
      });
    }
  }

  function askForLocation() {
    if (!navigator.geolocation) {
      alert('This device will not share a location, so the app is using ' + state.place.name + '.');
      return;
    }
    navigator.geolocation.getCurrentPosition(function (pos) {
      var tz = DEFAULT_PLACE.tz;
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* keep default */ }
      state.place = {
        name: 'My location',
        lat: Number(pos.coords.latitude.toFixed(4)),
        lng: Number(pos.coords.longitude.toFixed(4)),
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
        fill($('verseBody'), unavailableNotice({ hint: err.message }, "day's learning"));
      }
    });
  }

  function start() {
    applyTheme();
    applyReadingPrefs();

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
    Array.prototype.forEach.call(document.querySelectorAll('[data-goto]'), function (b) {
      b.addEventListener('click', function () { showPanel(b.getAttribute('data-goto')); });
    });

    on('placeBtn', 'click', askForLocation);
    on('aboutLocation', 'click', askForLocation);
    on('themeBtn', 'click', toggleTheme);

    on('openFull', 'click', function () {
      var full = $('sparkFull');
      if (!full) return;
      var open = full.hidden;
      full.hidden = !open;
      setText('openFull', open ? 'Hide the lesson' : 'Read the whole lesson');
      if (open) replay(full);
    });

    // Wire the reading-options popover, but only if both pieces are present.
    // Skipping it must not stop the rest of the buttons being wired below.
    var sheet = $('readerSheet');
    var readerBtn = $('readerBtn');
    if (sheet && readerBtn) {
      readerBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = sheet.hidden;
        sheet.hidden = !open;
        readerBtn.setAttribute('aria-expanded', String(open));
        if (open) {
          sheet.classList.remove('is-opening');
          void sheet.offsetWidth;
          sheet.classList.add('is-opening');
        }
      });
      document.addEventListener('click', function (e) {
        if (!sheet.hidden && !sheet.contains(e.target) && e.target !== readerBtn) {
          sheet.hidden = true;
          readerBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

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
