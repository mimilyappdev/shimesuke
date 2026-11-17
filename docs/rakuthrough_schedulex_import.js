// RakuThrough 側で使う「SchedulEX からの取り込み」部品（案）
// - まだ RakuThrough には組み込んでいません。RakuThrough の担当セッションが app/index.html に取り込む想定です。
// - 引継ぎ票の形は docs/引継ぎ票_v1.md を参照。
// - ここにあるのは「読む・確かめる・取引の形に直す」だけ。Firestore への書き込みと画面は RakuThrough 側で作ります。

export const HANDOFF_FMT = 'mimily-handoff';
export const HANDOFF_SUPPORTED_V = [1];
const CODE_PREFIX = 'SCHEDULEX1.';
const MAX_AMOUNT = 100000000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(s) {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

function decodeBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// 「#import=xxxx」「SCHEDULEX1.xxxx」「xxxx」のどれでも受け付ける
export function decodeHandoffText(text) {
  let s = String(text || '').trim();
  if (s.startsWith('#')) s = s.slice(1);
  if (s.startsWith('import=')) s = s.slice('import='.length);
  if (s.startsWith(CODE_PREFIX)) s = s.slice(CODE_PREFIX.length);
  if (!s) return { error: 'empty' };
  try {
    return validateHandoff(JSON.parse(decodeBase64Url(s)));
  } catch (e) {
    return { error: 'broken' };
  }
}

// 中身を確かめる。エラーの種類ごとに、画面で出し分ける文言を下の HANDOFF_ERROR_TEXT に用意
export function validateHandoff(h) {
  if (!h || h.fmt !== HANDOFF_FMT) return { error: 'not_handoff' };
  if (!HANDOFF_SUPPORTED_V.includes(h.v)) return { error: 'version', v: h.v };
  if (h.src !== 'schedulex') return { error: 'source' };
  if (typeof h.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(h.id)) return { error: 'broken' };
  if (h.currency !== 'JPY') return { error: 'currency' };
  if (!Number.isInteger(h.amount) || h.amount < 0 || h.amount >= MAX_AMOUNT) return { error: 'amount' };
  if (h.amount === 0) return { error: 'zero' }; // Firestore ルールで amount > 0 が必須
  if (!isIsoDate(h.salesDate)) return { error: 'sales_date' };
  for (const k of ['requestDate', 'paidDate']) {
    if (h[k] !== null && h[k] !== undefined && !isIsoDate(h[k])) return { error: 'broken' };
  }
  if (h.paidAmount !== null && h.paidAmount !== undefined &&
      (!Number.isInteger(h.paidAmount) || h.paidAmount < 0 || h.paidAmount >= MAX_AMOUNT)) return { error: 'amount' };
  return {
    value: {
      id: h.id,
      kind: String(h.kind || 'other'),
      amount: h.amount,
      withholding: h.withholding === true,
      requestDate: h.requestDate || null,
      salesDate: h.salesDate,
      paidDate: h.paidDate || null,
      paidAmount: h.paidAmount ?? null,
    },
  };
}

export const HANDOFF_ERROR_TEXT = {
  empty:       '取り込むデータが空です。SchedulEXでもう一度「RakuThroughに送る」を押してください。',
  broken:      'データが途中で切れているか、壊れています。SchedulEXで「引継ぎコードをコピー」から貼り付けてください。',
  not_handoff: 'SchedulEXの引継ぎデータではないようです。',
  version:     'SchedulEXの新しい形式のデータです。RakuThroughを最新にしてから、もう一度お試しください。',
  source:      'このアプリからの取り込みには、まだ対応していません。',
  currency:    '円以外の金額は取り込めません。',
  amount:      '金額が読み取れませんでした。SchedulEXで金額を確かめてください。',
  zero:        '金額が0円の依頼は、売上として取り込めません。',
  sales_date:  '納品日（売上の日付）がありません。SchedulEXで納品日を入れてから送ってください。',
  not_signed_in: 'RakuThroughにログインすると、取り込みの確認画面が出ます。',
};

// 源泉の目安は、請求額 × 10.21% の切り捨て。
// （RakuThrough の手入力は「受取額から請求額を逆算」で向きが違う。100万円を超える部分の20.42%はどちらも未対応なので「目安」として出す）
// 入金額が書かれていれば、その額を正として「請求額 − 入金額」を源泉として扱う。
export function splitWithholding(h) {
  if (!h.withholding) return { grossAmount: h.amount, receivedAmount: h.paidAmount ?? h.amount, withholdingTax: 0, estimated: false };
  if (h.paidAmount !== null && h.paidAmount <= h.amount) {
    return { grossAmount: h.amount, receivedAmount: h.paidAmount, withholdingTax: h.amount - h.paidAmount, estimated: false };
  }
  const tax = Math.floor(h.amount * 0.1021);
  return { grossAmount: h.amount, receivedAmount: h.amount - tax, withholdingTax: tax, estimated: true };
}

// RakuThrough の取引（transactions の1件）の形に直す。
// autoDebit / autoCredit は RakuThrough の既存関数を渡す。walletType は確認画面で選んだ値。
// 保存は setDoc(doc(transactions, docId), tx)。読み込みが { id: d.id, ...d.data() } なので、tx には id を入れない。
// 上書き（再取り込み）は、ルールで createdAt・source などを更新できないため、Rakutto! と同じく「同じ docId を削除してから作り直す」。
// 書き込み前に softLockCheck(tx.fiscalYear) と、無料プランの月5件の上限を手入力と同じように確かめる。
export function handoffToTransaction(h, { autoDebit, autoCredit, walletType = 'personal', categoryId = 'sales', categoryName = '売上高', kindLabel = '', now = new Date().toISOString() }) {
  const w = splitWithholding(h);
  const paidBeforeSale = h.paidDate && h.paidDate < h.salesDate;
  const crossYearPrepay = paidBeforeSale && h.paidDate.slice(0, 4) !== h.salesDate.slice(0, 4);
  // 入金日が空 → 未入金（売掛）。入金日が納品日以降 → 売掛として計上し、入金日で消し込み済み。
  // 入金日が納品日より前（前払い） → RakuThrough の売掛の仕組みに乗らないので、入金済みで取り込み、入金日はメモに残す（要確認）。
  const status = h.paidDate ? 'settled' : 'pending';
  const debitStatus = h.paidDate && !paidBeforeSale ? 'pending' : status; // 売掛経由なら借方は売掛金のまま
  const debit  = { ...autoDebit('income', walletType, debitStatus, categoryName), amount: w.grossAmount };
  const credit = { ...autoCredit('income', walletType, categoryName), amount: w.grossAmount };
  const sourceKey = `schedulex_${h.id}`;
  const tx = {
    type: 'income',
    amount: w.grossAmount,
    receivedAmount: w.receivedAmount,
    desc: `SchedulEX 依頼${kindLabel ? '（' + kindLabel + '）' : ''}`,
    date: h.salesDate,
    memo: paidBeforeSale
      ? `入金日 ${h.paidDate}（SchedulEXより・納品日より前${crossYearPrepay ? '・年をまたぐ前払い' : ''}）`
      : '',
    categoryId, categoryName,
    isWithholding: h.withholding,
    withholdingTax: w.withholdingTax,
    walletType,
    paymentMethod: 'cash',
    status,
    debit, credit,
    payment: 'cash',
    fiscalYear: parseInt(h.salesDate.slice(0, 4), 10),
    source: 'schedulex',
    sourceKey,
    createdAt: now,
    updatedAt: now,
  };
  if (h.paidDate && !paidBeforeSale) tx.settledAt = h.paidDate;
  return { docId: sourceKey, tx, withholdingEstimated: w.estimated, paidBeforeSale: !!paidBeforeSale, crossYearPrepay: !!crossYearPrepay };
}

// 取り込み確認画面に出す文（送られてきたもの・送られていないもの・今あるデータとの違い）
export function describeImport(h, existingTx) {
  const w = splitWithholding(h);
  const yen = n => '¥' + Number(n).toLocaleString('ja-JP');
  const lines = [
    `売上の日付（納品日）：${h.salesDate}`,
    `請求額：${yen(w.grossAmount)}`,
    h.withholding
      ? `源泉徴収：あり（${yen(w.withholdingTax)}${w.estimated ? '・10.21%で計算した目安' : '・請求額と入金額の差'}）／受取額 ${yen(w.receivedAmount)}`
      : '源泉徴収：なし',
    h.paidDate ? `入金日：${h.paidDate}` : '入金日：未入力 → 未入金（売掛）として入ります。入金されたら、ここで入金日を入れられます。',
    ...(h.paidDate && h.paidDate < h.salesDate
      ? [h.paidDate.slice(0, 4) !== h.salesDate.slice(0, 4)
          ? '入金日が納品日より前で、年をまたいでいます（年をまたぐ前払い）。入金済みとして納品日の売上で取り込み、入金日はメモに残します。'
          : '入金日が納品日より前です（前払い）。入金済みとして納品日の売上で取り込み、入金日はメモに残します。']
      : []),
    '依頼者名・案件名・メモは、SchedulEXから送られていません。',
  ];
  if (existingTx) {
    lines.unshift(`この依頼は ${String(existingTx.updatedAt || existingTx.createdAt || '').slice(0, 10)} に取り込み済みです。取り込むと上書きします。`);
    if (existingTx.amount !== w.grossAmount) lines.push(`金額が変わります：${yen(existingTx.amount)} → ${yen(w.grossAmount)}`);
    if ((existingTx.settledAt || null) !== (h.paidDate || null) && existingTx.status === 'settled' && !h.paidDate) {
      lines.push('RakuThroughで入金済みにした記録があります。上書きすると未入金に戻ります。');
    }
  }
  return lines;
}

// SchedulEX の「依頼だけCSVに書き出す」を読む。1行ずつ validateHandoff と同じ確かめ方をする
export function parseSchedulexCsv(text) {
  const rows = parseCsv(String(text || '').replace(/^﻿/, ''));
  if (rows.length < 2) return { rows: [], errors: [{ line: 1, error: 'empty' }] };
  const head = rows[0].map(s => s.trim());
  const col = name => head.indexOf(name);
  const need = ['形式', '案件ID', '種類', '金額', '源泉', '依頼日', '納品日', '入金日', '入金額'];
  if (need.some(n => col(n) < 0)) return { rows: [], errors: [{ line: 1, error: 'not_handoff' }] };
  const out = [], errors = [];
  rows.slice(1).forEach((r, i) => {
    if (r.length === 1 && r[0] === '') return; // 空行
    const get = n => (r[col(n)] ?? '').trim();
    const num = s => (s === '' ? null : /^\d+$/.test(s) ? parseInt(s, 10) : NaN);
    const fmt = get('形式').split('/');
    const res = validateHandoff({
      fmt: fmt[0], v: parseInt(fmt[1], 10), src: 'schedulex',
      id: get('案件ID'), kind: get('種類'),
      amount: num(get('金額')), currency: 'JPY',
      withholding: get('源泉') === 'あり',
      requestDate: get('依頼日') || null, salesDate: get('納品日'),
      paidDate: get('入金日') || null, paidAmount: num(get('入金額')),
    });
    if (res.error) errors.push({ line: i + 2, error: res.error });
    else out.push(res.value);
  });
  return { rows: out, errors };
}

// 引用符・改行入りのセルに対応した最小のCSV読み取り
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
