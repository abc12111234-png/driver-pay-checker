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
    await page.screenshot({ path: out + '/v2-start-prompt.png' });
    await page.fill('#placeInput', '東京営業所');
    await page.click('#placeSave');
    await page.waitForFunction(() => document.querySelector('#shifts a[href*="maps"]'));
    const href = await page.locator('#shifts a[href*="maps"]').first().getAttribute('href');
    check('map link', href === 'https://www.google.com/maps/search/?api=1&query=35.68124,139.76713', href);
    check('toast mentions place', /場所：東京営業所/.test(await page.locator('#toastText').innerText()), await page.locator('#toastText').innerText());

    await at('2026-10-12T09:00:00');
    await page.click('[data-act="wait"]');
    check('wait prompt', /荷待ちの場所/.test(await page.locator('#placeLabel').innerText()));
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
    check('list numbers', /拘束 12時間00分/.test(list2) && /荷待ち 2時間00分/.test(list2) && /労働 11時間00分/.test(list2), list2.replace(/\n/g, ' | '));
    check('map links for start/wait/break/end', (await page.locator('#shifts a[href*="maps"]').count()) === 4, String(await page.locator('#shifts a[href*="maps"]').count()));
    await page.screenshot({ path: out + '/v2-after-day.png', fullPage: true });
    await noHScroll(page, 'A after day');

    await page.click('#btnShareNow');
    await page.waitForTimeout(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check('share text', clip.includes('【勤務の記録】10月12日（月）') && clip.includes('始業 10/12 6:00 東京営業所（その場でボタン）') &&
      clip.includes('荷待ち 9:00〜11:00 〇〇センター 3番（その場でボタン）') && clip.includes('メモ（10/12 9:05 に記入）受付は8時の予約') &&
      clip.includes('終業 10/12 18:00 〇〇PAで車中泊（その場でボタン）') && clip.includes('始業（誤差 約20m） https://www.google.com/maps/search/?api=1&query=35.68124,139.76713') &&
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
    check('editor shows how it was recorded', /始業 その場でボタン／終業 その場でボタン/.test(await page.locator('#eRec').innerText()), await page.locator('#eRec').innerText());
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
    check('csv head', /始業の場所,始業の位置,終業の場所,終業の位置,休憩,荷待ち,メモ,記録の仕方,変更,送った日時/.test(csv));
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
      await page.goto(base);
      check('plain visit sample', /サンプル表示中/.test(await page.locator('#noticeText').innerText()));
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
    await page.check('#geoToggle');
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
      history: [{ at: 0, kind: 'edit', what: '<img src=x onerror="window.__pwn=5">' }] }],
      audit: [{ at: 0, what: '<img src=x onerror="window.__pwn=6">' }] };
    const p = out + '/evil.json'; fs.writeFileSync(p, JSON.stringify(evil));
    page.once('dialog', d => d.accept());
    await page.setInputFiles('#restoreFile', p);
    await page.waitForTimeout(400);
    await page.locator('#shifts [data-edit]').first().click();
    await page.click('#eCancel');
    await page.waitForTimeout(200);
    check('crafted backup restored as text', (await page.locator('#shifts > li').count()) === 1 && /<b>太字<\/b>/.test(await page.locator('#shifts').innerText()));
    check('no injected elements', (await page.locator('#shifts img, #auditList img, #eNotes img, #eHist img, #shifts a[onmouseover]').count()) === 0);
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

    // the place prompt goes away when a record is saved in the editor
    await p1.waitForTimeout(1600);
    await p1.click('[data-act="wait"]');
    check('place prompt shown', await p1.locator('#placePrompt').isVisible());
    await p1.click('.shift.open [data-edit]');
    await p1.click('#eSave');
    check('place prompt hidden after editor save', await p1.locator('#placePrompt').isHidden());
    await ctx.close();
  }

  await browser.close();
  console.log(results.join('\n'));
  const fails = results.filter(r => r.startsWith('FAIL')).length;
  console.log(fails ? fails + ' FAILED' : 'ALL PASS (' + results.filter(r => r.startsWith('PASS')).length + ')');
  console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'no console errors');
})();
