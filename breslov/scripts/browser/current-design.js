/**
 * The current design still holds what build 72 established.
 *
 *   PORT=3222 node scripts/browser/stub-server.js &
 *   node scripts/browser/current-design.js
 *
 * Every page, at a phone width and a desktop width, both themes: it opens
 * with no script errors, shows its panel, does not scroll sideways, renders
 * no `.pill`, paints no gradient, has no duplicate ids, keeps its secondary
 * text above 4.5:1, and the header does not move when search opens.
 */
const { chromium } = require('playwright-core');

const SITE = process.env.SITE || 'http://127.0.0.1:3222';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PAGES = ['', 'read', 'tehillim', 'tikkun', 'torah', 'week', 'shabbos', 'weekly',
               'yahrzeit', 'zmanim', 'more', 'settings', 'about', 'sources', 'privacy', 'terms'];

let bad = 0;
const say = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' -- ' + detail : ''}`);
  if (!ok) bad++;
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const [label, width, theme] of [['phone', 390, 'light'], ['phone', 390, 'dark'], ['desktop', 1280, 'light']]) {
    const ctx = await browser.newContext({ viewport: { width, height: 860 } });
    await ctx.addInitScript((t) => { try { localStorage.setItem('bd.theme', JSON.stringify(t)); } catch (e) {} }, theme);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const problems = [];
    let lowest = { ratio: 99, where: '' };
    for (const name of PAGES) {
      await page.goto(SITE + '/' + name, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      const r = await page.evaluate(() => {
        const out = {};
        const panel = document.querySelector('.panel:not([hidden])');
        out.panel = panel ? panel.id : null;
        out.design = document.documentElement.getAttribute('data-design');
        out.sideways = document.documentElement.scrollWidth - innerWidth;
        out.pills = [...document.querySelectorAll('.pill')].filter((e) => e.getBoundingClientRect().width > 2).length;
        const seen = {};
        out.dupes = 0;
        document.querySelectorAll('[id]').forEach((e) => { if (seen[e.id]) out.dupes++; seen[e.id] = 1; });
        out.gradients = 0;
        document.querySelectorAll('body *').forEach((e) => {
          if (e.closest('details:not([open])')) return;
          for (const ps of [null, '::before', '::after']) {
            const cs = getComputedStyle(e, ps);
            if (ps && (cs.content === 'none' || cs.display === 'none')) continue;
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            const bg = cs.backgroundImage;
            if (!bg || !/gradient/.test(bg)) continue;
            const stops = bg.match(/rgba?\([^)]*\)/g) || [];
            if (stops.length > 1 && stops.every((c) => c === stops[0])) continue;
            if (e.getBoundingClientRect().width < 2) continue;
            out.gradients++;
          }
        });
        // Secondary text: every row's second line and every section head.
        const lum = (c) => {
          const v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((x) => x / 255)
            .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
          return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
        };
        const solid = (e) => {
          for (let n = e; n; n = n.parentElement) {
            const a = getComputedStyle(n).backgroundColor.match(/[\d.]+/g);
            if (a && (a.length < 4 || Number(a[3]) > 0.9)) return getComputedStyle(n).backgroundColor;
          }
          return getComputedStyle(document.body).backgroundColor;
        };
        out.low = { ratio: 99, text: '' };
        if (panel) {
          panel.querySelectorAll('.row-sub, .rows-head, .hubsub').forEach((e) => {
            if (!e.textContent.trim() || e.getBoundingClientRect().height < 2) return;
            if (e.closest('details:not([open])')) return;
            const a = lum(getComputedStyle(e).color), b = lum(solid(e));
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            if (ratio < out.low.ratio) out.low = { ratio, text: e.textContent.trim().slice(0, 30) };
          });
        }
        return out;
      });
      const where = name || 'today';
      if (r.design !== null) problems.push(`${where}: data-design is "${r.design}"`);
      if (r.panel !== 'panel-' + (name || 'today')) problems.push(`${where}: showing ${r.panel}`);
      if (r.sideways > 1) problems.push(`${where}: scrolls sideways ${r.sideways}px`);
      if (r.pills) problems.push(`${where}: ${r.pills} pill(s)`);
      if (r.dupes) problems.push(`${where}: ${r.dupes} duplicate id(s)`);
      if (r.gradients) problems.push(`${where}: ${r.gradients} gradient(s)`);
      if (r.low.ratio < lowest.ratio) lowest = { ratio: r.low.ratio, where: `${where} "${r.low.text}"` };
    }
    say(`${label} ${theme}: all ${PAGES.length} pages open, in the current design, with nothing out of place`,
      problems.length === 0, problems.join('; ') || 'no pills, no gradients, no duplicate ids, nothing sideways');
    say(`${label} ${theme}: secondary text stays readable`, lowest.ratio >= 4.5,
      `lowest ${lowest.ratio.toFixed(2)}:1 on ${lowest.where}`);
    say(`${label} ${theme}: no script errors`, errors.length === 0, errors.join(' | ') || 'none');

    if (label === 'phone' && theme === 'light') {
      await page.goto(SITE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800);
      const before = await page.evaluate(() => Math.round(document.querySelector('.topbar').getBoundingClientRect().height));
      await page.click('#searchBtn');
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => Math.round(document.querySelector('.topbar').getBoundingClientRect().height));
      say('phone: the header does not move when search opens', before === after, `${before} → ${after}px`);
    }
    await ctx.close();
  }
  await browser.close();
  console.log(bad ? `\n${bad} failing.\n` : '\nThe current design is as build 72 left it.\n');
  process.exitCode = bad ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
