// 紹介（A8.netのアフィリエイト広告）の置き場所。いまは適性・進路診断（shindan.html）が読む。
// 決まり（ドライブ13の「00_最初に読む（引き継ぎメモ）」の「紹介を入れるときの決まり」）
//  ・tag には、A8の管理画面で発行したタグをそのまま貼る（書きかえない）。tag が空のあいだは、どこにも出ない
//  ・都道府県や年齢に条件がある紹介は、その人が対象だと分かったときだけ出す（分からないときは出さない）
//  ・紹介の近くに「PR」と「当サイトはアフィリエイト広告を利用しています」を出す（ページの側で付ける）
//  ・申し込むと電話が来るものは note に書く。自分で申し込まない。紹介を入れたら、A8に広告掲載URLを出す
//  ・何秒か閉じられない広告や、待たせて見せる広告は作らない
(function (root) {
  'use strict';
  const PREFS = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県',
    '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
    '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
    '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県',
    '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'];
  const KANTO4 = ['埼玉県', '千葉県', '東京都', '神奈川県'];
  const CALL = '申し込むと、担当の人から電話で連絡が来ます。';

  // places：'shindan-intro'（診断の質問の前。「診断を始める」の下）、'shindan-result'（診断の結果のすぐ下）
  // prefs：対象の都道府県（書かなければ全国）。ageMin・ageMax：対象の年齢（その歳を含む）
  // licensed：運転免許を持っている人だけ。need：'license' は、診断で新しい免許が要ると出た人だけ（合宿免許など）
  // text：紹介文（空なら出さない）。note：申し込む前に知っておいてほしいこと
  // 条件は2026年10月11日の提携申請のときのもの。承認のときにA8の提携画面で確かめなおす
  const ADS = [
    { id: 'nihon-driver', name: '日本ドライバー人材センター', kind: 'job', places: ['shindan-result'],
      prefs: KANTO4.concat(['茨城県', '群馬県', '静岡県', '京都府', '大阪府']),   // 条件の「名古屋」は、A8の条件で愛知県全体か分かるまで入れない
      ageMin: 21, text: '', note: CALL, tag: '' },
    { id: 'levajob', name: 'レバジョブ', kind: 'job', places: ['shindan-result'],
      prefs: KANTO4.concat(['大阪府']), ageMin: 18, ageMax: 59,
      text: '', note: CALL, tag: '' },   // 紹介文は、レバジョブの広告ガイドラインを見てから書く
    { id: 'colorful-driver', name: 'カラフルエージェントドライバー', kind: 'job', places: ['shindan-result'],
      prefs: KANTO4.concat(['愛知県', '大阪府']), ageMin: 18, ageMax: 56, licensed: true,   // 57歳未満。18歳未満にはどの転職の紹介も出さない
      text: '', note: '日本国籍で運転免許を持っている人などが対象です。' + CALL, tag: '' }
  ];

  // ?ad=preview のときに出す見本。どこに・どう出るかを見るためのもので、リンクはない
  const SAMPLE_TAG = '<span class="ad-sample">（見本）ここにA8のリンクが入ります</span>';
  const SAMPLES = [
    { id: 'sample-school', name: '（見本）合宿免許の紹介', kind: 'school', places: ['shindan-intro', 'shindan-result'], need: 'license',
      text: '地域や年齢の条件がない紹介は、ここに出ます。結果では、新しい免許が要ると出た人にだけ出します。', note: '', tag: SAMPLE_TAG },
    { id: 'sample-job', name: '（見本）ドライバーの転職サービス', kind: 'job', places: ['shindan-result'],
      prefs: KANTO4.concat(['大阪府']), ageMin: 18, ageMax: 59,
      text: '地域と年齢に条件がある紹介は、都道府県と年齢を入れて、対象だった人にだけ出ます（この見本は一都三県・大阪、18〜59歳）。', note: CALL, tag: SAMPLE_TAG }
  ];

  const num = v => typeof v === 'number' && isFinite(v);
  const str = v => typeof v === 'string' && v.length > 0;
  // 書き方のおかしい紹介は出さない（年齢を文字で書いた、都道府県を配列にしていない、種類のつづりちがい など）
  function wellFormed(ad){
    return !!ad && typeof ad === 'object' && str(ad.id) && str(ad.name) && str(ad.tag) && str(ad.text) &&
      (ad.kind === 'job' || ad.kind === 'school') &&
      Array.isArray(ad.places) && ad.places.length > 0 && ad.places.every(str) &&
      (ad.prefs == null || (Array.isArray(ad.prefs) && ad.prefs.length > 0 && ad.prefs.every(p => PREFS.indexOf(p) >= 0))) &&
      (ad.ageMin == null || num(ad.ageMin)) && (ad.ageMax == null || num(ad.ageMax)) &&
      (ad.licensed == null || typeof ad.licensed === 'boolean') && (ad.need == null || ad.need === 'license') &&
      (ad.note == null || typeof ad.note === 'string');
  }
  // who：pref（都道府県の名前）、ageLo・ageHi（ありうる年齢の幅）、licensed、needLicense。分からないものは入れない
  // 返す値：'yes' 出してよい、'maybe' 都道府県や年齢が分かれば出せるかもしれない、'no' 出さない
  function check(ad, place, who){
    who = who || {};
    if (!wellFormed(ad) || ad.places.indexOf(place) < 0) return 'no';
    if (ad.need === 'license' && who.needLicense === false) return 'no';
    if (ad.licensed && who.licensed === false) return 'no';
    let maybe = !!ad.licensed && who.licensed !== true;
    const lo = num(who.ageLo) ? who.ageLo : -Infinity, hi = num(who.ageHi) ? who.ageHi : Infinity;
    // 転職の紹介は、条件に書いていなくても18歳から
    const min = Math.max(num(ad.ageMin) ? ad.ageMin : -Infinity, ad.kind === 'job' ? 18 : -Infinity);
    const max = num(ad.ageMax) ? ad.ageMax : Infinity;
    if (hi < min || lo > max) return 'no';
    if (lo < min || hi > max) maybe = true;
    if (ad.prefs){
      if (!str(who.pref)) maybe = true;
      else if (ad.prefs.indexOf(who.pref) < 0) return 'no';
    }
    return maybe ? 'maybe' : 'yes';
  }
  const pool = preview => preview ? SAMPLES : ADS;
  // 出してよい紹介
  const list = (place, who, preview) => pool(preview).filter(ad => check(ad, place, who) === 'yes');
  // 都道府県と年齢を聞けば出せるかもしれない紹介
  const maybeList = (place, who, preview) => pool(preview).filter(ad => check(ad, place, who) === 'maybe');
  // そのページに出す紹介が1つでもあるか（ページの上の「広告があります」の表示に使う）
  const active = (prefix, preview) => pool(preview).some(ad => wellFormed(ad) && ad.places.some(p => p.indexOf(prefix) === 0));

  root.DPC_ADS = { PREFS, ADS, SAMPLES, wellFormed, check, list, maybeList, active };
})(typeof window !== 'undefined' ? window : this);
