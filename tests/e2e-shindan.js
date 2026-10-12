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
  const noHScroll = async (page, name) => { const w = await page.evaluate(() => document.documentElement.scrollWidth); check(name + ' no horizontal scroll', w <= 390, 'scrollWidth=' + w); };

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
