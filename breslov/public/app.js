/* Breslov Daily -- the browser side.
   Plain JavaScript, no build step, no frameworks. */

(function () {
  'use strict';

  var STORE = {
    place: 'bd.place',
    english: 'bd.english',
    fontScale: 'bd.fontScale',
    lastToday: 'bd.lastToday',
  };

  /** Safe localStorage -- Private Browsing can make it throw. */
  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  var DEFAULT_PLACE = {
    name: 'Brooklyn, NY',
    lat: 40.6501,
    lng: -73.9496,
    tz: 'America/New_York',
  };

  var state = {
    place: load(STORE.place, DEFAULT_PLACE),
    english: load(STORE.english, true),
    fontScale: load(STORE.fontScale, 1),
    today: null,
    tikkunChapter: 0,
  };

  var $ = function (id) { return document.getElementById(id); };

  // ------------------------------------------------------------ requests

  function placeQuery() {
    var p = state.place || DEFAULT_PLACE;
    var tz = p.tz;
    if (!tz) {
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { tz = DEFAULT_PLACE.tz; }
    }
    return 'lat=' + encodeURIComponent(p.lat) +
           '&lng=' + encodeURIComponent(p.lng) +
           '&tz=' + encodeURIComponent(tz) +
           '&name=' + encodeURIComponent(p.name || '');
  }

  function api(path) {
    var url = '/api/' + path + (path.indexOf('?') === -1 ? '?' : '&') + placeQuery();
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('Request failed (' + r.status + ')');
      return r.json();
    });
  }

  // ------------------------------------------------------------ drawing text

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /** Turn an array of lines into paragraphs. Uses textContent, never innerHTML. */
  function paragraphs(lines, className) {
    var wrap = el('div', className);
    (lines || []).forEach(function (line) {
      String(line).split(/\n{2,}/).forEach(function (chunk) {
        var t = chunk.trim();
        if (t) wrap.appendChild(el('p', null, t));
      });
    });
    return wrap;
  }

  /** One passage: Hebrew, then English, then the credit line. */
  function passage(data, label) {
    var box = el('div', 'passage');
    if (label) box.appendChild(el('div', 'passage-label', label));
    if (data.hebrew && data.hebrew.length) box.appendChild(paragraphs(data.hebrew, 'he'));
    if (data.english && data.english.length) box.appendChild(paragraphs(data.english, 'en'));

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
    box.appendChild(document.createElement('br'));
    box.appendChild(document.createTextNode(
      'The words come straight from Sefaria, and nothing is shown unless it arrives from there. ' +
      (data && data.hint ? data.hint : 'Check the connection and pull down to refresh.')
    ));
    return box;
  }

  function fill(node, child) {
    node.textContent = '';
    node.appendChild(child);
  }

  // ------------------------------------------------------------ panels

  function renderToday(data) {
    state.today = data;
    save(STORE.lastToday, data);

    var cal = data.calendar;
    $('hebDate').textContent = cal.hebrew.gematriya || cal.hebrew.en;
    $('gregDate').textContent = cal.gregorian.display;
    $('placeName').textContent = cal.place.name;

    var next = data.zmanim.next;
    var nz = $('nextZman');
    if (next) {
      nz.hidden = false;
      nz.textContent = '';
      nz.appendChild(document.createTextNode('Next: '));
      nz.appendChild(el('strong', null, next.en));
      nz.appendChild(document.createTextNode(' '));
      nz.appendChild(el('span', 'he', next.he));
      nz.appendChild(document.createTextNode(' · ' + next.time + ' (' + friendlyMinutes(next.minutesAway) + ')'));
    } else {
      nz.hidden = true;
    }

    // Today's teaching
    if (data.spark && data.spark.available) {
      $('sparkRef').textContent = data.spark.heading || data.spark.ref;
      fill($('sparkBody'), passage(data.spark));
    } else {
      $('sparkRef').textContent = '';
      fill($('sparkBody'), unavailableNotice(data.spark, 'daily teaching'));
    }

    // Tehillim summary
    if (data.tehillim && data.tehillim.available) {
      $('tehillimTag').textContent = data.tehillim.label;
      $('tehillimHint').textContent =
        'Day ' + data.tehillim.day + ' of the Hebrew month — ' + data.tehillim.cycle + '.';
    } else {
      $('tehillimTag').textContent = '';
    }

    // Shabbos
    $('parshaTag').textContent = cal.parsha ? (cal.parsha.he || cal.parsha.en) : '';
    var rows = [];
    if (cal.parsha) rows.push(['Parsha', cal.parsha.en + (cal.parsha.isDouble ? ' (double)' : '')]);
    if (cal.candles) rows.push(['Candle lighting', clock(cal.candles.time) + ' · ' + prettyDate(cal.candles.date)]);
    if (cal.havdalah) rows.push(['Havdalah', clock(cal.havdalah.time) + ' · ' + prettyDate(cal.havdalah.date)]);
    (cal.holidays || []).forEach(function (h) {
      if (h.en.indexOf('Candle') === 0 || h.en.indexOf('Havdalah') === 0) return;
      rows.push([prettyDate(h.date), h.en]);
    });
    var kv = el('div');
    rows.forEach(function (r) {
      var row = el('div', 'kv-row');
      row.appendChild(el('span', 'k', r[0]));
      row.appendChild(el('span', 'v', r[1]));
      kv.appendChild(row);
    });
    fill($('shabbosTimes'), kv);

    renderZmanim(data.zmanim, cal);
    renderWeekly(data.weekly);
    renderTehillim(data.tehillim);
  }

  function renderZmanim(zmanim, cal) {
    $('zmanimPlace').textContent = cal.place.name;
    var list = el('div');
    (zmanim.times || []).forEach(function (t) {
      var row = el('div', 'zman' + (zmanim.next && zmanim.next.key === t.key ? ' is-next' : ''));
      var labels = el('div', 'labels');
      labels.appendChild(el('div', 'en-label', t.en));
      labels.appendChild(el('div', 'he-label', t.he));
      if (t.note) labels.appendChild(el('div', 'note', t.note));
      row.appendChild(labels);
      row.appendChild(el('div', 't', t.time));
      list.appendChild(row);
    });
    fill($('zmanimList'), list);
  }

  function renderTehillim(teh) {
    $('tehillimDayTag').textContent = teh && teh.available ? teh.label : '';
    if (!teh || !teh.available) {
      fill($('tehillimBody'), unavailableNotice(teh, "day's Tehillim"));
      return;
    }
    var wrap = el('div');
    teh.parts.forEach(function (part) { wrap.appendChild(passage(part, part.label)); });
    fill($('tehillimBody'), wrap);
  }

  function renderWeekly(weekly) {
    if (!weekly || !weekly.available) {
      $('weeklyTag').textContent = '';
      $('weeklyWhy').textContent = '';
      fill($('weeklyBody'), unavailableNotice(weekly, 'weekly Torah'));
      return;
    }
    $('weeklyTag').textContent = weekly.parshaHe || weekly.parsha || '';
    $('weeklyWhy').textContent =
      (weekly.mode === 'parsha'
        ? 'Parashas ' + weekly.parsha + ' — ' + weekly.why
        : weekly.why) + ' It stays the same all week.';
    fill($('weeklyBody'), passage(weekly, weekly.ref));
  }

  function renderTikkun(tikkun) {
    if (!tikkun || !tikkun.available) {
      fill($('tikkunBody'), unavailableNotice(tikkun, 'Tikkun HaKlali'));
      return;
    }
    var nav = el('div');
    tikkun.parts.forEach(function (part, i) {
      var b = el('button', i === state.tikkunChapter ? 'active' : null, String(part.chapter));
      b.type = 'button';
      b.addEventListener('click', function () {
        state.tikkunChapter = i;
        renderTikkun(tikkun);
        $('tikkunBody').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      nav.appendChild(b);
    });
    fill($('tikkunNav'), nav);
    fill($('tikkunBody'), passage(tikkun.parts[state.tikkunChapter],
      tikkun.parts[state.tikkunChapter].label));
  }

  // ------------------------------------------------------------ helpers

  function clock(hhmm) {
    if (!hhmm) return '';
    var bits = String(hhmm).split(':');
    var h = Number(bits[0]);
    var suffix = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + bits[1] + ' ' + suffix;
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

  function applyReadingPrefs() {
    document.body.classList.toggle('hide-english', !state.english);
    var btn = $('toggleEnglish');
    btn.setAttribute('aria-pressed', String(state.english));
    btn.textContent = state.english ? 'English on' : 'English off';
    document.documentElement.style.setProperty('--reading', (1.05 * state.fontScale).toFixed(3) + 'rem');
  }

  // ------------------------------------------------------------ tabs

  var loaded = { tikkun: false };

  function showPanel(name) {
    ['today', 'tehillim', 'tikkun', 'weekly', 'zmanim'].forEach(function (p) {
      $('panel-' + p).hidden = p !== name;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('active', t.getAttribute('data-panel') === name);
    });
    window.scrollTo({ top: 0, behavior: 'auto' });

    if (name === 'tikkun' && !loaded.tikkun) {
      loaded.tikkun = true;
      api('tikkun').then(renderTikkun).catch(function (err) {
        fill($('tikkunBody'), unavailableNotice({ hint: err.message }, 'Tikkun HaKlali'));
        loaded.tikkun = false;
      });
    }
  }

  // ------------------------------------------------------------ location

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

  // ------------------------------------------------------------ start up

  function refresh() {
    return api('today').then(function (data) {
      $('offlineNote').hidden = true;
      renderToday(data);
    }).catch(function (err) {
      var saved = load(STORE.lastToday, null);
      if (saved) {
        $('offlineNote').hidden = false;
        renderToday(saved);
      } else {
        fill($('sparkBody'), unavailableNotice({ hint: err.message }, "day's learning"));
      }
    });
  }

  function init() {
    applyReadingPrefs();

    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      tab.addEventListener('click', function () { showPanel(tab.getAttribute('data-panel')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-goto]'), function (b) {
      b.addEventListener('click', function () { showPanel(b.getAttribute('data-goto')); });
    });

    $('placeBtn').addEventListener('click', askForLocation);

    $('toggleEnglish').addEventListener('click', function () {
      state.english = !state.english;
      save(STORE.english, state.english);
      applyReadingPrefs();
    });
    $('fontLarger').addEventListener('click', function () {
      state.fontScale = Math.min(1.9, state.fontScale + 0.12);
      save(STORE.fontScale, state.fontScale);
      applyReadingPrefs();
    });
    $('fontSmaller').addEventListener('click', function () {
      state.fontScale = Math.max(0.8, state.fontScale - 0.12);
      save(STORE.fontScale, state.fontScale);
      applyReadingPrefs();
    });

    // Show yesterday's saved copy instantly, then update from the network.
    var saved = load(STORE.lastToday, null);
    if (saved) { try { renderToday(saved); } catch (e) { /* ignore a stale shape */ } }
    refresh();

    // Re-check when the app comes back to the foreground (the day may have turned).
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refresh();
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(function () { /* offline mode is optional */ });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
