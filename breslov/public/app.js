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
  var BUILD = '27';

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
   * Three are fetched from Google Fonts and only when chosen, so nothing is
   * downloaded for a setting nobody touched. Each falls back to whatever the
   * device already has, so a slow connection, a blocked request or no signal
   * at all still leaves readable Hebrew rather than empty boxes. "Your
   * device's font" downloads nothing and is the one to pick to stay wholly
   * offline.
   */
  var FONTS = {
    frank: {
      label: 'Frank Ruhl — traditional',
      google: 'Frank+Ruhl+Libre:wght@400;500;700',
      hebrew: "'Frank Ruhl Libre', 'Taamey Frank CLM', 'Frank Ruehl CLM', 'SBL Hebrew', David, 'Times New Roman', serif",
      english: "'Iowan Old Style', Charter, Georgia, 'Times New Roman', serif",
    },
    david: {
      label: 'David — classic',
      google: 'David+Libre:wght@400;500;700',
      hebrew: "'David Libre', David, 'Taamey Frank CLM', 'Times New Roman', serif",
      english: "'Iowan Old Style', Charter, Georgia, 'Times New Roman', serif",
    },
    modern: {
      label: 'Heebo — modern',
      google: 'Heebo:wght@400;500;700',
      hebrew: "'Heebo', 'Arial Hebrew', 'Noto Sans Hebrew', system-ui, sans-serif",
      english: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif",
    },
    system: {
      label: "Your device's font",
      google: null,
      hebrew: "'SBL Hebrew', 'Taamey Frank CLM', 'Arial Hebrew', David, 'Times New Roman', serif",
      english: "'Iowan Old Style', Charter, Georgia, 'Times New Roman', serif",
    },
  };

  var fontsAsked = {};

  /** Fetch a Google font once, and only because someone chose it. */
  function requestFont(key) {
    var font = FONTS[key];
    if (!font || !font.google || fontsAsked[key]) return;
    fontsAsked[key] = true;

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    // display=swap: show the fallback immediately and swap when it arrives,
    // rather than leaving the page blank while waiting.
    link.href = 'https://fonts.googleapis.com/css2?family=' + font.google + '&display=swap';
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }

  function applyFont() {
    var font = FONTS[state.font] || FONTS.frank;
    requestFont(state.font);
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
    document.documentElement.setAttribute('data-theme', theme);
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
      fill($('tikkunBody'), unavailableNotice(tikkun, 'Tikkun HaKlali'));
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
    var nav = document.createDocumentFragment();
    tikkun.parts.forEach(function (part, i) {
      var b = el('button', null, String(part.chapter));
      b.type = 'button';
      b.setAttribute('data-index', String(i));
      b.addEventListener('click', function () { goToChapter(i); });
      nav.appendChild(b);
    });
    fillWith('tikkunNav', nav);

    markChapter(state.tikkunChapter || 0, total);
    offerResume(tikkun, total);
    watchScroll(total);
  }

  /** Highlight a number and update the "3 of 10" counter. */
  function markChapter(index, total) {
    state.tikkunChapter = index;
    var nav = $('tikkunNav');
    if (nav) {
      Array.prototype.forEach.call(nav.children, function (b) {
        b.classList.toggle('is-active', Number(b.getAttribute('data-index')) === index);
      });
    }
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

  /** The sticky header's height, so things can sit just below it. */
  function topbarHeight() {
    var bar = document.querySelector('.topbar');
    return bar ? Math.round(bar.getBoundingClientRect().height) : 96;
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

    fillWith('searchResults', el('div', 'skeleton'));
    setText('searchCount', 'searching…');

    api('search?q=' + encodeURIComponent(q) + '&scope=' + searchState.scope)
      .then(function (data) {
        searchState.last = data;
        renderSearch(data);
      })
      .catch(function (err) {
        fillWith('searchResults', unavailableNotice({ hint: err.message }, 'search'));
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
        'search, and it answered in a way it did not used to. '));
      if (data.reason) {
        box.appendChild(document.createElement('br'));
        box.appendChild(el('small', null, data.reason));
      }
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

  function openSearchBar() {
    var drop = $('searchDrop');
    var btn = $('searchBtn');
    if (!drop) return;
    drop.hidden = false;
    // Restart the animation even if it was opened a moment ago.
    drop.classList.remove('is-dropping');
    void drop.offsetWidth;
    drop.classList.add('is-dropping');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    syncTopbarHeight();
    var input = $('searchInput');
    if (input) { input.focus(); input.select(); }
    if (state.panel !== 'search') showPanel('search');
  }

  function closeSearchBar() {
    var drop = $('searchDrop');
    var btn = $('searchBtn');
    if (!drop || drop.hidden) return;
    closeSuggest();
    drop.hidden = true;
    drop.classList.remove('is-dropping');
    if (btn) btn.setAttribute('aria-expanded', 'false');
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

  // ---------------------------------------------------------- the sidebar

  /**
   * One button for everything that is not reading: the theme, the English,
   * the font, the text size and the way to the about page. It used to be
   * three buttons in the corner and a popover hanging off one of them.
   *
   * While it is open the page behind it does not scroll -- on a phone a
   * drawer over a page that keeps moving underneath is horrible.
   */
  function sidebarOpen() {
    var menu = $('sideMenu');
    return !!(menu && !menu.hidden);
  }

  function openSidebar() {
    var menu = $('sideMenu');
    var scrim = $('menuScrim');
    var btn = $('menuBtn');
    if (!menu) return;
    menu.hidden = false;
    if (scrim) scrim.hidden = false;
    // Two frames: hidden is dropped first, then the class that slides it in,
    // or the browser has nothing to animate from.
    requestAnimationFrame(function () {
      menu.classList.add('is-open');
      if (scrim) scrim.classList.add('is-open');
    });
    if (btn) btn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('no-scroll');
    var first = $('menuClose');
    if (first) first.focus();
  }

  function closeSidebar(giveBackFocus) {
    var menu = $('sideMenu');
    var scrim = $('menuScrim');
    var btn = $('menuBtn');
    if (!menu || menu.hidden) return;
    menu.classList.remove('is-open');
    if (scrim) scrim.classList.remove('is-open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('no-scroll');
    // Let it slide out before it is taken away.
    setTimeout(function () {
      menu.hidden = true;
      if (scrim) scrim.hidden = true;
    }, 220);
    if (giveBackFocus && btn) btn.focus();
  }

  function wireSidebar() {
    on('menuBtn', 'click', function (e) {
      e.stopPropagation();
      if (sidebarOpen()) closeSidebar(true); else openSidebar();
    });
    on('menuClose', 'click', function () { closeSidebar(true); });
    on('menuScrim', 'click', function () { closeSidebar(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sidebarOpen()) closeSidebar(true);
    });
  }

  // ------------------------------------------------------------- navigation

  var PANELS = ['today', 'tehillim', 'tikkun', 'weekly', 'zmanim', 'search', 'about'];
  var loaded = { tikkun: false, library: false };

  function showPanel(name) {
    state.panel = name;

    // Moving to another page closes the sidebar. Without this, tapping
    // "Open" inside it left it hanging over the page you asked for.
    closeSidebar(false);

    // The search bar belongs to the search page. Going somewhere else puts it
    // away; coming back to search brings it out, since an empty search page
    // with no box on it is a dead end.
    if (name === 'search') {
      if (!searchBarOpen()) openSearchBar();
    } else if (searchBarOpen()) {
      closeSearchBar();
    }

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

    if (name === 'search' && !searchState.query) runSearch('');

    // The list of seforim comes from the app itself, so the page cannot drift
    // out of step with what is actually being read.
    if (name === 'about' && !loaded.library) {
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
    if (name === 'about') {
      fetch('/api/health', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (h) { setText('aboutBuild', 'Version ' + h.build); })
        .catch(function () { setText('aboutBuild', ''); });
    }

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
    applyFont();
    setUpFontChoice();
    applyReadingPrefs();
    wakeUpTouchPresses();
    followPresses();
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
    Array.prototype.forEach.call(document.querySelectorAll('[data-goto]'), function (b) {
      b.addEventListener('click', function () { showPanel(b.getAttribute('data-goto')); });
    });

    on('placeBtn', 'click', askForLocation);
    on('aboutLocation', 'click', askForLocation);
    on('themeBtn', 'click', toggleTheme);
    setUpReminder();

    wireSearchBar();
    wireSidebar();

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

    on('openFull', 'click', function () {
      var full = $('sparkFull');
      if (!full) return;
      var open = full.hidden;
      full.hidden = !open;
      setText('openFull', open ? 'Hide the lesson' : 'Read the whole lesson');
      if (open) replay(full);
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
  var PRESSABLE = '.btn, .pill, .chapters button, .quick-card, .stepper button,' +
                  '.icon-btn, .aa, .resume button, .tab, .chip-tag';

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
