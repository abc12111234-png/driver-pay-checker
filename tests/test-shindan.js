// Tests for the logic of shindan.html (between // SHINDAN_START and // SHINDAN_END).
// Run from the repository root: node tests/test-shindan.js shindan.html
const fs = require('fs');
const vm = require('vm');
const file = process.argv[2] || 'shindan.html';
const src = fs.readFileSync(file, 'utf8');
const a = src.indexOf('// SHINDAN_START'), b = src.indexOf('// SHINDAN_END');
if (a < 0 || b < 0) { console.error('SHINDAN markers not found'); process.exit(1); }
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src.slice(a, b) + '\nthis.api = { LIC, RANK, COURSES, PAY, STYLES, STYLE_KEYS, QUESTIONS, visibleQuestions, currentLicense, courseKey, canTake, statusFor, scoreStyles };', ctx);
const { LIC, COURSES, PAY, STYLES, STYLE_KEYS, QUESTIONS, visibleQuestions, currentLicense, courseKey, canTake, statusFor, scoreStyles } = ctx.api;

let fails = 0, passes = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passes++; else { fails++; console.log('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want)); }
}
const L = o => currentLicense(Object.assign({ l_has: 'yes' }, o));

// 1. the licence from the answers (the date a 普通 licence was taken decides what it covers)
eq('1 none', currentLicense({ l_has: 'no' }).key, 'none');
eq('1 futsu new', L({ l_big: 'futsu', l_when: 'new', l_at: 'no' }), { key: 'futsu', at: false, kenin: false });
eq('1 futsu mid = 5t', L({ l_big: 'futsu', l_when: 'mid' }).key, 'jun5');
eq('1 futsu old = 8t', L({ l_big: 'futsu', l_when: 'old' }).key, 'chu8');
eq('1 futsu AT', L({ l_big: 'futsu', l_when: 'new', l_at: 'yes' }).at, true);
eq('1 jun 5t', L({ l_big: 'jun', l_lim5: 'yes' }).key, 'jun5');
eq('1 jun full', L({ l_big: 'jun', l_lim5: 'no' }).key, 'jun');
eq('1 jun full ignores AT answer', L({ l_big: 'jun', l_lim5: 'no', l_at: 'yes' }).at, false);
eq('1 chu 8t', L({ l_big: 'chu', l_lim8: 'yes' }).key, 'chu8');
eq('1 chu full + kenin', L({ l_big: 'chu', l_lim8: 'no', l_kenin: 'yes' }), { key: 'chu', at: false, kenin: true });
eq('1 ogata', L({ l_big: 'ogata', l_kenin: 'no' }), { key: 'ogata', at: false, kenin: false });
eq('1 kenin only counted with 中型 or 大型', L({ l_big: 'futsu', l_when: 'new', l_kenin: 'yes' }).kenin, false);

// 2. which questions are asked
const ids = ans => visibleQuestions(ans).map(q => q.id).filter(id => id.startsWith('l_'));
eq('2 no licence', ids({ l_has: 'no' }), ['l_has', 'l_age']);
eq('2 futsu', ids({ l_has: 'yes', l_big: 'futsu' }), ['l_has', 'l_big', 'l_when', 'l_at', 'l_age', 'l_years']);
eq('2 jun full', ids({ l_has: 'yes', l_big: 'jun', l_lim5: 'no' }), ['l_has', 'l_big', 'l_lim5', 'l_age', 'l_years']);
eq('2 jun 5t asks AT', ids({ l_has: 'yes', l_big: 'jun', l_lim5: 'yes' }), ['l_has', 'l_big', 'l_lim5', 'l_at', 'l_age', 'l_years']);
eq('2 chu 8t', ids({ l_has: 'yes', l_big: 'chu', l_lim8: 'yes' }), ['l_has', 'l_big', 'l_lim8', 'l_at', 'l_kenin', 'l_age', 'l_years']);
eq('2 ogata', ids({ l_has: 'yes', l_big: 'ogata' }), ['l_has', 'l_big', 'l_kenin', 'l_age', 'l_years']);
eq('2 eleven questions on how to work', QUESTIONS.filter(q => q.sec === '働き方').length, 11);

// 3. the course to take
const lic = (key, at, kenin) => ({ key, at: !!at, kenin: !!kenin });
eq('3 futsu>ogata', courseKey(lic('futsu'), 'ogata'), 'futsu>ogata');
eq('3 futsuAT>chu', courseKey(lic('futsu', true), 'chu'), 'futsuAT>chu');
eq('3 chu8>chu', courseKey(lic('chu8'), 'chu'), 'chu8>chu');
eq('3 chu8 covers jun', courseKey(lic('chu8'), 'jun'), null);
eq('3 none>jun', courseKey(lic('none'), 'jun'), 'none>jun');
eq('3 ogata has ogata', courseKey(lic('ogata'), 'ogata'), null);
eq('3 kenin needed', courseKey(lic('ogata'), 'kenin'), 'kenin');
eq('3 kenin held', courseKey(lic('ogata', false, true), 'kenin'), null);
eq('3 every course key the logic can ask for exists or is a known gap',
  ['futsu', 'jun5', 'jun', 'chu8', 'chu'].flatMap(k => [false, true].flatMap(at => ['jun', 'chu', 'ogata'].map(t => courseKey(lic(k, at), t))))
    .filter(k => k && !COURSES[k]).sort(), ['chu8AT>ogata', 'junAT>chu', 'junAT>ogata', 'jun5AT>ogata', 'chuAT>ogata'].sort());

// 4. age and experience (中型 20歳・2年, 大型 21歳・3年, 特例教習 19歳・1年)
const F = lic('futsu');
eq('4 chu ok', canTake('chu', '20', 2, F), 'ok');
eq('4 chu 19/1 tokurei', canTake('chu', '19', 1, F), 'tokurei');
eq('4 chu 21/1 tokurei', canTake('chu', '21', 1, F), 'tokurei');
eq('4 chu 18/0 wait', canTake('chu', '18', 0, F), 'wait');
eq('4 chu 19/0 wait', canTake('chu', '19', 0, F), 'wait');
eq('4 ogata ok', canTake('ogata', '21', 3, F), 'ok');
eq('4 ogata 21/2 tokurei', canTake('ogata', '21', 2, F), 'tokurei');
eq('4 ogata 20/3 tokurei', canTake('ogata', '20', 3, F), 'tokurei');
eq('4 jun 18', canTake('jun', '18', 0, lic('none')), 'ok');
eq('4 jun 17', canTake('jun', '17', 0, lic('none')), 'age');
eq('4 ogata none first', canTake('ogata', '21', 0, lic('none')), 'first');
eq('4 kenin none first', canTake('kenin', '21', 0, lic('none')), 'first');
eq('4 kenin ok', canTake('kenin', '18', 0, F), 'ok');

// 5. what the current licence covers for each way of working
eq('5 takuhai futsu', statusFor('takuhai', F), { now: 'kei', need: ['jun'] });
eq('5 takuhai jun5', statusFor('takuhai', lic('jun5')), { now: 'mostly', need: ['jun'] });
eq('5 takuhai chu8', statusFor('takuhai', lic('chu8')), { now: 'ok', need: [] });
eq('5 route chu8', statusFor('route', lic('chu8')), { now: 'mostly', need: ['chu'] });
eq('5 route none', statusFor('route', lic('none')), { now: 'no', need: ['jun', 'chu'] });
eq('5 jimoto chu', statusFor('jimoto', lic('chu')), { now: 'mostly', need: ['ogata'] });
eq('5 choukyori jun', statusFor('choukyori', lic('jun')), { now: 'no', need: ['ogata'] });
eq('5 trailer ogata', statusFor('trailer', lic('ogata')), { now: 'no', need: ['kenin'] });
eq('5 trailer ogata+kenin', statusFor('trailer', lic('ogata', false, true)), { now: 'ok', need: [] });
eq('5 trailer futsu', statusFor('trailer', F), { now: 'no', need: ['ogata', 'kenin'] });

// 6. scores
const ans = (y, extra) => {
  const o = {};
  ['q_home', 'q_night', 'q_solo', 'q_talk', 'q_hand', 'q_big', 'q_money', 'q_route', 'q_narrow', 'q_trailer'].forEach((id, i) => { o[id] = y[i] ? 'yes' : 'no'; });
  return Object.assign(o, { q_invest: 'yes' }, extra);
};
const longHaul = ans([0, 1, 1, 0, 1, 1, 1, 0, 0, 0]);
let r = scoreStyles(longHaul, F);
eq('6 long haul', r.map(x => x.key + ':' + x.score), ['choukyori:15', 'jimoto:7', 'trailer:6', 'route:-3', 'takuhai:-5']);
const route = ans([1, 0, 0, 1, 1, 0, 0, 1, 0, 0]);
r = scoreStyles(route, F);
eq('6 route', r.slice(0, 2).map(x => x.key + ':' + x.score), ['route:13', 'takuhai:9']);
const trailer = ans([0, 1, 1, 0, 0, 1, 1, 0, 1, 1]);
r = scoreStyles(trailer, F);
eq('6 trailer', r.slice(0, 2).map(x => x.key + ':' + x.score), ['trailer:16', 'choukyori:13']);
// not wanting to spend money or time lowers what needs a new licence
r = scoreStyles(Object.assign({}, longHaul, { q_invest: 'no' }), lic('chu'));
eq('6 invest no with 中型', r.map(x => x.key + ':' + x.score), ['choukyori:13', 'jimoto:7', 'trailer:4', 'route:-3', 'takuhai:-5']);
eq('6 ties keep the listed order', scoreStyles({}, F).map(x => x.key), STYLE_KEYS);

// 7. data
eq('7 courses have sane numbers', Object.keys(COURSES).filter(k => {
  const c = COURSES[k];
  return !c.label || (c.camp && !(c.camp[0] > 0 && c.camp[1] < c.camp[2])) || (c.school && !(c.school[0] < c.school[1])) || (c.skill != null && !(c.skill > 0 && c.study >= 0));
}), []);
eq('7 pay (全ト協2025、(賃金＋賞与月割り)×12)', PAY, { futsu: (347100 + 57500) * 12, jun: (357400 + 50100) * 12, chu: (336000 + 44000) * 12, ogata: (395300 + 45800) * 12, kenin: (423800 + 57700) * 12 });
eq('7 every style has pay and text', STYLE_KEYS.filter(k => !(STYLES[k].pay.length && STYLES[k].about && STYLES[k].licText)), []);
eq('7 licence limits', [LIC.futsu.gvw, LIC.futsu.load, LIC.jun5.gvw, LIC.jun5.load, LIC.jun.gvw, LIC.jun.load, LIC.chu8.gvw, LIC.chu8.load, LIC.chu.gvw, LIC.chu.load], [3.5, 2, 5, 3, 7.5, 4.5, 8, 5, 11, 6.5]);

console.log(fails ? `${fails} FAILED, ${passes} passed` : `ALL PASS (${passes})`);
process.exit(fails ? 1 : 0);
