// The widget script draws in Scriptable, which does not exist here. What can
// be checked is that every size actually reaches for the yahrzeit -- the
// reason it was missing was not a bug but three builders that never asked.
const fs = require('fs');
const src = fs.readFileSync('ios/scriptable/BreslovDaily.js', 'utf8');

let bad = 0;
const check = (name, ok, whyNot) => {
  // The reason belongs only to a failure. Printing it beside "ok" made every
  // passing line read "ok  no mention of it", which is a sentence that means
  // the opposite of what happened.
  console.log(`  ${name.padEnd(46)} ${ok ? 'ok' : `FAIL  ${whyNot || ''}`}`);
  if (!ok) bad++;
};

// Each builder's body, from its opening to the next function.
function bodyOf(fn) {
  const at = src.indexOf(`function ${fn}(`);
  if (at === -1) return '';
  const next = src.indexOf('\nfunction ', at + 1);
  return src.slice(at, next === -1 ? src.length : next);
}

for (const fn of ['buildSmall', 'buildMedium', 'buildLarge',
                  'buildAccessoryRectangular', 'buildAccessoryInline']) {
  const body = bodyOf(fn);
  check(`${fn} asks for the yahrzeit`,
    /yahrzeits|yahrzeitLine/.test(body), body ? 'no mention of it' : 'function not found');
}

// And the teaching is Hebrew-only unless someone changes one line.
check('the teaching is Hebrew by default', /TEACHING_LANGUAGE = 'hebrew'/.test(src));
check('every size draws the teaching the same way',
  (src.match(/addTeaching\(/g) || []).length >= 4);

console.log(bad === 0 ? '\nEvery size shows it.\n' : `\n${bad} check(s) failed.\n`);
process.exitCode = bad ? 1 : 0;
