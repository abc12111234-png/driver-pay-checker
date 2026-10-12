// Browser checks for shindan.html (the questions, going back, branches, results, phone width, dark mode).
// Needs Playwright with Chromium; if it is installed elsewhere, set NODE_PATH to the node_modules folder that holds it.
// From the repo folder:
//   python3 -m http.server 8765 &
//   node tests/e2e-shindan.js http://127.0.0.1:8765/ /some/scratch/folder
// Screenshots go to the scratch folder (keep it outside the repo). The last lines say ALL PASS (n) and whether the page logged errors.
const { chromium } = require('playwright');
const base = process.argv[2], out = process.argv[3];

(async () => {
  const browser = await chromium.launch();
  const errors = [], results = [];
  const check = (name, ok, extra) => { results.push((ok ? 'PASS ' : 'FAIL ') + name + (ok || !extra ? '' : ' :: ' + extra)); };
  const watch = (page, tag) => {
    page.on('console', m => { if (m.type() === 'error' && !/cloudflareinsights|fonts\.g|ERR_|net::/.test(m.text())) errors.push(tag + ': ' + m.text()); });
    page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
  };
  const noHScroll = async (page, name) => { const [w, vw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]); check(name + ' no horizontal scroll', w <= vw, 'scrollWidth=' + w + ' viewport=' + vw); };

  // answers: 1 = はい, 0 = いいえ for the ten questions on how to work, then the money/time question
  const LONG_HAUL = [0, 1, 1, 0, 1, 1, 1, 0, 0, 0];
  const ROUTE = [1, 0, 0, 1, 1, 0, 0, 1, 0, 0];
  async function answerWork(page, list, invest) {
    for (const y of list.concat([invest])) {
      await page.click(y ? '#answers .ans.yes' : '#answers .ans.no');
      await page.waitForTimeout(380);   // the page ignores a second tap within 350 ms
    }
  }
  // exact text, so 「中型」 does not pick 「準中型」
  const pick = async (page, label) => { await page.getByRole('button', { name: label, exact: true }).click(); await page.waitForTimeout(380); };
  const yn = async (page, yes) => { await page.click(yes ? '#answers .ans.yes' : '#answers .ans.no'); await page.waitForTimeout(380); };
  const qText = page => page.locator('#qText').innerText();
  const flat = async (page, sel) => (await page.locator(sel).innerText()).replace(/\s/g, '');

  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'Asia/Tokyo', locale: 'ja-JP', colorScheme: scheme });
    const page = await ctx.newPage(); watch(page, scheme);
    await page.goto(base + 'shindan.html');
    if (scheme === 'light') await page.screenshot({ path: out + '/s-intro.png', fullPage: true });
    await page.click('#btnStart');
    check(scheme + ' first question', (await qText(page)) === '毎日、家に帰りたい？' && (await page.locator('#qNum').innerText()) === '1 / 11');
    if (scheme === 'light') await page.screenshot({ path: out + '/s-question.png' });

    // going back shows the question again
    await yn(page, true);
    check(scheme + ' second question', /夜に走ったり/.test(await qText(page)));
    await page.click('#btnBack');
    check(scheme + ' back', (await qText(page)) === '毎日、家に帰りたい？');

    // A. long haul, 普通 taken after 2017-03-12 (MT), 21 or older, 3 years or more
    await answerWork(page, LONG_HAUL, 1);
    check(scheme + ' licence section starts', (await qText(page)) === '車の運転免許を持っていますか？' && /免許のことを聞きます/.test(await page.locator('#qHint').innerText()));
    await yn(page, true);
    await pick(page, '普通');
    check(scheme + ' asks when 普通 was taken', /普通免許を取ったのはいつ/.test(await qText(page)));
    await pick(page, '2017年3月12日から');
    check(scheme + ' asks AT', /AT車に限る/.test(await qText(page)));
    await yn(page, false);
    await pick(page, '21歳以上');
    await pick(page, '3年以上');
    check(scheme + ' result shown', await page.locator('#result').isVisible() && await page.locator('#quiz').isHidden());
    const res = await flat(page, '#result');
    check(scheme + ' top is 大型の長距離', (await page.locator('.res-head h2').innerText()) === '大型の長距離');
    check(scheme + ' current licence explained', res.includes('普通：車両総重量3.5t未満・最大積載量2t未満の車。') && res.includes('2tトラックの多くには乗れません'), res.slice(0, 300));
    check(scheme + ' course 大型（普通免許から）', res.includes('大型（普通免許から）') && res.includes('技能30時限・学科1時限から') && res.includes('最短12日・30.8〜52.1万円') && res.includes('約37.2〜42.3万円'), res);
    check(scheme + ' can take', res.includes('年齢と経験の条件は満たしています'));
    check(scheme + ' pay', res.includes('大型約529万円'));
    check(scheme + ' second is 増トン・大型の地場', /次に合いそうな働き方増トン・大型の地場/.test(res) && res.includes('次に合いそうなのは「増トン・大型の地場」'));
    check(scheme + ' the second card does not repeat the same course', (res.match(/大型（普通免許から）/g) || []).length === 1 && res.includes('取り方と費用は、上と同じです'), String((res.match(/大型（普通免許から）/g) || []).length));
    check(scheme + ' help with the cost', res.includes('免許取得支援') && res.includes('一般教育訓練は20%（上限10万円）'));
    await page.screenshot({ path: out + '/s-result-' + scheme + '.png', fullPage: true });
    await noHScroll(page, scheme + ' result');
    if (scheme === 'dark') {
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      check('dark background', bg === 'rgb(14, 20, 18)', bg);
    }

    if (scheme === 'light') {
      // B. route, old 普通 (中型8t限定)
      await page.click('#btnAgain');
      await answerWork(page, ROUTE, 1);
      await yn(page, true);
      await pick(page, '普通');
      await pick(page, '2007年6月1日まで');
      await yn(page, false);
      await pick(page, '21歳以上');
      await pick(page, '3年以上');
      const r2 = await flat(page, '#result');
      check('B top is ルート配送・地場', (await page.locator('.res-head h2').innerText()) === 'ルート配送・地場');
      check('B old 普通 is 中型（8t限定）', r2.includes('中型（8t限定）：車両総重量8t未満・最大積載量5t未満の車。多くの4tトラックに乗れます'), r2.slice(0, 300));
      check('B mostly and the 8t course', r2.includes('いまの免許で、多くの車に乗れます') && r2.includes('中型の8t限定を外す') && r2.includes('最短3日・8.1〜16.5万円'), r2);

      // C. a 19-year-old with one year: 特例教習 for 大型; also the 中型 branch questions
      await page.click('#btnAgain');
      await answerWork(page, LONG_HAUL, 1);
      await yn(page, true);
      await pick(page, '中型');
      check('C asks 8t', /中型車は中型車（8t）に限る/.test(await qText(page)));
      await yn(page, false);
      check('C asks けん引', /けん引免許も持っていますか/.test(await qText(page)));
      // going back over a branch drops the later answers
      await page.click('#btnBack');
      check('C back to 8t', /中型車は中型車（8t）に限る/.test(await qText(page)));
      await yn(page, false);
      await yn(page, false);
      await pick(page, '19歳');
      await pick(page, '1年以上2年未満');
      const r3 = await flat(page, '#result');
      check('C 中型 now, 大型 with 特例教習', r3.includes('大型（中型から）') && r3.includes('受験資格特例教習を受けて取れます') && r3.includes('最短6日・19.5〜32.2万円'), r3);

      // D. no licence, 18
      await page.click('#btnAgain');
      await answerWork(page, ROUTE, 0);
      await yn(page, false);
      check('D no licence asks the age next', (await qText(page)) === '年齢は？');
      await pick(page, '18歳');
      const r4 = await flat(page, '#result');
      check('D no licence', r4.includes('まだトラックには乗れません') && r4.includes('準中型（免許なしから）') && r4.includes('最短18日・31.9〜56.7万円') && r4.includes('準中型か普通を取って、経験を積んでからになります'), r4);
      await page.screenshot({ path: out + '/s-result-nolicence.png', fullPage: true });

      // links to the other pages
      check('links to the checker and the log', (await page.locator('#result .next a[href="./"]').count()) === 1 && (await page.locator('#result .next a[href="log.html"]').count()) === 1);
      // a double tap answers only once
      await page.click('#btnAgain');
      await page.dblclick('#answers .ans.yes');
      await page.waitForTimeout(400);
      check('double tap answers once', /夜に走ったり/.test(await qText(page)), await qText(page));
    }
    await ctx.close();
  }

  // F. ads (PR). The real list has no A8 tags yet, so nothing shows; ?ad=preview shows the samples in the two places
  async function finishLongHaul(page, age) {
    await page.click('#btnStart');
    await answerWork(page, LONG_HAUL, 1);
    await yn(page, true);
    await pick(page, '普通');
    await pick(page, '2017年3月12日から');
    await yn(page, false);
    await pick(page, age || '21歳以上');
    await pick(page, '3年以上');
  }
  const adsLoaded = page => page.waitForFunction(() => !!window.DPC_ADS);
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Tokyo', locale: 'ja-JP' });
    const page = await ctx.newPage(); watch(page, 'F');
    await page.goto(base + 'shindan.html');
    await adsLoaded(page);
    check('F no ads yet: no PR line, nothing under the start button', await page.locator('#prTop').isHidden() && (await page.locator('#adIntro').innerHTML()) === '');
    await finishLongHaul(page);
    check('F no ads yet: nothing in the result', await page.locator('#adResult').isHidden() && (await page.locator('#result .pr').count()) === 0);

    // the preview
    await page.goto(base + 'shindan.html?ad=preview');
    await adsLoaded(page);
    check('F preview: PR line at the top', await page.locator('#prTop').isVisible() && /当サイトはアフィリエイト広告を利用しています/.test(await page.locator('#prTop').innerText()));
    const introAd = page.locator('#adIntro .adbox');
    check('F preview: ad under the start button, PR on the block and on the referral', await introAd.isVisible() && (await introAd.locator('.ad-head .pr').count()) === 1 &&
      (await introAd.locator('[data-ad="sample-school"] .ad-name .pr').count()) === 1 &&
      /当サイトはアフィリエイト広告を利用しています/.test(await introAd.innerText()));
    const btnBox = await page.locator('#btnStart').boundingBox(), adBox = await introAd.boundingBox();
    check('F preview: start button above the ad, both in the first screen', btnBox.y < adBox.y && adBox.y < 844, JSON.stringify([btnBox.y, adBox.y]));
    await finishLongHaul(page);
    check('F preview: the intro ad is gone during the result', await introAd.isHidden());
    const order = await page.evaluate(() => [...document.querySelectorAll('#result > section')].slice(0, 3).map(s => s.id || s.className));
    check('F preview: result ad right under the headline', order[0] === 'card res-head' && order[1] === 'adResult' && await page.locator('#adResult').isVisible(), JSON.stringify(order));
    check('F preview: licence needed, so the school sample shows', (await page.locator('#adResult [data-ad="sample-school"]').count()) === 1);
    check('F preview: 21 or older asks prefecture and age (age empty)', await page.locator('#adPref').isVisible() && (await page.locator('#adAge').inputValue()) === '' &&
      (await page.locator('#adAskList').innerHTML()) === '');
    await page.selectOption('#adPref', '東京都');
    check('F preview: prefecture only, 21 or older could be over 59, still nothing', (await page.locator('#adAskList [data-ad]').count()) === 0 && (await page.locator('#adAskList .ad-empty').count()) === 0);
    await page.fill('#adAge', '45');
    check('F preview: Tokyo 45 shows the job sample with PR and the phone note', (await page.locator('#adAskList [data-ad="sample-job"] .ad-name .pr').count()) === 1 && /電話/.test(await page.locator('#adAskList').innerText()));
    await page.evaluate(() => { document.querySelector('#adAskList [data-ad]').dataset.mark = '1'; });
    await page.selectOption('#adPref', '千葉県');
    check('F preview: same referral, not drawn again (no second count)', (await page.locator('#adAskList [data-mark="1"]').count()) === 1);
    await page.selectOption('#adPref', '北海道');
    check('F preview: Hokkaido has none', (await page.locator('#adAskList [data-ad]').count()) === 0 && /いまはありません/.test(await page.locator('#adAskList').innerText()));
    await page.selectOption('#adPref', '大阪府');
    check('F preview: back to Osaka, the same element comes back', (await page.locator('#adAskList [data-mark="1"]').count()) === 1 && (await page.locator('#adAskList .ad-empty').count()) === 0);
    await page.fill('#adAge', '60');
    check('F preview: 60 is outside 18-59', /いまはありません/.test(await page.locator('#adAskList').innerText()));
    await page.fill('#adAge', '');
    check('F preview: age cleared goes back to waiting', (await page.locator('#adAskList').innerText()).trim() === '');
    await noHScroll(page, 'F preview result');
    const withAds = (await page.locator('#result').innerText()).replace(/\s/g, '');
    check('F preview: the result itself is unchanged', withAds.includes('大型（普通免許から）') && withAds.includes('大型約529万円'));

    // 18, no licence: the age is filled in from the answer; under 18: no job referral at all
    await page.click('#btnAgain');
    await answerWork(page, ROUTE, 0);
    await yn(page, false);
    await pick(page, '18歳');
    check('F preview: 18 is filled in', (await page.locator('#adAge').inputValue()) === '18');
    await page.click('#btnAgain');
    await answerWork(page, ROUTE, 0);
    await yn(page, false);
    await pick(page, '18歳未満');
    check('F preview: under 18 gets no job box', (await page.locator('#adPref').count()) === 0 && (await page.locator('#adResult [data-ad="sample-school"]').count()) === 1);
    await ctx.close();
  }
  {
    // 320 px, dark
    const ctx = await browser.newContext({ viewport: { width: 320, height: 640 }, timezoneId: 'Asia/Tokyo', locale: 'ja-JP', colorScheme: 'dark' });
    const page = await ctx.newPage(); watch(page, 'F3');
    await page.goto(base + 'shindan.html?ad=preview');
    await adsLoaded(page);
    await finishLongHaul(page, '20歳');
    check('F3 20 is filled in', (await page.locator('#adAge').inputValue()) === '20');
    await page.selectOption('#adPref', '神奈川県');
    check('F3 Kanagawa 20 shows the job sample', (await page.locator('#adAskList [data-ad="sample-job"]').count()) === 1);
    await noHScroll(page, 'F3 320px dark');
    await page.locator('#adResult').screenshot({ path: out + '/s-ad-result-dark-320.png' });
    await ctx.close();
  }

  // G. what the live referrals will do, with tags shaped like A8's (a link and a 1 px counting image)
  {
    const real = require('fs').readFileSync(require('path').join(__dirname, '..', 'ads.js'), 'utf8');
    const live = real + `;(function(){ window.DPC_ADS.ADS.forEach(function(ad, i){ ad.text = ad.name + 'の紹介文';
      ad.tag = '<a href="https://px.a8.net/svt/ejp?a8mat=T' + i + '" rel="nofollow">' + ad.name + 'を見る</a>\\n<img border="0" width="1" height="1" src="https://www10.a8.net/0.gif?a8mat=T' + i + '" alt="">'; }); })();`;
    const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Tokyo', locale: 'ja-JP' });
    const page = await ctx.newPage(); watch(page, 'G');
    const pixels = {}, urls = [];
    page.on('request', r => urls.push(r.url()));
    await page.route('**/ads.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: live }));
    await page.route('https://www10.a8.net/**', r => { const m = /a8mat=(T\d)/.exec(r.request().url()); pixels[m[1]] = (pixels[m[1]] || 0) + 1; r.fulfill({ status: 200, contentType: 'image/gif', headers: { 'Cache-Control': 'no-store' }, body: GIF }); });
    await page.goto(base + 'shindan.html');
    await adsLoaded(page);
    check('G live: PR line at the top, nothing before the questions (all three have area limits)', await page.locator('#prTop').isVisible() && (await page.locator('#adIntro').innerHTML()) === '');
    await finishLongHaul(page);
    check('G live: the box asks first, nothing shown yet', await page.locator('#adPref').isVisible() && (await page.locator('#adAskList [data-ad]').count()) === 0 && Object.keys(pixels).length === 0, JSON.stringify(pixels));
    await page.selectOption('#adPref', '東京都');
    const ids = async () => (await page.locator('#adAskList [data-ad]').evaluateAll(els => els.map(e => e.dataset.ad))).join(',');
    check('G live: Tokyo, 21 or older: only 日本ドライバー人材センター (no upper age)', (await ids()) === 'nihon-driver', await ids());
    await page.locator('#adAge').pressSequentially('4');
    check('G live: a half-typed age keeps the answer from the quiz', (await ids()) === 'nihon-driver', await ids());
    await page.locator('#adAge').pressSequentially('5');
    check('G live: Tokyo 45: all three', (await ids()) === 'nihon-driver,levajob,colorful-driver', await ids());
    await page.selectOption('#adPref', '愛知県');
    check('G live: Aichi 45: only カラフル', (await ids()) === 'colorful-driver', await ids());
    await page.selectOption('#adPref', '北海道');
    await page.selectOption('#adPref', '東京都');
    check('G live: back to Tokyo: all three again', (await ids()) === 'nihon-driver,levajob,colorful-driver', await ids());
    await page.waitForTimeout(200);
    check('G live: each counting image was loaded once', JSON.stringify(pixels) === JSON.stringify({ T0: 1, T1: 1, T2: 1 }), JSON.stringify(pixels));
    check('G live: every referral has its own PR', (await page.locator('#adAskList .ad').count()) === 3 && (await page.locator('#adAskList .ad .ad-name .pr').count()) === 3);
    const gap = await page.locator('#adAskList .ad-link').first().evaluate(el => el.getBoundingClientRect().height - el.querySelector('a').getBoundingClientRect().height);
    check('G live: no blank line under the link', gap < 2, String(gap));
    check('G live: the tag is put in as issued', await page.locator('#adAskList [data-ad="levajob"] .ad-link').evaluate(el => el.innerHTML.trim() ===
      '<a href="https://px.a8.net/svt/ejp?a8mat=T1" rel="nofollow">レバジョブを見る</a>\n<img border="0" width="1" height="1" src="https://www10.a8.net/0.gif?a8mat=T1" alt="">'));
    await page.fill('#adAge', '19');
    check('G live: 19 in Tokyo: レバジョブ and カラフル (日本ドライバー人材センター is 21+)', (await ids()) === 'levajob,colorful-driver', await ids());
    const leaks = urls.filter(u => /%E6%9D%B1%E4%BA%AC|%E6%84%9B%E7%9F%A5|東京|愛知|age=|pref=/i.test(u));
    check('G live: the prefecture and age are not in any request', leaks.length === 0, leaks.join(' '));
    await noHScroll(page, 'G live');
    await page.locator('#adResult').screenshot({ path: out + '/s-ad-live.png' });
    await ctx.close();
  }

  // H. ads.js slow, broken or throwing: the diagnosis never waits for it
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Tokyo', locale: 'ja-JP' });
    const page = await ctx.newPage();
    const real = require('fs').readFileSync(require('path').join(__dirname, '..', 'ads.js'), 'utf8');
    await page.route('**/ads.js', async r => { await new Promise(res => setTimeout(res, 9000)); try { await r.fulfill({ status: 200, contentType: 'application/javascript', body: real }); } catch (e) {} });
    await page.goto(base + 'shindan.html?ad=preview', { waitUntil: 'domcontentloaded' });
    const t0 = Date.now();
    await page.click('#btnStart');
    await page.waitForFunction(() => document.getElementById('qText').textContent === '毎日、家に帰りたい？', null, { timeout: 2000 });
    check('H slow ads.js: the first question comes at once', Date.now() - t0 < 2000, String(Date.now() - t0));
    await answerWork(page, LONG_HAUL, 1);
    await yn(page, true); await pick(page, '普通'); await pick(page, '2017年3月12日から'); await yn(page, false); await pick(page, '21歳以上'); await pick(page, '3年以上');
    const early = await page.evaluate(() => !!window.DPC_ADS);
    check('H slow ads.js: the result shows before the ads arrive', (await page.locator('.res-head h2').innerText()) === '大型の長距離' && (early || await page.locator('#adResult').isHidden()), String(early));
    await adsLoaded(page);
    await page.waitForTimeout(100);
    check('H slow ads.js: when it arrives, the ads fill in under the result, not in the hidden intro',
      await page.locator('#adResult').isVisible() && (await page.locator('#adResult [data-ad="sample-school"]').count()) === 1 && (await page.locator('#adIntro').innerHTML()) === '');
    await ctx.close();
  }
  for (const [name, body] of [
    ['aborted', null],
    ['throws', 'throw new Error("broken ads.js");'],
    ['bad functions', 'window.DPC_ADS = { PREFS: [], check(){ throw new Error("x"); }, active(){ throw new Error("x"); }, list(){ throw new Error("x"); }, maybeList(){ throw new Error("x"); } };'],
    ['list fine, result throws', 'window.DPC_ADS = { PREFS: null, check(){ return "maybe"; }, active(){ return true; }, list(p){ return []; }, maybeList(p){ return p === "shindan-result" ? [{ id: "x", kind: "job" }] : []; } };']
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 640 }, timezoneId: 'Asia/Tokyo', locale: 'ja-JP' });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    await page.route('**/ads.js', r => body === null ? r.abort() : r.fulfill({ status: 200, contentType: 'application/javascript', body }));
    await page.goto(base + 'shindan.html?ad=preview');
    await page.waitForTimeout(150);
    await finishLongHaul(page, '20歳');
    check('H ads.js ' + name + ': the result still shows, with no ad block',
      (await page.locator('.res-head h2').innerText()) === '大型の長距離' && await page.locator('#adResult').isHidden() && (await page.locator('#result .pr').count()) === 0,
      pageErrors.join(' | '));
    check('H ads.js ' + name + ': only the error from ads.js itself', pageErrors.every(m => /broken ads\.js/.test(m)), pageErrors.join(' | '));
    await ctx.close();
  }

  // E. the other pages link to the diagnosis
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Tokyo', locale: 'ja-JP' });
    const page = await ctx.newPage(); watch(page, 'E');
    await page.goto(base);
    check('checker links to the diagnosis', (await page.locator('a[href="shindan.html"]').count()) >= 2);
    await page.goto(base + 'log.html');
    check('log links to the diagnosis', (await page.locator('.foot a[href="shindan.html"]').count()) === 1);
    await ctx.close();
  }

  await browser.close();
  console.log(results.join('\n'));
  const fails = results.filter(r => r.startsWith('FAIL')).length;
  console.log(fails ? fails + ' FAILED' : 'ALL PASS (' + results.filter(r => r.startsWith('PASS')).length + ')');
  console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'no console errors');
})();
