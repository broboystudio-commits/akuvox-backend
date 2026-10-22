/**
 * The Apple-design copy, measured.
 *
 *   PORT=3222 node scripts/browser/stub-server.js &
 *   node scripts/browser/apple-copy.js
 *
 * Needs playwright-core (npm i --no-save playwright-core) and a Chromium;
 * CHROME= points at one if it is not where this machine keeps it.
 *
 * It checks the two promises the copy makes -- that the current design is
 * left exactly alone unless a tab asks for the copy, and that the copy does
 * what the apple-design skill says -- by driving real touches through the
 * browser's input layer and reading what is on screen, not what the
 * stylesheet says should be.
 */
const { chromium } = require('playwright-core');

const SITE = process.env.SITE || 'http://127.0.0.1:3222';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const say = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' -- ' + detail : ''}`);
  if (!ok) bad++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const txOf = (t) => {
  const m = /translate3d\((-?[\d.]+)px/.exec(t || '');
  return m ? Number(m[1]) : null;
};

async function open(browser, url, opts = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
    hasTouch: !!opts.touch, isMobile: !!opts.touch,
    reducedMotion: opts.reduced ? 'reduce' : 'no-preference',
    colorScheme: opts.dark ? 'dark' : 'light',
  });
  const page = await context.newPage();
  const errors = [];
  const asked = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => asked.push(new URL(r.url()).pathname));
  await page.goto(SITE + url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1300);
  return { context, page, errors, asked };
}

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-design-ready'), null, { timeout: 8000 });
}

/** Read the moving sheets every frame for a while. */
async function filmStage(page, ms) {
  return page.evaluate((dur) => new Promise((done) => {
    const frames = [];
    const t0 = performance.now();
    (function look() {
      const stage = document.querySelector('.ap-stage');
      const top = stage && stage.querySelector('.ap-sheet.is-top');
      frames.push({
        t: Math.round(performance.now() - t0),
        stage: !!stage,
        sheets: stage ? stage.querySelectorAll('.ap-sheet').length : 0,
        top: top ? top.style.transform : null,
        opacity: top ? top.style.opacity : null,
      });
      if (performance.now() - t0 < dur) requestAnimationFrame(look);
      else done(frames);
    })();
  }), ms);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  // ------------------------------------------------- the current design
  console.log('\nThe current design is left alone\n');
  {
    const { context, page, errors, asked } = await open(browser, '/');
    const r = await page.evaluate(() => ({
      design: document.documentElement.getAttribute('data-design'),
      lens: !!document.querySelector('.bar-lens'),
      stage: !!document.querySelector('.ap-stage, .ap-nav'),
    }));
    say('no design attribute without asking', r.design === null, String(r.design));
    say('the copy\'s files are never even requested',
      !asked.some((p) => p.startsWith('/apple/')), asked.filter((p) => p.startsWith('/apple/')).join(', ') || 'none');
    say('nothing of the copy is in the page', !r.stage);
    say('no errors', errors.length === 0, errors.join(' | ') || 'none');
    // The header still tucks away on scroll in the current design -- the one
    // behaviour the copy's hook changes, so the one most worth proving.
    await page.goto(SITE + '/zmanim', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(700);
    const tucked = await page.evaluate(() => document.querySelector('.topbar').classList.contains('is-tucked'));
    say('its header still tucks away on scroll', tucked);
    await context.close();
  }

  // ------------------------------------------------------ the copy loads
  console.log('\nThe copy loads only when asked, and stays\n');
  let apple;
  {
    apple = await open(browser, '/read?design=apple');
    const { page, errors } = apple;
    await ready(page);
    const r = await page.evaluate(() => {
      const tabs = getComputedStyle(document.querySelector('.tabs'));
      const lens = document.querySelector('.bar-lens');
      return {
        design: document.documentElement.getAttribute('data-design'),
        blur: (tabs.backdropFilter || tabs.webkitBackdropFilter || ''),
        lens: lens ? getComputedStyle(lens).display : 'absent',
        nav: !!document.querySelector('.topbar .ap-nav'),
        name: window.name,
      };
    });
    say('?design=apple switches this tab to the copy', r.design === 'apple');
    say('the tab bar is a translucent material (§12)', /blur\(20px\)/.test(r.blur), r.blur);
    say('no sliding pill in the tab bar', r.lens === 'none' || r.lens === 'absent', r.lens);
    say('the nav bar has an inline title ready (§8)', r.nav);
    say('no errors', errors.length === 0, errors.join(' | ') || 'none');

    await page.click('#panel-read [data-goto="tikkun"]');
    await page.waitForTimeout(900);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const kept = await page.evaluate(() => [document.documentElement.getAttribute('data-design'), location.pathname]);
    say('it survives moving and reloading in the same tab',
      kept[0] === 'apple', `${kept[1]} is still ${kept[0]}`);

    const other = await apple.context.newPage();
    await other.goto(SITE + '/read', { waitUntil: 'domcontentloaded' });
    await other.waitForTimeout(900);
    const leaked = await other.evaluate(() => document.documentElement.getAttribute('data-design'));
    say('and never leaks into another tab', leaked === null, String(leaked));
    await other.close();
  }

  // -------------------------------------------------------- §4 §6 the maths
  console.log('\nThe spring and the projection (§4, §5, §6, §9)\n');
  {
    const { page } = apple;
    const m = await page.evaluate(() => new Promise((done) => {
      const A = window.__apple;
      const out = { project: A.project(1000), band: A.rubberband(-200, 390) };
      // Same spring, one handed the finger's velocity: after the same few
      // frames it must be further along -- the velocity was carried.
      const xs = { still: [], moving: [] };
      let n = 0;
      const finish = () => { if (++n === 2) { out.xs = xs; done(out); } };
      const a = new A.Spring({ from: 0, to: 1, velocity: 0, damping: 1, response: 0.4,
        onUpdate: (x) => xs.still.push(x), onRest: finish });
      const b = new A.Spring({ from: 0, to: 1, velocity: 6, damping: 1, response: 0.4,
        onUpdate: (x) => xs.moving.push(x), onRest: finish });
      // And a critically damped spring must never overshoot.
      setTimeout(() => { a.stop(); b.stop(); out.xs = xs; done(out); }, 3000);
    }));
    say('the projection is Apple\'s exponential form',
      Math.abs(m.project - 499) < 0.01, `project(1000px/s) = ${m.project.toFixed(2)}px`);
    say('the rubber band gives a little, not a lot', m.band < 0 && m.band > -100, `-200px past the edge moves ${m.band.toFixed(1)}px`);
    const k = Math.min(4, m.xs.still.length - 1, m.xs.moving.length - 1);
    say('a spring handed the finger\'s velocity starts faster (§5)',
      m.xs.moving[k] > m.xs.still[k] + 0.05, `after ${k} frames: ${m.xs.moving[k].toFixed(3)} vs ${m.xs.still[k].toFixed(3)}`);
    const peak = Math.max(...m.xs.still);
    say('critically damped means no overshoot', peak <= 1.0005, `peak ${peak.toFixed(4)}`);
  }

  // --------------------------------------------------- §7 push and pop
  console.log('\nPush and pop (§7)\n');
  {
    const { page } = apple;
    await page.goto(SITE + '/read', { waitUntil: 'domcontentloaded' });
    await ready(page);
    await page.waitForTimeout(600);

    const filming = filmStage(page, 900);
    await page.click('#panel-read [data-goto="tehillim"]');
    const push = await filming;
    const moving = push.filter((f) => f.stage && f.top);
    const xs = moving.map((f) => txOf(f.top)).filter((x) => x !== null);
    say('a row pushes the next page in', moving.length > 5 && moving[0].sheets === 2,
      `${moving.length} frames with two sheets`);
    say('it comes in from the right and lands', xs.length && xs[0] > 100 && xs[xs.length - 1] < 4,
      xs.length ? `${Math.round(xs[0])}px → ${Math.round(xs[xs.length - 1])}px` : 'no frames');
    say('and only ever travels one way (no overshoot)',
      xs.every((x, i) => i === 0 || x <= xs[i - 1] + 0.5));
    say('then the stage is gone and the real page is there',
      !push[push.length - 1].stage &&
      await page.evaluate(() => !document.getElementById('panel-tehillim').hidden));

    const filming2 = filmStage(page, 900);
    await page.click('#panel-tehillim .backrow');
    const pop = await filming2;
    const xs2 = pop.filter((f) => f.top).map((f) => txOf(f.top)).filter((x) => x !== null);
    say('the back row pops it off to the right -- the way it came',
      xs2.length > 5 && xs2[0] < 60 && xs2[xs2.length - 1] > 300,
      xs2.length ? `${Math.round(xs2[0])}px → ${Math.round(xs2[xs2.length - 1])}px` : 'no frames');

    const filming3 = filmStage(page, 400);
    await page.click('.tab[data-panel="zmanim"]');
    const tab = await filming3;
    say('a tab switches at once, as on iOS', !tab.some((f) => f.stage), 'no stage');

    // §3: a finger landing mid-push ends it on the spot.
    await page.click('.tab[data-panel="read"]');
    await page.waitForTimeout(400);
    await page.click('#panel-read [data-goto="tikkun"]');
    await page.waitForTimeout(90);
    const during = await page.evaluate(() => !!document.querySelector('.ap-stage'));
    await page.mouse.down();
    const after = await page.evaluate(() => !!document.querySelector('.ap-stage'));
    await page.mouse.up();
    say('a touch mid-motion ends it at once (§3)', during && !after,
      `moving before the touch: ${during}, after: ${after}`);

    const dup = await page.evaluate(() => {
      const seen = {};
      let d = 0;
      document.querySelectorAll('[id]').forEach((e) => { if (seen[e.id]) d++; seen[e.id] = 1; });
      return d;
    });
    say('nothing left behind once it has landed', dup === 0, `${dup} duplicate ids`);
  }

  // -------------------------------------------- §2 §5 §6 §9 swipe back
  console.log('\nSwipe back from the edge (§2, §5, §6, §9)\n');
  {
    const { context, page, errors } = await open(browser, '/tehillim?design=apple', { touch: true });
    await ready(page);
    const cdp = await context.newCDPSession(page);
    // Every touch carries its own timestamp. Without one, CDP delivers moves
    // whenever it gets round to them -- 40 to 80ms apart -- so a "flick" sent
    // 12ms apart arrives as a slow drag that stopped, and is (correctly)
    // read as one. With timestamps, the browser's own event times are the
    // ones the gesture was meant to have.
    const base = Date.now() / 1000;
    let clock = 0;
    const touch = (type, x, y, gap) => {
      clock = gap == null ? Math.max(clock, Date.now() - base * 1000) : clock + gap;
      return cdp.send('Input.dispatchTouchEvent', {
        type, timestamp: base + clock / 1000,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
      });
    };
    async function drag(points, gap) {
      await touch('touchStart', points[0], 420);
      for (let i = 1; i < points.length; i++) { await wait(gap); await touch('touchMove', points[i], 420); }
    }
    /** A flick: moves exactly `gap` ms apart, lifted `lift` ms after the last. */
    async function flick(points, gap, lift) {
      await touch('touchStart', points[0], 420);
      for (let i = 1; i < points.length; i++) await touch('touchMove', points[i], 420, gap);
      await touch('touchEnd', 0, 0, lift);
    }
    const top = () => page.evaluate(() => {
      const s = document.querySelector('.ap-sheet.is-top');
      return s ? s.style.transform : null;
    });
    const where = () => page.evaluate(() => location.pathname);

    // Slow drag, partway: the sheet must sit exactly under the finger.
    await drag([4, 30, 70, 110, 150], 40);
    await wait(60);
    const x150 = txOf(await top());
    say('the page follows the finger 1:1 (§2)', x150 !== null && Math.abs(x150 - 146) <= 2,
      `finger moved 146px, page moved ${x150}px`);
    // Back past the start: resistance, not a wall.
    await touch('touchMove', -120, 420);
    await wait(40);
    const xNeg = txOf(await top());
    say('past the edge it resists (§9)', xNeg !== null && xNeg < 0 && xNeg > -60, `finger at -124px, page at ${xNeg && xNeg.toFixed(1)}px`);
    await touch('touchMove', 40, 420);
    // The finger rests before it lifts. A resting finger has no velocity.
    await wait(160);
    await touch('touchEnd');
    await wait(700);
    say('let go near the start, at rest: it settles back', (await where()) === '/tehillim', await where());

    // The case the first version got wrong: drag quickly, STOP, hold, lift.
    // No movement is sent while a finger is still, so velocity measured up
    // to the last movement still reads fast, and the page went back.
    await touch('touchStart', 4, 420);
    for (const x of [50, 100, 150]) await touch('touchMove', x, 420, 12);
    await touch('touchEnd', 0, 0, 220);
    await wait(700);
    say('dragged fast, then held still, then lifted: stays (velocity is zero)',
      (await where()) === '/tehillim', await where());

    // Slow drag well over half way: it goes.
    await drag([4, 60, 120, 180, 240, 280], 45);
    await wait(120);
    await touch('touchEnd');
    await wait(800);
    say('let go past half way: it goes back', (await where()) === '/read', await where());

    // A flick: short and fast. Position alone would cancel it; momentum
    // projection says it is going, and the direction of a real flick wins.
    await page.goto(SITE + '/tehillim', { waitUntil: 'domcontentloaded' });
    await ready(page);
    await page.waitForTimeout(500);
    await flick([4, 30, 60, 95], 12, 8);
    await wait(800);
    say('a short flick still goes back (§6)', (await where()) === '/read', await where());

    // A vertical drag that starts at the edge is a scroll, not a swipe.
    await page.goto(SITE + '/tehillim', { waitUntil: 'domcontentloaded' });
    await ready(page);
    await page.waitForTimeout(500);
    await touch('touchStart', 6, 600);
    for (const y of [580, 540, 480, 400]) { await wait(30); await touch('touchMove', 8, y); }
    const swiped = await page.evaluate(() => !!document.querySelector('.ap-stage'));
    await touch('touchEnd');
    await wait(500);
    say('an upward drag from the edge stays a scroll (§10)', !swiped && (await where()) === '/tehillim');

    // Catching the page while it settles. Released at rest so it starts back
    // slowly enough to be caught; then, wherever exactly it was caught, it
    // must follow the finger 1:1 from there -- two moves 50px apart must move
    // the page 50px.
    await drag([4, 50, 100, 150, 170], 40);
    await wait(160);
    await touch('touchEnd');
    await wait(30);
    const settling = txOf(await top());
    if (settling !== null) {
      await touch('touchStart', settling + 2, 420);
      await wait(30);
      await touch('touchMove', settling + 30, 420);
      await wait(40);
      const a = txOf(await top());
      await touch('touchMove', settling + 80, 420);
      await wait(40);
      const b2 = txOf(await top());
      say('a settling page can be caught and carried on (§3)',
        a !== null && b2 !== null && Math.abs((b2 - a) - 50) <= 2,
        a !== null && b2 !== null ? `finger moved 50px, page moved ${Math.round(b2 - a)}px` : 'it was not caught');
      await wait(160);
      await touch('touchEnd');
      await wait(800);
    } else {
      say('a settling page can be caught and carried on (§3)', false, 'it had already landed');
    }
    say('no errors under a finger', errors.length === 0, errors.join(' | ') || 'none');
    await context.close();
  }

  // ------------------------------------ §8 §12 §15 the nav bar
  console.log('\nThe nav bar (§8, §12, §15)\n');
  {
    const { page } = apple;
    await page.goto(SITE + '/about', { waitUntil: 'domcontentloaded' });
    await ready(page);
    await page.waitForTimeout(500);
    const atTop = await page.evaluate(() => {
      const b = document.querySelector('.topbar');
      const h1 = getComputedStyle(document.querySelector('#panel-about .hubhead h1'));
      return { edge: b.style.getPropertyValue('--edge'), collapse: b.style.getPropertyValue('--collapse'),
               size: h1.fontSize, weight: h1.fontWeight };
    });
    say('a large title, 34px bold (§15)', atTop.size === '34px' && Number(atTop.weight) >= 700,
      `${atTop.size} ${atTop.weight}`);
    say('at the top the bar is clear and the title is in the page',
      Number(atTop.edge) === 0 && Number(atTop.collapse) === 0, `edge ${atTop.edge}, collapse ${atTop.collapse}`);

    const collapse = () => page.evaluate(() => Number(document.querySelector('.topbar').style.getPropertyValue('--collapse')));
    const steps = [];
    for (let y = 4; y <= 120; y += 4) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(40);
      steps.push(await collapse());
    }
    say('the inline title comes in with the scroll, frame for frame (§1, §8)',
      steps.every((v, i) => i === 0 || v >= steps[i - 1] - 0.001) && steps.some((v) => v > 0.05 && v < 0.95),
      steps.filter((v, i) => i % 4 === 0).map((v) => v.toFixed(2)).join(' → '));
    const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    await page.evaluate(() => window.scrollTo(0, 99999));
    await page.waitForTimeout(700);
    say('even on a short page it can be taken all the way', (await collapse()) === 1,
      `page scrolls ${max}px, title at ${(await collapse()).toFixed(2)}`);

    // Stop half way: it finishes one way or the other, never stays half.
    let halfY = 0;
    for (let y = 0; y <= max; y++) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      const c = await collapse();
      if (c > 0.3 && c < 0.6) { halfY = y; break; }
    }
    await page.waitForTimeout(900);
    const settled = await collapse();
    say('stopped with the title half under, it snaps to one or the other',
      settled === 0 || settled === 1, `stopped at ${halfY}px, settled at ${settled}`);
    await page.evaluate(() => window.scrollTo(0, 99999));
    await page.waitForTimeout(700);
    const nav = await page.evaluate(() => ({
      edge: Number(document.querySelector('.topbar').style.getPropertyValue('--edge')),
      title: document.querySelector('.ap-title').textContent,
      back: document.querySelector('.ap-back').textContent,
      backHidden: document.querySelector('.ap-back').hidden,
    }));
    say('the material has arrived (§12)', nav.edge === 1);
    say('the bar now says where you are, and where back goes',
      nav.title === 'About' && nav.back === 'More' && !nav.backHidden, `"${nav.back}"  "${nav.title}"`);
    await page.click('.ap-back');
    await page.waitForTimeout(900);
    say('and its back button goes there', (await page.evaluate(() => location.pathname)) === '/more');
  }

  // ---------------------------------------- §14 reduced motion
  console.log('\nReduced motion (§14)\n');
  {
    const { context, page } = await open(browser, '/read?design=apple', { reduced: true });
    await ready(page);
    const filming = filmStage(page, 600);
    await page.click('#panel-read [data-goto="tehillim"]');
    const frames = (await filming).filter((f) => f.stage);
    const slid = frames.some((f) => f.top && txOf(f.top) !== 0 && txOf(f.top) !== null);
    const faded = frames.some((f) => f.opacity !== null && f.opacity !== '' && Number(f.opacity) < 1 && Number(f.opacity) > 0);
    say('with motion reduced, pages fade instead of sliding', !slid && faded,
      `${frames.length} frames, slid ${slid}, faded ${faded}`);
    await context.close();
  }

  // ------------------------------------- legibility, both themes
  console.log('\nLegibility in both themes\n');
  for (const dark of [false, true]) {
    const { context, page } = await open(browser, '/settings?design=apple', { dark });
    await page.evaluate((d) => { try { localStorage.setItem('bd.theme', JSON.stringify(d ? 'dark' : 'light')); } catch (e) {} }, dark);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page);
    await page.waitForTimeout(500);
    const res = await page.evaluate(() => {
      const lum = (c) => {
        const v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((x) => x / 255)
          .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
      };
      const solid = (e) => {
        for (let n = e; n; n = n.parentElement) {
          const bg = getComputedStyle(n).backgroundColor;
          const a = bg.match(/[\d.]+/g);
          if (a && (a.length < 4 || Number(a[3]) > 0.9)) return bg;
        }
        return getComputedStyle(document.body).backgroundColor;
      };
      const out = [];
      for (const [label, sel, floor] of [
        ['a row title', '#panel-settings .row-title', 4.5],
        ['a row\'s second line', '#panel-settings .row-sub', 4.5],
        ['a section header', '#panel-settings .rows-head', 4.5],
        ['the tab you are on', '.tab.is-active', 4.5],
        ['the other tabs', '.tab:not(.is-active)', 4.5],
        ['the back button', '#panel-settings .backrow', 4.5],
      ]) {
        const e = document.querySelector(sel);
        if (!e) { out.push([label, 0, floor, 'missing']); continue; }
        const fg = getComputedStyle(e).color;
        const bg = solid(e);
        const a = lum(fg), b = lum(bg);
        out.push([label, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), floor, fg + ' on ' + bg]);
      }
      return out;
    });
    for (const [label, ratio, floor, detail] of res) {
      say(`${label} (${dark ? 'dark' : 'light'})`, ratio >= floor, `${ratio.toFixed(2)}:1 · ${detail}`);
    }
    await context.close();
  }

  // ------------------------------------------------- the compare page
  console.log('\nThe compare page\n');
  {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 960 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(SITE + '/compare', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2600);
    const frames = page.frames();
    const cur = frames.find((f) => f.name() === 'bd-design:current');
    const app = frames.find((f) => f.name() === 'bd-design:apple');
    const designs = await Promise.all([cur, app].map((f) => f.evaluate(() => document.documentElement.getAttribute('data-design'))));
    say('one frame shows each design', designs[0] === null && designs[1] === 'apple', JSON.stringify(designs));
    await page.selectOption('#page', 'zmanim');
    await page.waitForTimeout(900);
    const both = await Promise.all([cur, app].map((f) => f.evaluate(() => location.pathname)));
    say('choosing a page moves both', both.every((p) => p === '/zmanim'), both.join(' / '));
    await cur.click('.tab[data-panel="week"]');
    await page.waitForTimeout(900);
    const followed = await app.evaluate(() => location.pathname);
    say('a tap inside one brings the other along', followed === '/week', followed);
    const lay = await page.evaluate(() => [...document.querySelectorAll('.phone')].map((p) => Math.round(p.getBoundingClientRect().width)));
    say('side by side on a wide screen', lay.length === 2 && lay[0] > 300, lay.join(' + ') + 'px');
    say('no errors', errors.length === 0, errors.join(' | ') || 'none');
    await ctx.close();

    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const p2 = await phone.newPage();
    await p2.goto(SITE + '/compare', { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(1500);
    const flip = await p2.evaluate(() => ({
      flip: document.body.classList.contains('is-flip'),
      shown: [...document.querySelectorAll('figure')].filter((f) => getComputedStyle(f).display !== 'none').length,
    }));
    say('on a phone it starts on Flip, one design full size', flip.flip && flip.shown === 1, JSON.stringify(flip));
    await p2.click('[data-show="current"]');
    const which = await p2.evaluate(() => document.querySelector('figure.is-shown').getAttribute('data-design'));
    say('and flips to the other with one tap', which === 'current', which);
    await phone.close();
  }

  await apple.context.close();
  await browser.close();
  console.log(bad ? `\n${bad} failing.\n` : '\nThe copy does what the skill says, and the current design is untouched.\n');
  process.exitCode = bad ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
