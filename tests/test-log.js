// Tests for the calculation part of log.html (between // LOGCALC_START and // LOGCALC_END).
// Run from the repository root: TZ=Asia/Tokyo node tests/test-log.js log.html
const fs = require('fs');
const vm = require('vm');
const file = process.argv[2] || 'log.html';
const src = fs.readFileSync(file, 'utf8');
const a = src.indexOf('// LOGCALC_START'), b = src.indexOf('// LOGCALC_END');
if (a < 0 || b < 0) { console.error('LOGCALC markers not found'); process.exit(1); }
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src.slice(a, b) + '\nthis.api = { analyze, summarize, transferValues, shiftStats, clipSum, dayKey, weekKey };', ctx);
const { analyze, summarize, transferValues, shiftStats, clipSum, weekKey } = ctx.api;

let fails = 0, passes = 0;
const near = (x, y) => Math.abs(x - y) < 1e-6;
function eq(name, got, want) {
  const ok = (typeof want === 'number' && typeof got === 'number') ? near(got, want) : got === want;
  if (ok) passes++; else { fails++; console.log('FAIL', name, 'got', got, 'want', want); }
}
const T = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
let n = 0;
const S = (s, e, opt = {}) => Object.assign({ id: 's' + (n++), start: s, end: e, breaks: [], waits: [], holiday: false, lodging: false }, opt);

if (new Date(2026, 9, 12).getTimezoneOffset() !== -540) { console.error('Run with TZ=Asia/Tokyo'); process.exit(1); }

// 1. a simple day
{
  const sh = S(T(2026,10,5,6), T(2026,10,5,18), { breaks: [{ s: T(2026,10,5,12), e: T(2026,10,5,13) }], waits: [{ s: T(2026,10,5,8), e: T(2026,10,5,9,30) }] });
  const st = shiftStats(sh);
  eq('1 bound', st.bound, 12); eq('1 brk', st.brk, 1); eq('1 work', st.work, 11); eq('1 wait', st.wait, 1.5); eq('1 night', st.night, 0);
  const sum = summarize([sh], '2026-10');
  eq('1 ot', sum.ot, 3); eq('1 days', sum.days, 1); eq('1 boundState', sum.boundState, 'ok'); eq('1 rest', sum.minRest, null);
}

// 2. a night run with a break inside the night
{
  const sh = S(T(2026,10,6,21), T(2026,10,7,7), { breaks: [{ s: T(2026,10,7,1), e: T(2026,10,7,2) }] });
  const st = shiftStats(sh);
  eq('2 bound', st.bound, 10); eq('2 work', st.work, 9); eq('2 night', st.night, 6);
  const sum = summarize([sh], '2026-10');
  eq('2 ot', sum.ot, 1); eq('2 night sum', sum.night, 6);
}

// 3. the next start inside 24 hours counts toward the day before
{
  const A = S(T(2026,10,8,6), T(2026,10,8,18)), B = S(T(2026,10,9,4), T(2026,10,9,14));
  const x = analyze([B, A]).info; // order should not matter
  eq('3 A b24', x[0].b24, 14); eq('3 A rest', x[0].rest, 10); eq('3 A bState', x[0].bState, 'warn'); eq('3 A rState', x[0].rState, 'warn');
  eq('3 B b24', x[1].b24, 10); eq('3 B rest', x[1].rest, null); eq('3 B rState', x[1].rState, 'na');
}

// 4. weekly 40 hours (Sunday 10/11 to Saturday 10/17), and 5. a 法定休日 shift
{
  const list = [];
  for (let d = 12; d <= 17; d++) list.push(S(T(2026,10,d,6), T(2026,10,d,15), { breaks: [{ s: T(2026,10,d,12), e: T(2026,10,d,13) }] }));
  let sum = summarize(list, '2026-10');
  eq('4 days', sum.days, 6); eq('4 work', sum.work, 48); eq('4 bound', sum.bound, 54); eq('4 ot weekly', sum.ot, 8);
  const a = analyze(list);
  eq('4 weekly on Sat', a.otByDay['2026-10-17'].weekly, 8); eq('4 none on Fri', a.otByDay['2026-10-16'].weekly, 0);
  list.push(S(T(2026,10,18,6), T(2026,10,18,12), { holiday: true }));
  sum = summarize(list, '2026-10');
  eq('5 days', sum.days, 7); eq('5 holidayDays', sum.holidayDays, 1); eq('5 holidayWork', sum.holidayWork, 6); eq('5 ot', sum.ot, 8); eq('5 work', sum.work, 54);
  const tv = transferValues(sum);
  eq('5 tv ym', tv.ym, '2026-10'); eq('5 tv days', tv.days, '7'); eq('5 tv hol', tv.ovHolidayHours, '6'); eq('5 tv ot', tv.ovOtHours, '8'); eq('5 tv total', tv.ovTotalHours, '54'); eq('5 tv bound', tv.ovBoundMonth, '60'); eq('5 tv boundPerDay', tv.boundPerDay, '8.57');
}

// 6. a shift across the month end belongs to the month it started in
{
  const sh = S(T(2026,10,31,22), T(2026,11,1,6));
  eq('6 oct days', summarize([sh], '2026-10').days, 1);
  eq('6 nov days', summarize([sh], '2026-11').days, 0);
  eq('6 night', shiftStats(sh).night, 7);
  eq('6 week', weekKey(sh.start), '2026-10-25');
}

// 7. a short rest, with and without the long-haul exception
{
  const X = S(T(2026,10,20,6), T(2026,10,20,20)), Y = S(T(2026,10,21,4), T(2026,10,21,12));
  eq('7 rest bad', analyze([X, Y]).info[0].rState, 'bad');
  const X2 = S(T(2026,10,20,6), T(2026,10,20,20), { lodging: true });
  eq('7 rest 8h lodging warn', analyze([X2, Y]).info[0].rState, 'warn');
  const X3 = S(T(2026,10,20,6), T(2026,10,20,20,30), { lodging: true });
  eq('7 rest 7.5h lodging bad', analyze([X3, Y]).info[0].rState, 'bad');
}

// 8. the long-haul exception only twice a week
{
  const list = [];
  // Mon 10/26 .. Thu 10/29, each 05:00-19:30 then 8.5h rest (lodging)
  for (let d = 26; d <= 29; d++) list.push(S(T(2026,10,d,5), T(2026,10,d,19,30), { lodging: true }));
  // next start 04:00 the next day (8.5h rest) is the next shift's start; adjust starts after the first
  for (let i = 1; i < list.length; i++) { list[i].start = list[i - 1].end + 8.5 * 3600000; list[i].end = list[i].start + 14.5 * 3600000; }
  const info = analyze(list).info;
  eq('8 first warn', info[0].rState, 'warn'); eq('8 second warn', info[1].rState, 'warn'); eq('8 third bad', info[2].rState, 'bad');
}

// 9. 1日の拘束: over 15h is bad unless long-haul (up to 16h)
{
  const P = S(T(2026,10,5,4), T(2026,10,5,19,30));
  eq('9 15.5h bad', analyze([P]).info[0].bState, 'bad');
  const Q = S(T(2026,10,5,4), T(2026,10,5,19,30), { lodging: true });
  eq('9 15.5h lodging warn', analyze([Q]).info[0].bState, 'warn');
  const R = S(T(2026,10,5,4), T(2026,10,5,20,30), { lodging: true });
  eq('9 16.5h lodging bad', analyze([R]).info[0].bState, 'bad');
  const U = S(T(2026,10,5,5), T(2026,10,5,18));
  eq('9 13h ok', analyze([U]).info[0].bState, 'ok');
}

// 10. overlapping breaks count once; an unfinished break runs to the end of the shift
{
  eq('10 union', clipSum([{ s: T(2026,10,5,12), e: T(2026,10,5,13) }, { s: T(2026,10,5,12,30), e: T(2026,10,5,13,30) }], T(2026,10,5,6), T(2026,10,5,18)) / 3600000, 1.5);
  const sh = S(T(2026,10,5,6), T(2026,10,5,10), { breaks: [{ s: T(2026,10,5,9), e: null }] });
  eq('10 open break', shiftStats(sh).brk, 1);
}

// 11. the 1か月 judgment
{
  const list = [];
  for (let d = 1; d <= 25; d++) list.push(S(T(2026,10,d,5), T(2026,10,d,17)));  // 25 x 12h = 300h
  const sum = summarize(list, '2026-10');
  eq('11 bound', sum.bound, 300); eq('11 boundState', sum.boundState, 'warn');
  eq('11 otState', sum.otState, 'warn');
}

// 12. two shifts starting the same day add up for the daily 8 hours
{
  const A = S(T(2026,10,7,1), T(2026,10,7,6)), B = S(T(2026,10,7,18), T(2026,10,7,23));
  const sum = summarize([A, B], '2026-10');
  eq('12 days', sum.days, 1); eq('12 work', sum.work, 10); eq('12 ot', sum.ot, 2);
  eq('12 night', sum.night, 4 + 1);
}

console.log(fails ? `${fails} FAILED, ${passes} passed` : `ALL PASS (${passes})`);
process.exit(fails ? 1 : 0);
