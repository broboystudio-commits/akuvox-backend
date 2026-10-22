/* ===========================================================================
   Breslov Daily — the Apple-design copy: motion.

   Loaded only when this tab asked for the copy (?design=apple). The current
   design never runs it. It reaches into the app through two doors the app
   already has -- the `bd:panel` event fired whenever the page changes, and
   the back rows already in the markup -- and nothing else.

   What it does, by the skill's own section numbers:
     §4      a spring with Apple's two parameters, damping ratio and response
     §3, §5  interruptible: a new target keeps position AND velocity
     §6      Apple's momentum projection, to decide where a flick lands
     §9      rubber-banding past the edge
     §7      push and pop: in from the right, back out to the right
     §2      swipe back from the left edge, 1:1 under the finger
     §8, §15 large titles that hand over to an inline title in the bar
     §12     the bar's material arrives with the content scrolled under it
     §13     a haptic tick per row on the number wheel, where the phone has one
     §14     reduced motion swaps every slide for a cross-fade
   =========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  if (root.getAttribute('data-design') !== 'apple') return;

  // ---------------------------------------------------------------- §4 spring
  /**
   * A damped spring, in Apple's terms rather than physics ones.
   *
   * damping 1 is critically damped (no overshoot); below 1 it bounces.
   * response is how quickly it gets there, in seconds -- not a duration: a
   * spring has none, it settles when it settles.
   *
   * Mass 1, stiffness (2π / response)², damping coefficient 4π·ζ / response:
   * the conversion Apple's own UISpringTimingParameters makes. Integrated in
   * small fixed steps so a long frame cannot make it explode.
   */
  function Spring(o) {
    this.x = o.from;
    this.v = o.velocity || 0;
    this.to = o.to;
    this.damping = o.damping == null ? 1 : o.damping;
    this.response = o.response || 0.4;
    this.precision = o.precision || 0.0008;
    this.onUpdate = o.onUpdate;
    this.onRest = o.onRest;
    this.raf = 0;
    this.last = 0;
    this.start();
  }
  Spring.prototype.start = function () {
    var self = this;
    cancelAnimationFrame(this.raf);
    this.last = 0;
    function tick(now) {
      if (!self.last) self.last = now;
      var dt = Math.min(0.064, (now - self.last) / 1000);
      self.last = now;
      var k = Math.pow(2 * Math.PI / self.response, 2);
      var c = 4 * Math.PI * self.damping / self.response;
      var steps = Math.max(1, Math.ceil(dt / 0.002));
      var h = dt / steps;
      for (var i = 0; i < steps; i++) {
        var a = -k * (self.x - self.to) - c * self.v;
        self.v += a * h;
        self.x += self.v * h;
      }
      var resting = Math.abs(self.x - self.to) < self.precision &&
                    Math.abs(self.v) < self.precision * 12;
      if (resting) { self.x = self.to; self.v = 0; }
      self.onUpdate(self.x);
      if (resting) {
        self.raf = 0;
        if (self.onRest) self.onRest(self.x);
        return;
      }
      self.raf = requestAnimationFrame(tick);
    }
    this.raf = requestAnimationFrame(tick);
  };
  /** §3: a new target keeps where it is and how fast it is going. */
  Spring.prototype.retarget = function (to, velocity) {
    this.to = to;
    if (velocity != null) this.v = velocity;
    if (!this.raf) this.start();
  };
  Spring.prototype.stop = function () {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  };

  /** §6: where a flick would come to rest -- Apple's own function. */
  function project(velocity, rate) {
    rate = rate || 0.998;
    return (velocity / 1000) * rate / (1 - rate);
  }
  /** §9: the further past the edge, the less it follows. */
  function rubberband(over, dimension, c) {
    c = c || 0.55;
    return (over * dimension * c) / (dimension + c * Math.abs(over));
  }

  function reduced() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }
  function haptic(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not on iOS */ }
  }
  /**
   * Safari in a browser tab owns the left edge: its own swipe goes back a page
   * and plays its own animation. Doing ours as well would be two at once, so
   * there the edge is left to Safari and history moves are not animated.
   * Added to the home screen, there is no browser gesture and the edge is ours.
   */
  function safariTab() {
    var ios = /iP(hone|ad|od)/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!ios) return false;
    var standalone = navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    return !standalone;
  }

  // ---------------------------------------------------------------- the pages
  function panelEl(name) { return document.getElementById('panel-' + name); }
  function current() {
    var p = document.querySelector('.panel:not([hidden]):not([data-ghost])');
    return p ? p.id.replace('panel-', '') : null;
  }
  /**
   * Which page each page sits inside.
   *
   * Most pages say so themselves with a back row. Five do not: Tehillim, the
   * Tikkun, the Dvar Torah, Privacy and Terms have no way back on the page
   * at all in the current design -- you leave by the tab bar. The skill's
   * wayfinding rule is that every screen answers "how do I get out", and on
   * iOS a pushed screen always has a back button, so this copy gives those
   * five one (and only this copy: the current design is not touched).
   */
  var PARENT = {
    tehillim: 'read', tikkun: 'read', torah: 'read',
    weekly: 'week', shabbos: 'week', yahrzeit: 'week',
    settings: 'more', about: 'more', sources: 'more', privacy: 'more', terms: 'more',
  };
  function parentOf(name) {
    var p = name && panelEl(name);
    var b = p && p.querySelector('.backrow');
    if (b && b.getAttribute('data-goto')) return b.getAttribute('data-goto');
    return (name && PARENT[name]) || null;
  }
  /** Go up one level: the page's own back row if it has one, else its hub's tab. */
  function goBack(name) {
    var p = panelEl(name);
    var own = p && p.querySelector('.backrow[data-goto]');
    if (own) { own.click(); return; }
    var parent = parentOf(name);
    var tab = parent && document.querySelector('.tab[data-panel="' + parent + '"]');
    if (tab) tab.click();
  }
  function addMissingBackRows() {
    Object.keys(PARENT).forEach(function (name) {
      var p = panelEl(name);
      if (!p || p.querySelector('.backrow')) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'backrow ap-added';
      var chev = document.createElement('span');
      chev.setAttribute('aria-hidden', 'true');
      b.appendChild(chev);
      b.appendChild(document.createTextNode(titleOf(PARENT[name]) || 'Back'));
      b.addEventListener('click', function () { goBack(name); });
      p.insertBefore(b, p.firstChild);
    });
  }
  function titleOf(name) {
    var p = name && panelEl(name);
    var h = p && p.querySelector('.hubhead h1');
    if (h) return h.textContent.trim();
    var tab = document.querySelector('.tab[data-panel="' + name + '"]');
    return tab ? tab.textContent.trim() : '';
  }

  // ------------------------------------------------------- §7 the stage
  /**
   * While a page moves, what moves is a picture of it.
   *
   * The real page has already changed underneath -- the app swaps panels at
   * once -- and the stage covers it for the length of the motion with two
   * sheets: a copy of the page you left and a copy of the page you arrived
   * at, each laid out exactly where the real one sits. The stage takes no
   * taps (§3: never lock input); a finger landing anywhere ends the motion
   * on the spot, so what you see is always what you are touching.
   *
   * The copies keep their ids, so the stylesheet styles them the same as the
   * real thing. They are appended after the real page, so every lookup by
   * id still finds the real one first, and they are gone within half a
   * second.
   */
  var realMain = null;
  var stage = null;
  var motion = null;
  var placeFn = null;

  function sheetFor(panel, scrolledBy) {
    var sheet = document.createElement('div');
    sheet.className = 'ap-sheet';
    var m = document.createElement('main');
    m.setAttribute('aria-hidden', 'true');
    m.inert = true;
    var r = realMain.getBoundingClientRect();
    var docTop = r.top + window.scrollY;
    m.style.left = r.left + 'px';
    m.style.width = r.width + 'px';
    m.style.top = (docTop - scrolledBy) + 'px';
    var copy = panel.cloneNode(true);
    copy.hidden = false;
    copy.setAttribute('data-ghost', '');
    copy.classList.remove('is-entering', 'is-leaving');
    copy.removeAttribute('data-to');
    m.appendChild(copy);
    sheet.appendChild(m);
    var dim = document.createElement('div');
    dim.className = 'ap-dim';
    sheet.appendChild(dim);
    sheet._dim = dim;
    return sheet;
  }

  function clearStage() {
    if (motion) { motion.stop(); motion = null; }
    if (stage) { stage.remove(); stage = null; }
    placeFn = null;
  }

  /**
   * Lay the two sheets out for a given t.
   *
   * t is how far the TOP sheet has moved off to the right: 0 is covering the
   * screen, 1 is gone. The sheet underneath sits a third of the way to the
   * left and dimmed, and comes back as the top one leaves -- the parallax a
   * navigation stack has on iOS.
   */
  function buildStage(under, over) {
    clearStage();
    over.classList.add('is-top');
    stage = document.createElement('div');
    stage.className = 'ap-stage';
    stage.appendChild(under);
    stage.appendChild(over);
    document.body.appendChild(stage);
    var W = window.innerWidth;
    var still = reduced();
    placeFn = function (t) {
      if (still) {
        // §14: no travel. The top sheet fades instead of sliding.
        over.style.opacity = String(Math.max(0, Math.min(1, 1 - t)));
        return;
      }
      var x = t * W;
      over.style.transform = 'translate3d(' + x + 'px,0,0)';
      under.style.transform = 'translate3d(' + (-0.3 * W * (1 - Math.max(0, t))) + 'px,0,0)';
      under._dim.style.opacity = String(Math.max(0, Math.min(1, 1 - t)));
    };
    return W;
  }

  /** push: the new page comes in over the old. pop: the old goes off the new. */
  function playNavigation(kind, fromName, toName, fromScroll) {
    var fromP = panelEl(fromName);
    var toP = panelEl(toName);
    if (!fromP || !toP) return;
    var under, over, from, to;
    if (kind === 'push') {
      under = sheetFor(fromP, fromScroll);
      over = sheetFor(toP, 0);
      from = 1; to = 0;
    } else {
      under = sheetFor(toP, 0);
      over = sheetFor(fromP, fromScroll);
      from = 0; to = 1;
    }
    buildStage(under, over);
    placeFn(from);
    // Critically damped (§4): nothing was flicked, so nothing overshoots.
    motion = new Spring({
      from: from, to: to, damping: 1, response: reduced() ? 0.22 : 0.42,
      onUpdate: function (t) { if (placeFn) placeFn(t); },
      onRest: clearStage,
    });
  }

  // -------------------------------------------------- reading what happened
  var shown = null;
  var lastY = 0;
  var intent = null;
  var intentAt = 0;
  var suppressNext = false;
  var swipe = null;

  window.addEventListener('scroll', function () {
    // The position before the app's own scrollTo(0) on a page change: the
    // scroll event for that arrives a frame later, after this has been read.
    lastY = window.scrollY;
  }, { passive: true });

  document.addEventListener('pointerdown', function (e) {
    lastY = window.scrollY;
    var t = e.target;
    intent = t.closest && t.closest('.tabs') ? 'tab'
      : t.closest && t.closest('.backrow, .ap-back') ? 'back'
      : 'tap';
    intentAt = performance.now();
    // §3: a finger landing ends whatever was moving -- except the settle of
    // a swipe, which the finger may be catching to drag again.
    if (stage && !(swipe && swipe.settling)) clearStage();
  }, true);
  window.addEventListener('wheel', function () { if (stage && !swipe) clearStage(); }, { passive: true });

  function onPanel(e) {
    var to = e.detail;
    var from = shown;
    shown = to;
    scheduleNav();
    if (!from || from === to) return;
    if (suppressNext) { suppressNext = false; return; }
    if (window.__bdMirroring) return;

    var recent = performance.now() - intentAt < 1200 ? intent : null;
    if (!recent && safariTab()) return;          // Safari animated it already
    var kind = 'none';
    if (recent === 'tab') kind = 'none';         // tabs switch at once, as on iOS
    else if (parentOf(from) === to || recent === 'back') kind = 'pop';
    else if (parentOf(to) && parentOf(from) !== to) kind = 'push';
    if (kind !== 'none') playNavigation(kind, from, to, lastY);
  }

  // --------------------------------------------- §2 swipe back from the edge
  var EDGE = 22;

  /**
   * How fast the finger was going when it let go.
   *
   * Measured over the last 60ms ending at the LIFT, with the lift itself as
   * the final sample. The first version measured up to the last movement
   * instead -- and a finger that drags, stops, holds still and then lifts
   * sends no movement while it is still, so it was read as still travelling
   * at the speed it had before it stopped. iOS reads a resting finger as
   * velocity zero, and so does this now: if nothing but the lift is inside
   * the window, there was no velocity.
   */
  function samplesVelocity(samples) {
    var now = samples[samples.length - 1];
    var first = now;
    for (var i = samples.length - 2; i >= 0; i--) {
      if (now.t - samples[i].t > 60) break;
      first = samples[i];
    }
    var dt = (now.t - first.t) / 1000;
    return dt > 0.004 ? (now.x - first.x) / dt : 0;
  }

  function swipeStart(e) {
    if (e.pointerType === 'mouse') return;
    if (safariTab()) return;
    if (document.querySelector('.topbar.is-searching')) return;

    // Catching a page that is still settling from the last swipe (§3): grab
    // it where it is, at the edge of the moving sheet, and carry on from
    // there -- not from where it was going.
    // The moving page is the whole sheet right of its left edge, so a finger
    // landing anywhere on it has grabbed it -- not only one landing on the
    // edge. (The first version accepted only the edge, and a finger aimed at
    // a sheet that is moving 1px a millisecond lands on the sheet, not on
    // where its edge was.) A finger on the page uncovered to its left is a
    // tap on that page, so the settle finishes at once and the tap goes
    // through to what is about to be there.
    if (swipe && swipe.settling && stage) {
      var at = swipe.t * window.innerWidth;
      if (e.clientX < at - (EDGE + 14)) swipe.finish();
    }
    if (swipe && swipe.settling && stage) {
      var at2 = swipe.t * window.innerWidth;
      if (e.clientX >= at2 - (EDGE + 14)) {
        motion.stop();
        motion = null;
        swipe.settling = false;
        swipe.id = e.pointerId;
        swipe.x0 = e.clientX - at2;
        swipe.y0 = e.clientY;
        swipe.samples = [{ t: e.timeStamp, x: e.clientX }];
        swipe.engaged = true;
        return;
      }
    }

    if (e.clientX > EDGE) return;
    var name = current();
    var parent = parentOf(name);
    if (!parent) return;
    swipe = {
      id: e.pointerId, x0: e.clientX, y0: e.clientY,
      name: name, parent: parent, engaged: false, settling: false, t: 0,
      samples: [{ t: e.timeStamp, x: e.clientX }],
    };
  }

  function swipeMove(e) {
    if (!swipe || swipe.settling || e.pointerId !== swipe.id) return;
    var dx = e.clientX - swipe.x0;
    var dy = e.clientY - swipe.y0;
    if (!swipe.engaged) {
      // §10: a little movement before deciding, and up-and-down means a
      // scroll -- let it go.
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }
      if (dx < 10) return;
      swipe.engaged = true;
      var under = sheetFor(panelEl(swipe.parent), 0);
      var over = sheetFor(panelEl(swipe.name), window.scrollY);
      buildStage(under, over);
    }
    swipe.samples.push({ t: e.timeStamp, x: e.clientX });
    if (swipe.samples.length > 12) swipe.samples.shift();
    var W = window.innerWidth;
    // §2: the sheet's edge stays exactly under the finger. Past the left
    // edge it resists rather than stopping dead (§9).
    var x = dx >= 0 ? dx : rubberband(dx, W);
    swipe.t = x / W;
    if (placeFn) placeFn(swipe.t);
  }

  function swipeEnd(e) {
    if (!swipe || swipe.settling || e.pointerId !== swipe.id) return;
    if (!swipe.engaged) { swipe = null; return; }

    // A drag that ends on a row would otherwise also be a tap on that row.
    var eatClick = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
    document.addEventListener('click', eatClick, true);
    setTimeout(function () { document.removeEventListener('click', eatClick, true); }, 400);

    var W = window.innerWidth;
    if (e.type !== 'pointercancel') swipe.samples.push({ t: e.timeStamp, x: e.clientX });
    var v = e.type === 'pointercancel' ? 0 : samplesVelocity(swipe.samples);
    var x = swipe.t * W;
    // §6 and the quick reference: a real flick is decided by its direction;
    // a slow release by where the projected momentum would carry it.
    var commit = Math.abs(v) > 320 ? v > 0 : (x + project(v)) > W / 2;
    var s = swipe;
    s.settling = true;
    var done = false;
    function land() {
      if (done) return;
      done = true;
      motion = null;
      if (commit) {
        suppressNext = true;
        goBack(s.name);
        suppressNext = false;
      }
      clearStage();
      if (swipe === s) swipe = null;
    }
    s.finish = function () { if (motion) motion.stop(); land(); };
    motion = new Spring({
      from: s.t, to: commit ? 1 : 0,
      // §5: the spring starts at the finger's own speed, so there is no seam
      // between dragging the page and the page carrying on.
      velocity: v / W,
      damping: 1, response: 0.36,
      onUpdate: function (t) { s.t = t; if (placeFn) placeFn(t); },
      onRest: land,
    });
  }

  // ------------------------------------- §8 §15 large title → inline title
  var bar = null;
  var nav = null;
  var navBack = null;
  var navTitle = null;
  var navQueued = false;

  function buildNav() {
    bar = document.querySelector('.topbar');
    var row = bar && bar.querySelector('.bar');
    if (!row) return;
    nav = document.createElement('div');
    nav.className = 'ap-nav';
    navBack = document.createElement('button');
    navBack.type = 'button';
    navBack.className = 'ap-back';
    navBack.tabIndex = -1;
    navTitle = document.createElement('span');
    navTitle.className = 'ap-title';
    navTitle.setAttribute('aria-hidden', 'true');
    nav.appendChild(navBack);
    nav.appendChild(navTitle);
    row.appendChild(nav);
    navBack.addEventListener('click', function () { goBack(current()); });
    navBack.addEventListener('pointerdown', function () { navBack.classList.add('is-pressed'); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) {
      navBack.addEventListener(n, function () { navBack.classList.remove('is-pressed'); });
    });
  }

  /**
   * How far the large title has gone under the bar, 0 to 1.
   *
   * It starts 6px before the title touches the bar and is complete when
   * 60% of it is under -- not 100%. Mapped over the title's whole height,
   * a short page (About, say) could not scroll far enough to finish, and the
   * bar sat for good at 63%: half a date, half a title, neither readable.
   */
  function titleProgress(h1) {
    var hr = h1.getBoundingClientRect();
    var br = bar.getBoundingClientRect();
    var overlap = br.bottom - hr.top;
    var span = hr.height * 0.6 + 6;
    return {
      t: Math.max(0, Math.min(1, (overlap + 6) / span)),
      overlap: overlap,
      span: span,
    };
  }

  /**
   * When scrolling stops with the title half under the bar, finish the job
   * one way or the other -- the way UINavigationBar does. A nav bar is never
   * left showing half of each.
   */
  var snapTimer = 0;
  var fingersDown = 0;
  function snapTitle() {
    if (fingersDown > 0) return;
    var panel = panelEl(current());
    var h1 = panel && panel.querySelector('.hubhead h1');
    if (!h1 || bar.classList.contains('is-searching')) return;
    var p = titleProgress(h1);
    if (p.t <= 0.001 || p.t >= 0.999) return;
    var y = window.scrollY;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    // Scroll positions at which the title is fully out and fully back.
    var collapsed = y + (p.span - 6 - p.overlap) + 1;
    var expanded = Math.max(0, y - (p.overlap + 6) - 1);
    var target = (p.t >= 0.5 && collapsed <= max) ? collapsed : expanded;
    window.scrollTo({ top: target, behavior: reduced() ? 'auto' : 'smooth' });
  }
  function onScrollForTitle() {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(snapTitle, 140);
  }

  function scheduleNav() {
    if (navQueued) return;
    navQueued = true;
    requestAnimationFrame(function () { navQueued = false; updateNav(); });
  }

  function updateNav() {
    if (!bar) return;
    // §12: the material comes in over the first dozen pixels of scroll, with
    // whatever is passing under it -- continuous, not a switch.
    var edge = Math.max(0, Math.min(1, window.scrollY / 12));
    bar.style.setProperty('--edge', edge.toFixed(3));

    var name = current();
    var panel = panelEl(name);
    var h1 = panel && panel.querySelector('.hubhead h1');
    var t = 0;
    if (h1 && nav && !bar.classList.contains('is-searching')) {
      t = titleProgress(h1).t;
    }
    bar.style.setProperty('--collapse', t.toFixed(3));
    bar.classList.toggle('is-collapsed', t > 0.5);
    if (!nav) return;
    navTitle.textContent = h1 ? h1.textContent.trim() : '';
    var parent = parentOf(name);
    navBack.hidden = !parent;
    if (parent) {
      var label = titleOf(parent) || 'Back';
      navBack.textContent = label;
      navBack.setAttribute('aria-label', 'Back to ' + label);
    }
    navBack.tabIndex = t > 0.5 ? 0 : -1;
  }

  // ------------------------------------------- §13 the wheel's detent ticks
  /**
   * UIPickerView taps you once for every row that crosses the middle. Here
   * that is a 4ms buzz, on phones that have a buzzer to give (iOS Safari
   * does not let a page use one; Android does). Only while a finger is on
   * the wheel or its momentum is still carrying it -- never when the page
   * moves it.
   */
  var wheelLiveUntil = 0;
  function watchWheels() {
    document.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('.wheel-list')) wheelLiveUntil = Infinity;
    }, true);
    document.addEventListener('pointerup', function () {
      if (wheelLiveUntil === Infinity) wheelLiveUntil = performance.now() + 1400;
    }, true);
    var mo = new MutationObserver(function (list) {
      if (performance.now() > wheelLiveUntil) return;
      for (var i = 0; i < list.length; i++) {
        var n = list[i].target;
        if (n.classList && n.classList.contains('wheel-item') &&
            n.classList.contains('is-chosen') &&
            !(list[i].oldValue || '').match(/\bis-chosen\b/)) {
          haptic(4);
          return;
        }
      }
    });
    mo.observe(realMain, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  }

  // ------------------------------------------------------------------ boot
  function boot() {
    realMain = document.querySelector('main');
    if (!realMain) return;
    shown = current();
    addMissingBackRows();
    buildNav();
    document.addEventListener('bd:panel', onPanel);
    document.addEventListener('pointerdown', swipeStart, { passive: true });
    document.addEventListener('pointermove', swipeMove, { passive: true });
    document.addEventListener('pointerup', swipeEnd, { passive: true });
    document.addEventListener('pointercancel', swipeEnd, { passive: true });
    window.addEventListener('scroll', scheduleNav, { passive: true });
    window.addEventListener('scroll', onScrollForTitle, { passive: true });
    document.addEventListener('pointerdown', function () { fingersDown++; }, true);
    ['pointerup', 'pointercancel'].forEach(function (n) {
      document.addEventListener(n, function () {
        fingersDown = Math.max(0, fingersDown - 1);
        onScrollForTitle();
      }, true);
    });
    window.addEventListener('resize', scheduleNav);
    // The search bar opening and closing changes what the bar should show.
    new MutationObserver(scheduleNav).observe(bar || document.body,
      { attributes: true, attributeFilter: ['class'] });
    watchWheels();
    scheduleNav();
    root.setAttribute('data-design-ready', '');
  }

  // For the checks: the spring and the projection, to be tested on their own.
  window.__apple = {
    Spring: Spring, project: project, rubberband: rubberband,
    state: function () {
      return { stage: !!stage, swipe: swipe && { settling: swipe.settling, t: swipe.t, engaged: swipe.engaged } };
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
