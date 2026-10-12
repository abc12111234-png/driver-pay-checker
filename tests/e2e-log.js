// Browser checks for log.html (buttons, places, GPS, notes, sending, history, backup, two tabs, broken files)
// and the hand-off to index.html. Needs Playwright with Chromium; if it is installed elsewhere,
// set NODE_PATH to the node_modules folder that holds it.
// From the repo folder:
//   python3 -m http.server 8765 &
//   node tests/e2e-log.js http://127.0.0.1:8765/ /some/scratch/folder
// Screenshots and the CSV/backup/share text it makes go to the scratch folder (keep it outside the repo).
// The last lines say ALL PASS (n) and whether the pages logged errors.
const { chromium } = require('playwright');
const fs = require('fs');
const base = process.argv[2], out = process.argv[3];
const J = s => new Date(s + '+09:00');

(async () => {
  const browser = await chromium.launch();
  const errors = [], results = [];
  const check = (name, ok, extra) => { results.push((ok ? 'PASS ' : 'FAIL ') + name + (ok || !extra ? '' : ' :: ' + extra)); };
  const watch = (page, tag) => {
    page.on('console', m => { if (m.type() === 'error' && !/cloudflareinsights|fonts\.g|ERR_|net::/.test(m.text())) errors.push(tag + ': ' + m.text()); });
    page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
  };
  const noHScroll = async (page, name) => { const w = await page.evaluate(() => document.documentElement.scrollWidth); check(name + ' no horizontal scroll', w <= 390, 'scrollWidth=' + w); };

  // ---------- A. a day with buttons, places, GPS, a note, sending, fixing, backup ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'Asia/Tokyo', locale: 'ja-JP', acceptDownloads: true,
      geolocation: { latitude: 35.681236, longitude: 139.767134, accuracy: 20 }, permissions: ['geolocation', 'clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage(); watch(page, 'A');
    await page.clock.install({ time: J('2026-10-12T05:58:00') });
    await page.goto(base + 'log.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const at = s => page.clock.setSystemTime(J(s));
    results.push('INFO navigator.share is ' + await page.evaluate(() => typeof navigator.share));

    await page.check('#geoToggle');
    await page.waitForFunction(() => /次から/.test(document.getElementById('geoNote').textContent));
    check('geo on', await page.evaluate(() => JSON.parse(localStorage.getItem('dpc_log_v1')).settings.geo === true));

    await at('2026-10-12T06:00:20');
    await page.click('[data-act="start"]');
    check('start -> 勤務中', (await page.locator('#state').innerText()) === '勤務中');
    check('place prompt for start', await page.locator('#placePrompt').isVisible() && /始業の場所/.test(await page.locator('#placeLabel').innerText()));
    check('start opens a screen with place, vehicle and meter', await page.locator('#placePrompt').evaluate(d => d.open && d.matches(':modal')) && await page.locator('#ppVeh').isVisible() &&
      await page.locator('#ppOdo').isVisible() && /6:00 に始業を記録しました/.test(await page.locator('#ppTitle').innerText()));
    await page.screenshot({ path: out + '/v2-start-prompt.png' });
    await page.fill('#placeInput', '東京営業所');
    await page.click('#placeSave');
    await page.waitForFunction(() => document.querySelector('#shifts a[href*="maps"]'));
    const href = await page.locator('#shifts a[href*="maps"]').first().getAttribute('href');
    check('map link', href === 'https://www.google.com/maps/search/?api=1&query=35.68124,139.76713', href);
    check('toast mentions place', /場所：東京営業所/.test(await page.locator('#toastText').innerText()), await page.locator('#toastText').innerText());

    await at('2026-10-12T09:00:00');
    await page.click('[data-act="wait"]');
    check('wait prompt', /荷待ち・待機の場所/.test(await page.locator('#placeLabel').innerText()));
    check('the wait opens as a screen over a darkened page, place only', await page.locator('#placePrompt').evaluate(d => d.open && d.matches(':modal')) &&
      /9:00 から荷待ち・待機を記録しました/.test(await page.locator('#ppTitle').innerText()) && await page.locator('#ppVeh').isHidden() && await page.locator('#ppOdo').isHidden() &&
      await page.locator('#ppUndoRow').isVisible());
    await page.screenshot({ path: out + '/v5-wait-screen.png' });
    await page.fill('#placeInput', '〇〇センター 3番');
    await page.press('#placeInput', 'Enter');
    check('enter saves place', await page.locator('#placePrompt').isHidden());

    await at('2026-10-12T09:05:00');
    await page.click('#btnNote');
    check('note label', /10月12日（月）の勤務/.test(await page.locator('#noteLabel').innerText()));
    await page.fill('#noteInput', '受付は8時の予約。会社に電話して、待つように言われた');
    await page.click('#noteSave');
    await at('2026-10-12T11:00:00');
    await page.click('[data-act="waitEnd"]');
    await at('2026-10-12T12:00:00');
    await page.click('[data-act="break"]');
    check('break prompt', /休憩の場所/.test(await page.locator('#placeLabel').innerText()));
    await page.click('#placeSkip');
    await at('2026-10-12T13:00:00');
    await page.click('[data-act="breakEnd"]');
    await at('2026-10-12T18:00:00');
    await page.click('[data-act="end"]');
    check('end prompt', /終業・休息の場所/.test(await page.locator('#placeLabel').innerText()));
    check('share link in toast', await page.locator('#btnShareNow').isVisible());
    await page.fill('#placeInput', '〇〇PAで車中泊');
    await page.click('#placeSave');
    await page.waitForTimeout(400);
    check('remind shown', await page.locator('#remind').isVisible());
    const list2 = await page.locator('#shifts').innerText();
    check('list has places and note', /〇〇センター 3番/.test(list2) && /〇〇PAで車中泊/.test(list2) && /受付は8時の予約/.test(list2), list2.replace(/\n/g, ' | '));
    check('list numbers', /拘束 12時間00分/.test(list2) && /荷待ち・待機 2時間00分/.test(list2) && /労働 11時間00分/.test(list2), list2.replace(/\n/g, ' | '));
    const ends = await page.evaluate(() => { const sh = JSON.parse(localStorage.getItem('dpc_log_v1')).shifts[0]; return [sh.waits[0].eMeta, sh.breaks[0].eMeta].map(m => m && m.loc && m.loc.lat); });
    check('GPS at the end of a wait and a break', ends[0] === 35.68124 && ends[1] === 35.68124, JSON.stringify(ends));
    check('map links for start/wait/break/end', (await page.locator('#shifts a[href*="maps"]').count()) === 4, String(await page.locator('#shifts a[href*="maps"]').count()));
    await page.screenshot({ path: out + '/v2-after-day.png', fullPage: true });
    await noHScroll(page, 'A after day');

    await page.click('#btnShareNow');
    await page.waitForTimeout(300);
    const clip = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
    check('share text', clip.includes('【勤務の記録】10月12日（月）') && clip.includes('始業 10/12 6:00 東京営業所\n') &&
      clip.includes('荷待ち・待機 9:00〜11:00 〇〇センター 3番\n') && clip.includes('荷待ち・待機おわり 11:00（誤差 約20m） https://') && clip.includes('メモ（10/12 9:05 に記入）受付は8時の予約') &&
      clip.includes('終業 10/12 18:00 〇〇PAで車中泊\n') && !clip.includes('（その場で') && clip.includes('※「あとで手入力」「あとで直した」の印がない時刻は') && clip.includes('始業（誤差 約20m） https://www.google.com/maps/search/?api=1&query=35.68124,139.76713') &&
      clip.includes('作成 2026年10月12日 18:00'), clip);
    fs.writeFileSync(out + '/share-text.txt', clip);
    check('tag copied', /コピーした/.test(await page.locator('#shifts').innerText()));
    check('remind hidden after sending', await page.locator('#remind').isHidden());

    // undo only within 10 minutes
    await at('2026-10-12T18:01:00');
    await page.click('#btnNote'); await page.fill('#noteInput', 'テストのメモ'); await page.click('#noteSave');
    await at('2026-10-12T18:12:00');
    await page.click('#btnUndo');
    check('undo refused after 10 min', /10分以内/.test(await page.locator('#toastText').innerText()) && /テストのメモ/.test(await page.locator('#shifts').innerText()));
    await at('2026-10-12T18:13:00');
    await page.click('#btnNote'); await page.fill('#noteInput', 'すぐ消すメモ'); await page.click('#noteSave');
    await page.click('#btnUndo');
    check('undo within 10 min', !/すぐ消すメモ/.test(await page.locator('#shifts').innerText()));

    // fixing a record leaves a trail
    await at('2026-10-13T08:00:00');
    await page.click('#shifts [data-edit]');
    check('editor shows how it was recorded', /始業 その場で押した／終業 その場で押した/.test(await page.locator('#eRec').innerText()), await page.locator('#eRec').innerText());
    check('editor shows places', (await page.inputValue('#eStartPlace')) === '東京営業所' && (await page.inputValue('#eEndPlace')) === '〇〇PAで車中泊');
    await page.fill('#eStart', '2026-10-12T05:30');
    await page.locator('#eWaits .pl').first().fill('〇〇センター 5番');
    await page.locator('#eNotes [data-delnote]').first().click();
    await page.fill('#eNote', 'あとで思い出したこと');
    await page.screenshot({ path: out + '/v2-editor.png', fullPage: false });
    await page.click('#eSave');
    const list3 = await page.locator('#shifts').innerText();
    check('edited tag', /あとで直した/.test(list3));
    check('new note listed with date', /メモ 10\/13 8:00あとで思い出したこと/.test(list3.replace(/\n/g, '')), list3.replace(/\n/g, ' | '));
    await page.click('#shifts [data-edit]');
    const histT = await page.locator('#eHist').textContent();
    check('history lines', histT.includes('始業 10/12 6:00 → 10/12 5:30') && histT.includes('の場所 「〇〇センター 3番」 → 「〇〇センター 5番」') && histT.includes('メモを消した（10/12 9:05 に書いた「受付は8時の予約'), histT);
    check('history count', /この記録の変更（2件）/.test(await page.locator('#eHistSum').innerText()), await page.locator('#eHistSum').innerText());
    check('start now marked edited', /始業 あとで直した/.test(await page.locator('#eRec').innerText()));
    await page.click('#eCancel');

    // a record added by hand
    await page.click('#btnAdd');
    check('add dialog says manual', /あとで手で入れた/.test(await page.locator('#eRec').innerText()));
    await page.fill('#eStart', '2026-10-10T06:00'); await page.fill('#eEnd', '2026-10-10T15:00');
    await page.fill('#eStartPlace', '大阪営業所');
    await page.click('#eSave');
    check('manual tag', /手入力/.test(await page.locator('#shifts').innerText()));

    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnCsv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    fs.writeFileSync(out + '/log.csv', csv);
    check('csv head', /始業の場所,始業の位置,終業の場所,終業の位置,休憩,荷待ち・待機,メモ,記録の仕方,変更,送った日時/.test(csv));
    check('csv rows', csv.includes('東京営業所') && csv.includes('35.68124 139.76713 ±20m') && csv.includes('始業：あとで手入力') && csv.includes('始業：あとで直した') && csv.includes('（コピー）'), csv.slice(0, 600));

    const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#btnBackup')]);
    const bkPath = out + '/backup.json'; await bk.saveAs(bkPath);
    const bkObj = JSON.parse(fs.readFileSync(bkPath, 'utf8'));
    check('backup content', bkObj.shifts.length === 2 && bkObj.app === 'driver-pay-checker/log' && typeof bkObj.exportedAt === 'number');

    await page.locator('#shifts [data-edit]').nth(1).click();
    page.once('dialog', d => d.accept());
    await page.click('#eDelete');
    check('audit after delete', /記録を消した・戻した履歴（1件）/.test(await page.locator('#auditSum').innerText()));
    check('deleted record kept in audit', await page.evaluate(() => JSON.parse(localStorage.getItem('dpc_log_v1')).audit[0].shift.startMeta.place === '大阪営業所'));

    page.once('dialog', d => d.accept());
    await page.click('#btnWipe');
    check('wiped', (await page.locator('#shifts > li').count()) === 0);
    check('geo setting kept after wipe', await page.isChecked('#geoToggle'));
    page.once('dialog', d => d.accept());
    await page.setInputFiles('#restoreFile', bkPath);
    await page.waitForTimeout(400);
    check('restored', (await page.locator('#shifts > li').count()) === 2, String(await page.locator('#shifts > li').count()));
    check('restore logged', /バックアップ（2026年10月13日 8:00 に保存、2件）から戻した。戻す前の記録0件の写しを残した/.test(await page.locator('#auditList').textContent()), await page.locator('#auditList').textContent());
    let confirmText = '';
    page.once('dialog', d => { confirmText = d.message(); d.accept(); });
    await page.setInputFiles('#restoreFile', bkPath);
    await page.waitForTimeout(400);
    check('restore confirm shows both sides', /今の記録（2件、いちばん新しいのは10月12日（月））/.test(confirmText) && /バックアップ（2件/.test(confirmText), confirmText);
    const au = await page.evaluate(() => JSON.parse(localStorage.getItem('dpc_log_v1')).audit);
    check('restore keeps a copy of what it replaced', au.length === 2 && au[1].shifts.length === 2, JSON.stringify(au.map(a => a.what)));
    await page.screenshot({ path: out + '/v2-restored.png', fullPage: true });
    await ctx.close();
  }

  // ---------- B. a month of older records, checks, and the hand-off ----------
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'Asia/Tokyo', locale: 'ja-JP', colorScheme: scheme });
    const page = await ctx.newPage(); watch(page, 'B-' + scheme);
    await page.clock.setFixedTime(J('2026-10-12T20:00:00'));
    await page.goto(base + 'log.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    if (scheme === 'light') await page.screenshot({ path: out + '/v2-empty.png', fullPage: true });
    await page.evaluate(() => {
      const T = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
      const shifts = []; let n = 0;
      const add = (s, e, opt = {}) => shifts.push(Object.assign({ id: 'x' + (n++), start: s, end: e, breaks: [], waits: [], holiday: false, lodging: false }, opt));
      for (let d = 1; d <= 9; d++) {
        if (d === 4) continue;
        add(T(2026,10,d,4), T(2026,10,d,17,30), { breaks: [{ s: T(2026,10,d,9), e: T(2026,10,d,9,30) }, { s: T(2026,10,d,12), e: T(2026,10,d,13) }], waits: [{ s: T(2026,10,d,6), e: T(2026,10,d,7,15) }] });
      }
      add(T(2026,10,4,6), T(2026,10,4,12), { holiday: true });
      add(T(2026,10,10,3), T(2026,10,10,19,30), { lodging: true });
      add(T(2026,10,11,4), T(2026,10,11,15));
      localStorage.setItem('dpc_log_v1', JSON.stringify({ v: 1, shifts }));
    });
    await page.reload();
    const tiles = await page.locator('#tiles').innerText();
    check(scheme + ' tiles show days', /出勤した日数\s*11\s*日/.test(tiles), tiles.replace(/\n/g, ' | ').slice(0, 200));
    check(scheme + ' alerts listed', (await page.locator('#alerts li').count()) >= 2);
    check(scheme + ' old records need sending', await page.locator('#remind').isVisible());
    await page.screenshot({ path: out + '/v2-month-' + scheme + '.png', fullPage: true });
    await noHScroll(page, 'B ' + scheme);

    if (scheme === 'light') {
      await page.locator('#shifts [data-edit]').first().click();
      check('legacy record label', /前の版で記録/.test(await page.locator('#eRec').innerText()), await page.locator('#eRec').innerText());
      await page.click('#eCancel');

      await page.click('[data-act="start"]');
      check('start -> 勤務中 (B)', (await page.locator('#state').innerText()) === '勤務中');
      await page.click('#placeSkip');
      await page.clock.setFixedTime(J('2026-10-12T20:00:05'));
      await page.click('[data-act="end"]');
      check('end same minute refused', (await page.locator('#state').innerText()) !== '勤務していません' && /始業と同じ時刻/.test(await page.locator('#toastText').innerText()));
      check('undo of the start still offered', await page.locator('#btnUndo').isVisible());
      await page.click('.shift.open [data-edit]');
      page.once('dialog', d => d.accept());
      await page.click('#eDelete');
      check('open shift deleted', (await page.locator('#state').innerText()) === '勤務していません');
      await page.click('#btnUndo');
      check('undo brings it back', (await page.locator('#state').innerText()) !== '勤務していません');
      await page.click('.shift.open [data-edit]');
      page.once('dialog', d => d.accept());
      await page.click('#eDelete');

      await page.click('#btnAdd');
      await page.fill('#eStart', '2026-10-12T06:00');
      await page.fill('#eEnd', '2026-10-12T05:00');
      await page.click('#eSave');
      check('end before start error', /終業が始業より前/.test(await page.locator('#eErr').innerText()));
      await page.fill('#eEnd', '2026-10-12T18:00');
      await page.click('#eAddBreak');
      await page.locator('#eBreaks .ps').last().fill('2026-10-12T12:00');
      await page.locator('#eBreaks .pe').last().fill('2026-10-12T13:00');
      await page.locator('#eBreaks .pl').last().fill('道の駅〇〇');
      await page.click('#eSave');
      const list = await page.locator('#shifts').innerText();
      check('added record listed', /10月12日（月）/.test(list) && /拘束 12時間00分/.test(list) && /道の駅〇〇/.test(list), list.slice(0, 200).replace(/\n/g, ' | '));
      await page.click('#btnAdd');
      await page.fill('#eStart', '2026-10-12T10:00');
      await page.fill('#eEnd', '2026-10-12T20:00');
      await page.click('#eSave');
      check('overlap refused', /重なっています/.test(await page.locator('#eErr').innerText()));
      await page.click('#eCancel');

      await Promise.all([page.waitForURL(/from=log/), page.click('#btnToChecker')]);
      await page.waitForTimeout(300);
      check('checker notice', /勤務の記録から読み込みました/.test(await page.locator('#noticeText').innerText()));
      const vals = await page.evaluate(() => ['ym', 'days', 'holidayDays', 'boundPerDay', 'minRest', 'ovTotalHours', 'ovOtHours', 'ovNightHours', 'ovHolidayHours', 'ovBoundMonth', 'basic'].map(k => k + '=' + document.getElementById(k).value).join(' '));
      check('checker values', /ym=2026-10/.test(vals) && /days=12/.test(vals) && /basic= /.test(vals + ' '), vals);
      check('transfer cleared', (await page.evaluate(() => localStorage.getItem('dpc_transfer_v1'))) === null);
      await page.screenshot({ path: out + '/v2-checker-from-log.png' });
      await Promise.all([page.waitForURL(/log\.html$/), page.click('#noticeText a[href="log.html"]')]);
      check('back to the log from the checker', (await page.locator('h1').innerText()) === '勤務の記録' && (await page.locator('#shifts > li').count()) > 0);
      await page.goto(base);
      check('plain visit sample', /サンプル表示中/.test(await page.locator('#noticeText').innerText()));
      check('checker links to the log', (await page.locator('a.to-log[href="log.html"]').count()) === 1 && (await page.locator('.foot a[href="log.html"]').count()) === 1);
      await page.screenshot({ path: out + '/v2-checker-top.png' });
      await noHScroll(page, 'checker top');
    }
    await ctx.close();
  }

  // ---------- C. location refused ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Tokyo', locale: 'ja-JP' });
    const page = await ctx.newPage(); watch(page, 'C');
    await page.goto(base + 'log.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.click('#geoToggle');   // a refusal can uncheck it at once, so only click
    await page.waitForFunction(() => /許可/.test(document.getElementById('geoNote').textContent), null, { timeout: 20000 }).catch(() => {});
    check('geo refused handled', !(await page.isChecked('#geoToggle')) && /許可/.test(await page.locator('#geoNote').innerText()), await page.locator('#geoNote').innerText());
    await ctx.close();
  }

  // ---------- D. a crafted backup file cannot inject markup ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Tokyo', locale: 'ja-JP' });
    const page = await ctx.newPage(); watch(page, 'D');
    await page.clock.setFixedTime(J('2026-10-12T20:00:00'));
    await page.goto(base + 'log.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const evil = { v: 1, exportedAt: '<i>x</i>', shifts: [{ id: 'a"><img src=x onerror="window.__pwn=1">', start: J('2026-10-05T06:00:00').getTime(), end: J('2026-10-05T15:00:00').getTime(),
      breaks: [{ s: J('2026-10-05T12:00:00').getTime(), e: J('2026-10-05T13:00:00').getTime(), place: '<img src=x onerror="window.__pwn=3">', sMeta: { rec: '<b>', loc: { lat: '1" onmouseover="window.__pwn=4', lng: 2 } } }], waits: [],
      startMeta: { rec: 'button', at: 0, loc: { lat: '1" onmouseover="x', lng: 2 }, place: '<b>太字</b>' }, notes: [{ at: 0, text: '<img src=x onerror="window.__pwn=2">' }],
      vehicle: { kind: '<img src=x onerror="window.__pwn=7">', no: '"><b>9</b>' }, odo: { s: '1" onmouseover="x', e: 5, eAt: '<i>', eRec: '<b>' },
      history: [{ at: 0, kind: 'edit', what: '<img src=x onerror="window.__pwn=5">' }] }],
      settings: { vehicles: [{ kind: '<img src=x onerror="window.__pwn=8">', no: '1' }, 'x', null] },
      audit: [{ at: 0, what: '<img src=x onerror="window.__pwn=6">' }] };
    const p = out + '/evil.json'; fs.writeFileSync(p, JSON.stringify(evil));
    page.once('dialog', d => d.accept());
    await page.setInputFiles('#restoreFile', p);
    await page.waitForTimeout(400);
    await page.locator('#shifts [data-edit]').first().click();
    await page.click('#eCancel');
    await page.waitForTimeout(200);
    check('crafted backup restored as text', (await page.locator('#shifts > li').count()) === 1 && /<b>太字<\/b>/.test(await page.locator('#shifts').innerText()));
    check('crafted vehicle and meter shown as text (車種 cut to 20 characters)', (await page.locator('#shifts').innerText()).includes('<img src=x onerror="・"><b>9</b>') && /終業 5km/.test(await page.locator('#shifts').innerText()),
      await page.locator('#shifts').innerText());
    check('no injected elements', (await page.locator('#shifts img, #shifts b, #auditList img, #eNotes img, #eHist img, #shifts a[onmouseover]').count()) === 0);
    await page.click('[data-act="start"]');
    await page.click('#btnVehManage');
    check('crafted vehicle in the screen shown as text', (await page.locator('#vehChips .pchip').count()) === 1 && (await page.locator('#vehChips .pchip').innerText()).startsWith('<img src=x onerror=') &&
      (await page.locator('#vehChips img, #savedVehs img, #ppPlace img').count()) === 0);
    await page.click('#placeSkip');
    check('no script ran', (await page.evaluate(() => window.__pwn)) === undefined);
    check('bad location gives no map link', (await page.locator('#shifts a[href*="maps"]').count()) === 0);
    await ctx.close();
  }


  // ---------- E. two tabs, double taps, 0-minute periods, editor checks, cancelled sharing, broken files ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Tokyo', locale: 'ja-JP' });
    await ctx.addInitScript(() => { try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('no')) }, configurable: true }); } catch (e) {} });
    const p1 = await ctx.newPage(); watch(p1, 'E1');
    await p1.goto(base + 'log.html');
    await p1.evaluate(() => localStorage.clear());
    await p1.reload();
    const p2 = await ctx.newPage(); watch(p2, 'E2');
    await p2.goto(base + 'log.html');
    await p2.click('[data-act="start"]');
    await p1.waitForFunction(() => document.getElementById('state').textContent === '勤務中', null, { timeout: 5000 }).catch(() => {});
    check('other tab sees the start', (await p1.locator('#state').innerText()) === '勤務中');
    await p1.click('[data-act="break"]');
    await p1.click('#placeSkip');
    await p2.waitForFunction(() => document.getElementById('state').textContent === '休憩中', null, { timeout: 5000 }).catch(() => {});
    let st = await p1.evaluate(() => JSON.parse(localStorage.getItem('dpc_log_v1')));
    check('two tabs keep one shift', st.shifts.length === 1 && st.shifts[0].breaks.length === 1, JSON.stringify(st.shifts.map(x => x.breaks.length)));
    check('second tab shows the break', (await p2.locator('#state').innerText()) === '休憩中');

    await p1.waitForTimeout(1600);
    await p1.dblclick('[data-act="breakEnd"]');
    st = await p1.evaluate(() => JSON.parse(localStorage.getItem('dpc_log_v1')));
    check('double tap does not start a new break', (await p1.locator('#state').innerText()) === '勤務中' && !st.shifts[0].breaks.some(b => b.e == null), JSON.stringify(st.shifts[0].breaks));
    check('0-minute break is not kept', st.shifts[0].breaks.every(b => b.e > b.s), JSON.stringify(st.shifts[0].breaks));
    check('undo offered after break end', await p1.locator('#btnUndo').isVisible());
    await p1.check('#fLodging');
    st = await p1.evaluate(() => JSON.parse(localStorage.getItem('dpc_log_v1')));
    check('flag change is logged', st.shifts[0].history.some(h => h.kind === 'info' && /宿泊を伴う長距離の印をつけた/.test(h.what)) && st.shifts[0].lodging === true);
    check('flag change ends the undo', await p1.locator('#btnUndo').isHidden());

    // the editor refuses overlaps and more than one open period
    const startVal = await (async () => { await p1.click('.shift.open [data-edit]'); return p1.inputValue('#eStart'); })();
    await p1.click('#eAddBreak'); await p1.locator('#eBreaks .ps').last().fill(startVal);
    await p1.click('#eAddWait'); await p1.locator('#eWaits .ps').last().fill(startVal);
    await p1.click('#eSave');
    check('two open periods refused', /1つだけ/.test(await p1.locator('#eErr').innerText()), await p1.locator('#eErr').innerText());
    await p1.click('#eCancel');
    await p1.click('#btnAdd');
    await p1.fill('#eStart', '2026-10-01T06:00'); await p1.fill('#eEnd', '2026-10-01T18:00');
    await p1.click('#eAddBreak'); await p1.locator('#eBreaks .ps').last().fill('2026-10-01T10:00'); await p1.locator('#eBreaks .pe').last().fill('2026-10-01T11:00');
    await p1.click('#eAddWait'); await p1.locator('#eWaits .ps').last().fill('2026-10-01T10:30'); await p1.locator('#eWaits .pe').last().fill('2026-10-01T11:30');
    await p1.click('#eSave');
    check('break and wait overlap refused', /重なっています/.test(await p1.locator('#eErr').innerText()), await p1.locator('#eErr').innerText());
    await p1.locator('#eWaits .ps').last().fill('2026-10-01T11:00'); await p1.locator('#eWaits .pe').last().fill('2026-10-01T12:00');
    await p1.click('#eSave');
    check('touching periods accepted', await p1.locator('#dlg').evaluate(d => !d.open));

    // the manual record is in October 2026; show that month
    await p1.selectOption('#ym', '2026-10');
    const sendBtn = p1.locator('#shifts [data-share]').first();
    p1.once('dialog', d => d.dismiss());
    await sendBtn.click();
    await p1.waitForTimeout(200);
    st = await p1.evaluate(() => JSON.parse(localStorage.getItem('dpc_log_v1')));
    check('cancelled share is not marked', !st.shifts.some(x => x.sharedAt), JSON.stringify(st.shifts.map(x => x.sharedAt)));
    p1.once('dialog', d => d.accept());
    await sendBtn.click();
    await p1.waitForTimeout(200);
    st = await p1.evaluate(() => JSON.parse(localStorage.getItem('dpc_log_v1')));
    check('accepted share is marked', st.shifts.some(x => x.sharedAt && x.sharedVia === 'copy'));

    const bad = out + '/broken.json';
    fs.writeFileSync(bad, JSON.stringify({ shifts: [{ id: 'a', start: 1, end: 2, breaks: [null] }] }));
    let alertText = '';
    p1.once('dialog', d => { alertText = d.message(); d.accept(); });
    await p1.setInputFiles('#restoreFile', bad);
    await p1.waitForTimeout(300);
    const after = await p1.evaluate(() => JSON.parse(localStorage.getItem('dpc_log_v1')).shifts.length);
    check('broken backup refused', /読めませんでした/.test(alertText) && after === 2, alertText + ' / ' + after);

    // the screen after a wait: 押したのを取り消す undoes the press itself
    await p1.waitForTimeout(1600);
    await p1.click('[data-act="wait"]');
    check('place prompt shown', await p1.locator('#placePrompt').isVisible());
    await p1.click('#ppUndo');
    check('the wait is undone from the screen', await p1.locator('#placePrompt').isHidden() && (await p1.locator('#state').innerText()) === '勤務中');
    await ctx.close();
  }


  // ---------- F. home screen: manifest, icons, and opening without a signal ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Tokyo', locale: 'ja-JP' });
    const page = await ctx.newPage(); watch(page, 'F');
    await page.goto(base + 'log.html');
    const man = await page.evaluate(async () => {
      const href = document.querySelector('link[rel="manifest"]').href;
      const m = await (await fetch(href)).json();
      const icons = await Promise.all(m.icons.map(async i => (await fetch(new URL(i.src, href))).status));
      const touch = (await fetch(document.querySelector('link[rel="apple-touch-icon"]').href)).status;
      return { name: m.short_name, start: new URL(m.start_url, href).pathname, display: m.display, icons, touch };
    });
    check('manifest and icons', man.name === '勤務の記録' && /\/log\.html$/.test(man.start) && man.display === 'standalone' && man.icons.every(x => x === 200) && man.touch === 200, JSON.stringify(man));
    check('install help shown', await page.locator('#installBox').isVisible() && (await page.locator('#installText').innerText()).length > 20);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
    check('service worker controls the page', await page.evaluate(() => !!navigator.serviceWorker.controller));
    await ctx.setOffline(true);
    await page.reload();
    check('log opens without a signal', (await page.locator('h1').innerText()) === '勤務の記録' && (await page.locator('[data-act="start"]').count()) === 1);
    await page.goto(base + '?from=log');
    check('checker opens without a signal', /ドライバー給料チェッカー/.test(await page.locator('h1').innerText()));
    await ctx.setOffline(false);
    await page.goto(base + 'log.html');
    await page.screenshot({ path: out + '/v2-install-box.png', fullPage: true });
    await ctx.close();
  }


  // ---------- G. places registered by the driver, picked above the buttons ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'Asia/Tokyo', locale: 'ja-JP' });
    const page = await ctx.newPage(); watch(page, 'G');
    await page.clock.install({ time: J('2026-10-14T05:50:00') });
    await page.goto(base + 'log.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const at = s => page.clock.setSystemTime(J(s));
    check('no places yet: hint shown', await page.locator('#pickHint').isVisible() && await page.locator('#placeSel').isHidden());
    await page.click('#btnPlaces');
    await page.fill('#newPlace', '〇〇運輸 本社車庫'); await page.click('#btnAddPlace');
    await page.fill('#newPlace', '〇〇センター'); await page.press('#newPlace', 'Enter');
    check('places registered', (await page.locator('#savedPlaces li').count()) === 2 && (await page.locator('#placeSel option').count()) === 3);
    await page.click('#btnPlacesClose');
    await page.selectOption('#placeSel', '〇〇運輸 本社車庫');
    await page.screenshot({ path: out + '/v2-pick.png' });
    await at('2026-10-14T06:00:00');
    await page.click('[data-act="start"]');
    let st = await page.evaluate(() => JSON.parse(localStorage.getItem('dpc_log_v1')));
    check('start with the picked place: the screen asks only the vehicle and the meter', st.shifts[0].startMeta.place === '〇〇運輸 本社車庫' && await page.locator('#ppPlace').isHidden() &&
      await page.locator('#ppVeh').isVisible() && await page.locator('#ppOdo').isVisible() && /場所：〇〇運輸 本社車庫/.test(await page.locator('#toastText').innerText()));
    await page.click('#placeSkip');
    check('picker resets while working', (await page.inputValue('#placeSel')) === '');
    await at('2026-10-14T09:00:00');
    await page.click('[data-act="wait"]');
    check('prompt shows the registered places', (await page.locator('#placeChips .pchip').count()) === 2);
    await page.click('#placeChips .pchip[data-place="〇〇センター"]');
    await at('2026-10-14T10:00:00');
    await page.click('[data-act="waitEnd"]');
    await at('2026-10-14T18:00:00');
    await page.click('[data-act="end"]');
    await page.fill('#placeInput', '〇〇PA');
    await page.check('#placeRemember');
    await page.click('#placeSave');
    st = await page.evaluate(() => JSON.parse(localStorage.getItem('dpc_log_v1')));
    check('chip and typed places saved', st.shifts[0].waits[0].place === '〇〇センター' && st.shifts[0].endMeta.place === '〇〇PA' && st.settings.places.indexOf('〇〇PA') >= 0, JSON.stringify(st.settings));
    check('next start picks the last start place', (await page.inputValue('#placeSel')) === '〇〇運輸 本社車庫');
    await page.click('#btnPlaces');
    page.once('dialog', d => d.accept());
    await page.click('#savedPlaces [data-delplace="〇〇センター"]');
    st = await page.evaluate(() => JSON.parse(localStorage.getItem('dpc_log_v1')));
    check('deleting a place keeps the records', st.settings.places.indexOf('〇〇センター') < 0 && st.shifts[0].waits[0].place === '〇〇センター');
    await page.click('#btnPlacesClose');
    await noHScroll(page, 'G');
    await ctx.close();
  }


  // ---------- H. 始業 and 終業 open a screen: the place, the vehicle (車種・車番) and the meter ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'Asia/Tokyo', locale: 'ja-JP', acceptDownloads: true,
      permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage(); watch(page, 'H');
    await page.clock.install({ time: J('2026-10-15T05:50:00') });
    await page.goto(base + 'log.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const at = s => page.clock.setSystemTime(J(s));
    const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('dpc_log_v1')));
    const flat = async sel => (await page.locator(sel).innerText()).replace(/\s/g, '');
    const isModal = () => page.locator('#placePrompt').evaluate(d => d.open && d.matches(':modal'));
    const closed = () => page.locator('#placePrompt').evaluate(d => !d.open);
    const pressed = () => page.locator('#vehChips .pchip[aria-pressed="true"]').count();

    check('no vehicle row above the buttons', (await page.locator('#vehSel').count()) === 0 && (await page.locator('#vpick').count()) === 0);
    await at('2026-10-15T06:00:00');
    await page.click('[data-act="start"]');
    check('始業 opens a screen with place, vehicle and meter', await isModal() && await page.locator('#ppPlace').isVisible() && await page.locator('#ppVeh').isVisible() &&
      await page.locator('#ppOdo').isVisible() && /始業の場所（出発する場所/.test(await page.locator('#placeLabel').innerText()) && /6:00 に始業を記録しました/.test(await page.locator('#ppTitle').innerText()));
    check('the screen offers to undo a wrong press', await page.locator('#ppUndoRow').isVisible());
    check('no keyboard pops up by itself', (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'ppTitle');
    await page.screenshot({ path: out + '/v4-start-screen.png' });
    await page.fill('#placeInput', '本社車庫');
    await page.fill('#ppVehKind', '10t車'); await page.fill('#ppVehNo', '12-34');
    await page.fill('#odoInput', 'abc');
    await page.click('#placeSave');
    let st = await store();
    check('bad meter refused, nothing saved', /数字で/.test(await page.locator('#ppErr').innerText()) && !st.shifts[0].startMeta.place && !st.shifts[0].vehicle && await isModal());
    await page.fill('#odoInput', '１２３，４５６');   // full-width digits and comma from a Japanese keyboard
    await page.click('#placeSave');
    st = await store();
    check('始業: place, vehicle and meter saved', st.shifts[0].startMeta.place === '本社車庫' && st.shifts[0].vehicle.kind === '10t車' && st.shifts[0].vehicle.no === '12-34' &&
      st.shifts[0].odo.s === 123456 && st.shifts[0].odo.sRec === 'now' && await closed(), JSON.stringify([st.shifts[0].vehicle, st.shifts[0].odo]));
    check('the vehicle is registered, and remembered for next time', st.settings.vehicles.length === 1 && st.settings.lastVehicle.no === '12-34');
    check('toast lists what was kept', (await page.locator('#toastText').innerText()).includes('6:00 に始業を記録しました。場所：本社車庫、車両：10t車・12-34、始業のメーター 123,456kmを残しました。'),
      await page.locator('#toastText').innerText());
    check('vehicle shown while working', /10t車・12-34/.test(await page.locator('#stateSub').innerText()));
    check('no tool button when the vehicle and the start meter are in', await page.locator('#btnOdo').isHidden());
    check('open shift shows vehicle and meter', /車両10t車・12-34/.test(await flat('.shift.open')) && /始業123,456km/.test(await flat('.shift.open')), await flat('.shift.open'));

    await at('2026-10-15T18:00:00');
    await page.click('[data-act="end"]');
    check('終業 opens a screen with the place where the truck was left and the meter', await isModal() && /トラックを停めた場所/.test(await page.locator('#placeLabel').innerText()) &&
      await page.locator('#ppVeh').isHidden() && /終業のメーター/.test(await page.locator('#odoLabel').innerText()) && /始業は 123,456km/.test(await page.locator('#odoHint').innerText()));
    await page.screenshot({ path: out + '/v4-end-screen.png' });
    await page.fill('#placeInput', '本社車庫');
    await page.fill('#odoInput', '123000');
    await page.press('#odoInput', 'Enter');
    check('end meter smaller than the start refused', /始業（123,456km）より小さく/.test(await page.locator('#ppErr').innerText()));
    await page.fill('#odoInput', '123789');
    await page.press('#odoInput', 'Enter');
    st = await store();
    check('終業: place and meter saved', st.shifts[0].odo.e === 123789 && st.shifts[0].endMeta.place === '本社車庫' && await closed());
    check('the send link stays after the screen', await page.locator('#btnShareNow').isVisible());
    check('list shows the distance', /123,456→123,789km（走行333km）/.test(await flat('#shifts')), (await flat('#shifts')).slice(0, 200));
    check('month tile shows the distance', /走行距離333km/.test(await flat('#tiles')) && /1回分/.test(await flat('#tiles')));
    check('no tool button after a finished day', await page.locator('#btnOdo').isHidden());
    await page.screenshot({ path: out + '/v4-after-day.png', fullPage: true });
    await noHScroll(page, 'H after day');

    await page.click('#btnShareNow');
    await page.waitForTimeout(300);
    let clip = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
    check('share text has vehicle and meter', clip.includes('車両 10t車・12-34\n始業 10/15 6:00 本社車庫\n') && clip.includes('始業のメーター 123,456km（6:00 に入力）') &&
      clip.includes('終業のメーター 123,789km（18:00 に入力）') && clip.includes('走行距離 333km'), clip);
    fs.writeFileSync(out + '/share-text-vehicle.txt', clip);

    // next day: last time's vehicle is filled in; Escape (or 書かない) keeps nothing
    await at('2026-10-16T06:00:00');
    await page.click('[data-act="start"]');
    check('the last vehicle is filled in and its chip is on', (await page.inputValue('#ppVehKind')) === '10t車' && (await page.inputValue('#ppVehNo')) === '12-34' && (await pressed()) === 1);
    check('hint shows this vehicle’s last end', /前回この車の終業は 123,789km/.test(await page.locator('#odoHint').innerText()), await page.locator('#odoHint').innerText());
    await page.keyboard.press('Escape');
    st = await store();
    check('Escape closes the screen and keeps nothing', await closed() && !st.shifts[1].vehicle && !st.shifts[1].odo);
    check('the tool offers the vehicle and the meter', await page.locator('#btnOdo').isVisible() && (await page.locator('#btnOdo').innerText()) === '車両・メーターを入れる');

    // the tool, after the screen is gone; another vehicle typed in is registered too
    await at('2026-10-16T06:25:00');
    await page.click('#btnOdo');
    check('the tool opens the same screen with what is missing', await isModal() && /10月16日（金）の始業（6:00）の記録に足す/.test(await page.locator('#ppTitle').innerText()) &&
      await page.locator('#ppPlace').isVisible() && await page.locator('#ppVeh').isVisible() && await page.locator('#ppOdo').isVisible() && await page.locator('#ppUndoRow').isHidden());
    await page.fill('#ppVehKind', '4t車'); await page.fill('#ppVehNo', '56-78');
    check('typing another vehicle turns the chip off', (await pressed()) === 0);
    await page.fill('#odoInput', '200,100 km');
    await page.click('#placeSave');
    st = await store();
    check('the tool saves with its own undo', st.shifts[1].vehicle.no === '56-78' && st.shifts[1].odo.s === 200100 && st.settings.vehicles.length === 2 &&
      /車両：4t車・56-78、始業のメーター 200,100kmを残しました/.test(await page.locator('#toastText').innerText()) && await page.locator('#btnUndo').isVisible(), await page.locator('#toastText').innerText());
    await page.click('#btnUndo');
    st = await store();
    check('undo puts back only what the screen wrote', st.shifts.length === 2 && !st.shifts[1].vehicle && !st.shifts[1].odo && st.shifts[1].end == null);

    // a number that another tab put in first is not overwritten
    await page.click('#btnOdo');
    await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('dpc_log_v1')); o.shifts[1].odo = { s: 111, e: null, sAt: Date.now(), eAt: null, sRec: 'now', eRec: null }; localStorage.setItem('dpc_log_v1', JSON.stringify(o)); });
    await page.fill('#odoInput', '200100'); await page.click('#placeSave');
    st = await store();
    check('a number put in elsewhere is not overwritten', /もう入っています（111km）/.test(await page.locator('#ppErr').innerText()) && st.shifts[1].odo.s === 111 && !st.shifts[1].vehicle);
    await page.click('#placeSkip');
    check('the tool comes back after やめる', await page.locator('#btnOdo').isVisible() && (await page.locator('#btnOdo').innerText()) === '車両・メーターを入れる');
    await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('dpc_log_v1')); o.shifts[1].odo = null; localStorage.setItem('dpc_log_v1', JSON.stringify(o)); });
    await page.click('#btnOdo');
    await page.locator('#vehChips .pchip', { hasText: '10t車・12-34' }).click();
    check('a chip fills the vehicle', (await page.inputValue('#ppVehKind')) === '10t車' && (await pressed()) === 1);
    await page.locator('#vehChips .pchip', { hasText: '4t車・56-78' }).click();
    check('another chip switches it', (await page.inputValue('#ppVehNo')) === '56-78' && (await pressed()) === 1);
    await page.fill('#odoInput', '200100'); await page.click('#placeSave');

    // 終業 at 20:00, then a correction in the editor keeps when the number was first put in
    await at('2026-10-16T20:00:00');
    await page.click('[data-act="end"]');
    await page.fill('#odoInput', '200410'); await page.click('#placeSave');
    await at('2026-10-16T20:05:00');
    await page.locator('#shifts [data-edit]').first().click();
    check('editor shows vehicle and meter', (await page.inputValue('#eVehKind')) === '4t車' && (await page.inputValue('#eOdoS')) === '200100' && (await page.inputValue('#eOdoE')) === '200410' &&
      /走行距離 310km/.test(await page.locator('#eOdoNote').innerText()));
    await page.fill('#eOdoE', '200400');
    check('editor note follows the input', /走行距離 300km/.test(await page.locator('#eOdoNote').innerText()));
    await page.screenshot({ path: out + '/v4-editor.png' });
    await page.fill('#eOdoS', 'x');
    await page.click('#eSave');
    check('editor refuses a bad meter', /始業のメーターは数字で/.test(await page.locator('#eErr').innerText()));
    await page.fill('#eOdoS', '200100');
    await page.click('#eSave');
    st = await store();
    const sh2 = st.shifts.find(x => x.start === J('2026-10-16T06:00:00').getTime());
    check('a corrected meter keeps when it was first put in', sh2.odo.e === 200400 && Math.abs(sh2.odo.eAt - J('2026-10-16T20:00:00').getTime()) < 60000 && sh2.odo.eRec === 'now' &&
      Math.abs(sh2.odo.eEditedAt - J('2026-10-16T20:05:00').getTime()) < 60000 && sh2.odo.sEditedAt == null, JSON.stringify(sh2.odo));
    check('the correction is a change of the record', sh2.history.some(h => h.kind === 'edit' && /終業のメーター 200,410km → 200,400km/.test(h.what)) && /あとで直した/.test(await page.locator('#shifts > li').first().innerText()),
      JSON.stringify(sh2.history));
    await page.locator('#shifts [data-share]').first().click();
    await page.waitForTimeout(300);
    clip = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
    check('share text shows the correction', clip.includes('車両 4t車・56-78') && clip.includes('終業のメーター 200,400km（20:00 に入力、20:05 に直した）') && clip.includes('走行距離 300km'), clip);
    check('month total', /走行距離633km/.test(await flat('#tiles')) && /2回分/.test(await flat('#tiles')), await flat('#tiles'));

    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnCsv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    fs.writeFileSync(out + '/log-vehicle.csv', csv);
    check('csv vehicle columns, 車番 kept as text', /宿泊を伴う長距離,車種,車番,始業のメーター\(km\),終業のメーター\(km\),走行距離\(km\),始業の場所/.test(csv) && csv.includes(',10t車,"=""12-34""",123456,123789,333,') &&
      csv.includes('終業のメーター：2026年10月16日 20:00 に入力、2026年10月16日 20:05 に直した') && csv.includes('始業のメーター：2026年10月15日 6:00 に入力'), csv.slice(0, 900));
    const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#btnBackup')]);
    const bkObj = JSON.parse(fs.readFileSync(await bk.path(), 'utf8'));
    check('backup has vehicles and meters', bkObj.settings.vehicles.length === 2 && bkObj.shifts.every(x => x.odo && x.odo.e != null));

    // deleting a registered vehicle from the screen keeps the records; 押したのを取り消す in the screen undoes the press
    await at('2026-10-17T06:00:00');
    await page.click('[data-act="start"]');
    check('the last vehicle (4t) is filled in', (await page.inputValue('#ppVehNo')) === '56-78');
    await page.click('#btnVehManage');
    check('registered vehicles listed', (await page.locator('#savedVehs li').count()) === 2);
    page.once('dialog', d => d.accept());
    await page.locator('#savedVehs li', { hasText: '10t車・12-34' }).locator('[data-delveh]').click();
    st = await store();
    check('deleting a vehicle keeps the records', st.settings.vehicles.length === 1 && (await page.locator('#vehChips .pchip').count()) === 1 && st.shifts[0].vehicle.no === '12-34' && st.settings.lastVehicle.no === '56-78');
    await noHScroll(page, 'H screen');
    await page.click('#ppUndo');
    st = await store();
    check('押したのを取り消す undoes the press', st.shifts.length === 2 && await closed() && (await page.locator('#state').innerText()) === '勤務していません');
    await ctx.close();
  }

  await browser.close();
  console.log(results.join('\n'));
  const fails = results.filter(r => r.startsWith('FAIL')).length;
  console.log(fails ? fails + ' FAILED' : 'ALL PASS (' + results.filter(r => r.startsWith('PASS')).length + ')');
  console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'no console errors');
})();
