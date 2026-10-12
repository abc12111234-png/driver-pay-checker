// Tests for ads.js (who may see which referral, and the referral list itself).
// Run from the repository root: node tests/test-ads.js
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(process.argv[2] || 'ads.js', 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const { PREFS, ADS, SAMPLES, wellFormed, check, list, maybeList, active } = ctx.DPC_ADS;

let fails = 0, passes = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passes++; else { fails++; console.log('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want)); }
}
const AD = o => Object.assign({ id: 't', name: 'テスト', kind: 'school', places: ['shindan-result'], text: '紹介文', tag: '<a href="https://px.a8.net/svt/ejp?a8mat=TEST">テスト</a>' }, o);
const R = 'shindan-result';

// 1. nothing is shown without a tag, a text, or the place
eq('1 no tag', check(AD({ tag: '' }), R, {}), 'no');
eq('1 no text', check(AD({ text: '' }), R, {}), 'no');
eq('1 other place', check(AD({}), 'shindan-intro', {}), 'no');
eq('1 no conditions', check(AD({}), R, {}), 'yes');

// 2. area: shown only when the prefecture is known and in the list
const area = AD({ prefs: ['東京都', '大阪府'] });
eq('2 area unknown', check(area, R, {}), 'maybe');
eq('2 area in', check(area, R, { pref: '東京都' }), 'yes');
eq('2 area out', check(area, R, { pref: '北海道' }), 'no');

// 3. age: shown only when the whole possible age range is inside the target
const age = AD({ ageMin: 18, ageMax: 59 });
eq('3 age unknown', check(age, R, {}), 'maybe');
eq('3 age exact in', check(age, R, { ageLo: 30, ageHi: 30 }), 'yes');
eq('3 age at the edges', [check(age, R, { ageLo: 18, ageHi: 18 }), check(age, R, { ageLo: 59, ageHi: 59 })], ['yes', 'yes']);
eq('3 age exact out', [check(age, R, { ageLo: 17, ageHi: 17 }), check(age, R, { ageLo: 60, ageHi: 60 })], ['no', 'no']);
eq('3 21 or older could be over 59', check(age, R, { ageLo: 21, ageHi: 130 }), 'maybe');
eq('3 under 18 is out', check(age, R, { ageLo: 0, ageHi: 17 }), 'no');
eq('3 only a lower limit, 21 or older', check(AD({ ageMin: 21 }), R, { ageLo: 21, ageHi: 130 }), 'yes');
eq('3 only a lower limit, 20', check(AD({ ageMin: 21 }), R, { ageLo: 20, ageHi: 20 }), 'no');

// 4. licence and need
eq('4 licensed unknown', check(AD({ licensed: true }), R, {}), 'maybe');
eq('4 licensed yes', check(AD({ licensed: true }), R, { licensed: true }), 'yes');
eq('4 licensed no', check(AD({ licensed: true }), R, { licensed: false }), 'no');
eq('4 need licence, not needed', check(AD({ need: 'license' }), R, { needLicense: false }), 'no');
eq('4 need licence, needed', check(AD({ need: 'license' }), R, { needLicense: true }), 'yes');
eq('4 need licence, before the questions', check(AD({ need: 'license' }), R, {}), 'yes');

// 5. all conditions together
const all = AD({ prefs: ['愛知県'], ageMin: 18, ageMax: 56, licensed: true });
eq('5 all known and in', check(all, R, { pref: '愛知県', ageLo: 40, ageHi: 40, licensed: true }), 'yes');
eq('5 one missing', check(all, R, { pref: '愛知県', ageLo: 40, ageHi: 40 }), 'maybe');
eq('5 one out', check(all, R, { pref: '愛知県', ageLo: 57, ageHi: 57, licensed: true }), 'no');

// 5b. job referrals are 18 and over even when the list says nothing
eq('5b job, age unknown', check(AD({ kind: 'job' }), R, {}), 'maybe');
eq('5b job, under 18', check(AD({ kind: 'job' }), R, { ageLo: 0, ageHi: 17 }), 'no');
eq('5b job, 18', check(AD({ kind: 'job' }), R, { ageLo: 18, ageHi: 18 }), 'yes');
eq('5b job with ageMin 16 is still 18', check(AD({ kind: 'job', ageMin: 16 }), R, { ageLo: 16, ageHi: 16 }), 'no');

// 5c. a referral written wrongly is never shown
eq('5c age written as text', check(AD({ kind: 'job', ageMin: '18' }), R, { ageLo: 10, ageHi: 10 }), 'no');
eq('5c prefecture not in a list', check(AD({ prefs: '東京都' }), R, { pref: '北海道' }), 'no');
eq('5c unknown prefecture name', check(AD({ prefs: ['東京'] }), R, { pref: '東京' }), 'no');
eq('5c empty prefecture list', check(AD({ prefs: [] }), R, { pref: '東京都' }), 'no');
eq('5c kind misspelt', check(AD({ kind: 'jobs' }), R, { ageLo: 10, ageHi: 10 }), 'no');
eq('5c need misspelt', check(AD({ need: 'licence' }), R, { needLicense: true }), 'no');
eq('5c licensed as text', check(AD({ licensed: 'yes' }), R, { licensed: true }), 'no');
eq('5c null and other values', [check(null, R, {}), check(undefined, R, {}), check('x', R, {}), check(AD({ places: 'shindan-result' }), R, {})], ['no', 'no', 'no', 'no']);
eq('5c age NaN from the page counts as unknown', check(AD({ kind: 'job', ageMin: 18, ageMax: 59 }), R, { ageLo: NaN, ageHi: NaN }), 'maybe');
eq('5c wellFormed on the samples', SAMPLES.map(wellFormed), SAMPLES.map(() => true));
ctx.DPC_ADS.ADS.push(null);
eq('5c a null in the list does not break active, list or maybeList', [active('shindan', false), list(R, {}, false).length, maybeList(R, {}, false).length], [false, 0, 0]);
ctx.DPC_ADS.ADS.pop();

// 6. the real list: nothing shows until the A8 tag and the text are pasted in
eq('6 no live referral yet', ADS.filter(ad => ad.tag || ad.text).map(ad => ad.id), []);
eq('6 not active on the diagnosis', active('shindan', false), false);
eq('6 nothing before the questions', list('shindan-intro', {}, false).length, 0);
eq('6 nothing in the result', [list(R, { pref: '東京都', ageLo: 30, ageHi: 30, licensed: true }, false).length, maybeList(R, {}, false).length], [0, 0]);
// if the tags were pasted, the conditions from memo 00 would decide (日本ドライバー人材センター 21+, レバジョブ 18-59, カラフル under 57 with a licence)
const live = ADS.map(ad => Object.assign({}, ad, { tag: '<a href="https://px.a8.net/x">x</a>', text: '紹介文' }));
const whoSees = who => live.filter(ad => check(ad, R, who) === 'yes').map(ad => ad.id);
eq('6 Tokyo 30', whoSees({ pref: '東京都', ageLo: 30, ageHi: 30, licensed: true }), ['nihon-driver', 'levajob', 'colorful-driver']);
eq('6 Tokyo 20', whoSees({ pref: '東京都', ageLo: 20, ageHi: 20, licensed: true }), ['levajob', 'colorful-driver']);
eq('6 Tokyo 58', whoSees({ pref: '東京都', ageLo: 58, ageHi: 58, licensed: true }), ['nihon-driver', 'levajob']);
eq('6 Aichi 30 (「名古屋」 is not in until A8 says the whole prefecture)', whoSees({ pref: '愛知県', ageLo: 30, ageHi: 30, licensed: true }), ['colorful-driver']);
eq('6 Aichi 30 without a licence', whoSees({ pref: '愛知県', ageLo: 30, ageHi: 30, licensed: false }), []);
eq('6 Osaka 21 or older', whoSees({ pref: '大阪府', ageLo: 21, ageHi: 130, licensed: true }), ['nihon-driver']);
eq('6 Hokkaido', whoSees({ pref: '北海道', ageLo: 30, ageHi: 30, licensed: true }), []);
eq('6 under 18', live.filter(ad => check(ad, R, { ageLo: 0, ageHi: 17, licensed: true }) !== 'no').map(ad => ad.id), []);
eq('6 not before the questions', live.filter(ad => check(ad, 'shindan-intro', {}) === 'yes').map(ad => ad.id), []);

// 7. the list is well formed
const KNOWN_PLACES = ['shindan-intro', 'shindan-result'];
eq('7 47 prefectures', [PREFS.length, new Set(PREFS).size], [47, 47]);
const bad = ADS.concat(SAMPLES).filter(ad => {
  if (!ad.id || !ad.name || !Array.isArray(ad.places) || !ad.places.length || ad.places.some(p => KNOWN_PLACES.indexOf(p) < 0)) return true;
  if (ad.prefs && ad.prefs.some(p => PREFS.indexOf(p) < 0)) return true;
  if (ad.ageMin != null && ad.ageMax != null && ad.ageMin > ad.ageMax) return true;
  if (ad.kind === 'job' && !(ad.ageMin >= 18)) return true;   // no job referral for under 18
  if (ad.tag && SAMPLES.indexOf(ad) < 0 && !/^<a [^>]*href="https:\/\/px\.a8\.net\//.test(ad.tag.trim())) return true;   // only tags issued by A8
  if (ad.tag && /<script|on\w+\s*=|javascript:/i.test(ad.tag)) return true;
  return false;
}).map(ad => ad.id);
eq('7 every referral is well formed', bad, []);
eq('7 every referral passes wellFormed once a tag and text are in', ADS.map(ad => wellFormed(Object.assign({}, ad, { tag: '<a href="https://px.a8.net/x">x</a>', text: '紹介文' }))), ADS.map(() => true));
eq('7 ids are unique', new Set(ADS.concat(SAMPLES).map(ad => ad.id)).size, ADS.length + SAMPLES.length);
eq('7 job referrals say a call will come', ADS.concat(SAMPLES).filter(ad => ad.kind === 'job' && !/電話/.test(ad.note || '')).map(ad => ad.id), []);

// 8. the preview samples
eq('8 preview is active', active('shindan', true), true);
eq('8 preview before the questions', list('shindan-intro', {}, true).map(ad => ad.id), ['sample-school']);
eq('8 preview result, licence needed, 21 or older', [list(R, { ageLo: 21, ageHi: 130, licensed: true, needLicense: true }, true).map(ad => ad.id), maybeList(R, { ageLo: 21, ageHi: 130, licensed: true, needLicense: true }, true).map(ad => ad.id)], [['sample-school'], ['sample-job']]);
eq('8 preview result, no licence needed', list(R, { ageLo: 30, ageHi: 30, licensed: true, needLicense: false }, true).map(ad => ad.id), []);

console.log(fails ? `${fails} FAILED, ${passes} passed` : `ALL PASS (${passes})`);
process.exit(fails ? 1 : 0);
