# 〆スケ スタンプ機能 組み込みガイド

他のシリーズのHTMLアプリにスタンプ機能を追加する手順です。

---

## 完成イメージ

- 画面上にスタンプを自由に貼れる
- ドラッグで移動、タップ→×で削除
- デフォルトスタンプ5種 ＋ 自分の画像を追加できる（カスタムスタンプ）
- データは `localStorage` に保存（ページを閉じても残る）

---

## Step 1 ── CSS をコピー

`</style>` の直前に以下を追加してください。

```css
/* ── スタンプ・ステッカー ── */
#sticker-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 500;
}
.placed-sticker {
  position: absolute;
  pointer-events: auto;
  cursor: grab;
  user-select: none;
  touch-action: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: clamp(60px, 10vw, 88px);
  transform-origin: center;
  will-change: transform;
  -webkit-tap-highlight-color: transparent;
}
@keyframes stickerPop {
  0%   { transform: scale(0.2) rotate(var(--s-rot)); opacity:0.6; }
  60%  { transform: scale(1.18) rotate(var(--s-rot)); }
  80%  { transform: scale(0.94) rotate(var(--s-rot)); }
  100% { transform: scale(1) rotate(var(--s-rot)); opacity:1; }
}
.placed-sticker.pop { animation: stickerPop 0.28s cubic-bezier(.34,1.56,.64,1) forwards; }
.placed-sticker:active { cursor: grabbing; }
.placed-sticker .s-body {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 2px 3px 8px rgba(0,0,0,0.18);
  border: 2.5px solid rgba(255,255,255,0.6);
  gap: 2px;
  position: relative;
}
.placed-sticker .s-emoji { font-size: clamp(18px, 3.5vw, 28px); line-height: 1; }
.placed-sticker .s-label { font-size: clamp(7px, 1.2vw, 10px); font-weight: 900; letter-spacing: 0.04em; text-align: center; line-height: 1.2; padding: 0 4px; }
.placed-sticker .s-del {
  position: absolute; top: -6px; right: -6px;
  width: 18px; height: 18px; border-radius: 50%;
  background: #333; color: #fff; font-size: 10px;
  display: none; align-items: center; justify-content: center;
  cursor: pointer; border: 1.5px solid #fff; z-index: 2; flex-shrink: 0;
}
.placed-sticker.selected .s-del { display: flex; }

/* スタンプパネル */
#stamp-panel {
  position: fixed;
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: #fff;
  border: 1.5px solid #DDD8D0;
  border-radius: 20px;
  padding: 12px 16px;
  display: none;
  flex-direction: column;
  gap: 10px;
  z-index: 600;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
  min-width: 280px;
}
#stamp-panel.open { display: flex; }
.stamp-panel-title { font-size: 11px; font-weight: 700; color: #7A8090; text-align: center; }
.stamp-options { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.stamp-option {
  width: 56px; height: 56px; border-radius: 50%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  cursor: pointer; border: 2px solid rgba(255,255,255,0.5);
  box-shadow: 1px 2px 6px rgba(0,0,0,0.15);
  gap: 1px; transition: transform 0.1s; flex-shrink: 0;
}
.stamp-option:hover { transform: scale(1.12); }
.stamp-option .so-emoji { font-size: 20px; line-height: 1; }
.stamp-option .so-label { font-size: 7px; font-weight: 900; color: inherit; text-align: center; line-height: 1.1; }
.stamp-option-img { position: relative; overflow: visible; background: #eee !important; padding: 0; }
.stamp-option-img img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; }
.stamp-option-img .so-del {
  position: absolute; top: -5px; right: -5px;
  width: 16px; height: 16px; border-radius: 50%;
  background: #333; color: #fff; font-size: 9px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; border: 1.5px solid #fff; z-index: 2;
}
.stamp-option-add {
  background: #F5F1EB !important; border: 2px dashed #DDD8D0 !important;
  color: #7A8090 !important; font-size: 22px; font-weight: 300;
  display: flex; align-items: center; justify-content: center;
}
.stamp-panel-hint { font-size: 10px; color: #7A8090; text-align: center; }
.stamp-panel-close { font-size: 10px; color: #7A8090; text-align: center; cursor: pointer; text-decoration: underline; }
```

---

## Step 2 ── HTML をコピー

`</body>` の直前に以下を追加してください。

```html
<!-- ステッカーが貼られるレイヤー -->
<div id="sticker-layer"></div>

<!-- カスタムスタンプ画像アップロード用（非表示） -->
<input type="file" id="stamp-upload" accept="image/*" style="display:none" onchange="handleStampUpload(this)">

<!-- スタンプ選択パネル -->
<div id="stamp-panel">
  <p class="stamp-panel-title">🎨 スタンプを選んで画面に貼ろう</p>
  <div class="stamp-options" id="stamp-options"></div>
  <p class="stamp-panel-hint">貼った後はドラッグで移動・タップで削除</p>
  <p class="stamp-panel-close" onclick="closeStampPanel()">閉じる</p>
</div>
```

### スタンプを開くボタン

スタンプを開きたい場所に以下のボタンを置いてください（デザインは自由に変えてOK）。

```html
<button onclick="toggleStampPanel()">🎨 スタンプ</button>
```

---

## Step 3 ── JavaScript をコピー

`</script>` の直前（または `</body>` 直前の `<script>` タグ内）に追加してください。

### ① アプリ名を変える（必須）

`MY_APP_KEY` の部分を **このアプリ専用のキー名** に変えてください。  
〆スケと同じキー名にすると、データが混ざります。

```js
// ▼▼▼ ここだけ変える ▼▼▼
const STAMP_STORAGE_KEY        = 'MY_APP_KEY_stickers';
const CUSTOM_STAMP_STORAGE_KEY = 'MY_APP_KEY_custom_stamps';
// ▲▲▲ ここだけ変える ▲▲▲
```

**例：**
| アプリ名       | STAMP_STORAGE_KEY              |
|--------------|-------------------------------|
| 〆スケ         | `shimesuke_stickers`          |
| EasyReply    | `easyreply_stickers`          |
| 収支メモ       | `kakeibo_stickers`            |

---

### ② デフォルトスタンプを変える（任意）

各アプリのテーマに合わせてカスタマイズできます。

```js
const DEFAULT_STAMPS = [
  { id: 'def_1', emoji: '⚡', label: 'しめきり！', bg: '#FF6B6B', color: '#fff' },
  { id: 'def_2', emoji: '💪', label: '頑張るぞ！', bg: '#FFD93D', color: '#333' },
  { id: 'def_3', emoji: '✨', label: '完了！',     bg: '#6BCB77', color: '#fff' },
  { id: 'def_4', emoji: '✏️', label: 'ラフ中',     bg: '#4D96FF', color: '#fff' },
  { id: 'def_5', emoji: '🔄', label: '修正中',     bg: '#C77DFF', color: '#fff' },
];
```

フィールド説明：

| フィールド | 内容               | 例         |
|---------|--------------------|------------|
| `id`    | ユニークなID（変えないこと） | `'def_1'` |
| `emoji` | 絵文字              | `'⚡'`    |
| `label` | スタンプ下の文字（短く）   | `'完了！'` |
| `bg`    | 背景色              | `'#FF6B6B'` |
| `color` | 文字色              | `'#fff'`   |

---

### ③ 本体コード（そのままコピー）

```js
/* ═══════════════════════════════
   STICKER SYSTEM
═══════════════════════════════ */
let placedStickers = [];
let customStamps   = [];
let selectedStickerId = null;

function _stickerUid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,6);
}

function loadStickerData() {
  try { placedStickers = JSON.parse(localStorage.getItem(STAMP_STORAGE_KEY) || '[]'); }
  catch { placedStickers = []; }
}
function saveStickerData() {
  try { localStorage.setItem(STAMP_STORAGE_KEY, JSON.stringify(placedStickers)); }
  catch {}
}
function loadCustomStamps() {
  try { customStamps = JSON.parse(localStorage.getItem(CUSTOM_STAMP_STORAGE_KEY) || '[]'); }
  catch { customStamps = []; }
}
function saveCustomStamps() {
  try { localStorage.setItem(CUSTOM_STAMP_STORAGE_KEY, JSON.stringify(customStamps)); }
  catch {}
}

function findStamp(stampId) {
  return DEFAULT_STAMPS.find(d => d.id === stampId) || customStamps.find(d => d.id === stampId);
}

function renderStickerLayer() {
  const layer = document.getElementById('sticker-layer');
  if (!layer) return;
  layer.innerHTML = '';
  placedStickers.forEach(s => {
    const stamp = findStamp(s.stampId);
    if (!stamp) return;
    const el = document.createElement('div');
    el.className = 'placed-sticker' + (selectedStickerId === s.id ? ' selected' : '');
    el.dataset.id = s.id;
    el.style.left = s.x + '%';
    el.style.top  = s.y + '%';
    el.style.setProperty('--s-rot', s.rot + 'deg');
    el.style.transform = `rotate(${s.rot}deg)`;
    const bodyStyle = stamp.dataUrl ? '' : `background:${stamp.bg};color:${stamp.color}`;
    const inner = stamp.dataUrl
      ? `<img src="${stamp.dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : `<span class="s-emoji">${stamp.emoji}</span><span class="s-label">${stamp.label}</span>`;
    el.innerHTML = `<div class="s-body" style="${bodyStyle}">${inner}<div class="s-del" data-del="${s.id}">✕</div></div>`;
    el.querySelector('.s-del').addEventListener('pointerdown', e => { e.stopPropagation(); deleteSticker(s.id); });
    setupStickerDrag(el, s.id);
    layer.appendChild(el);
  });
}

function setupStickerDrag(el, id) {
  let startX, startY, moved;
  el.addEventListener('pointerdown', e => {
    if (e.target.dataset.del) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    startX = e.clientX; startY = e.clientY; moved = false;
    const onMove = e2 => {
      const dx = e2.clientX - startX, dy = e2.clientY - startY;
      if (!moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) moved = true;
      if (!moved) return;
      const s = placedStickers.find(p => p.id === id);
      if (s) el.style.transform = `translate(${dx}px,${dy}px) rotate(${s.rot}deg)`;
    };
    const onUp = e2 => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      if (moved) {
        const dx = e2.clientX - startX, dy = e2.clientY - startY;
        const s = placedStickers.find(p => p.id === id);
        if (s) {
          s.x = Math.max(0, Math.min(92, s.x + dx / window.innerWidth  * 100));
          s.y = Math.max(0, Math.min(90, s.y + dy / window.innerHeight * 100));
          el.style.left = s.x + '%'; el.style.top = s.y + '%';
          el.style.transform = `rotate(${s.rot}deg)`;
          saveStickerData();
        }
      } else {
        const wasSelected = el.classList.contains('selected');
        document.querySelectorAll('.placed-sticker.selected').forEach(e => e.classList.remove('selected'));
        selectedStickerId = null;
        if (!wasSelected) { el.classList.add('selected'); selectedStickerId = id; }
      }
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  });
}

function addSticker(stampId) {
  const s = { id: _stickerUid(), stampId, x: 15 + Math.random() * 60, y: 10 + Math.random() * 55, rot: Math.round((Math.random() - 0.5) * 30) };
  placedStickers.push(s);
  saveStickerData();
  renderStickerLayer();
  const el = document.querySelector(`.placed-sticker[data-id="${s.id}"]`);
  if (el) { el.classList.add('pop'); el.addEventListener('animationend', () => el.classList.remove('pop'), { once: true }); }
  closeStampPanel();
}

function deleteSticker(id) {
  placedStickers = placedStickers.filter(s => s.id !== id);
  selectedStickerId = null;
  saveStickerData();
  renderStickerLayer();
}

function deleteCustomStamp(id) {
  customStamps = customStamps.filter(s => s.id !== id);
  saveCustomStamps();
  renderStampOptions();
}

function renderStampOptions() {
  const wrap = document.getElementById('stamp-options');
  if (!wrap) return;
  const defaultHtml = DEFAULT_STAMPS.map(s => `
    <div class="stamp-option" style="background:${s.bg};color:${s.color}" onclick="addSticker('${s.id}')">
      <span class="so-emoji">${s.emoji}</span><span class="so-label">${s.label}</span>
    </div>`).join('');
  const customHtml = customStamps.map(s => `
    <div class="stamp-option stamp-option-img" onclick="addSticker('${s.id}')">
      <img src="${s.dataUrl}" alt="">
      <div class="so-del" onclick="event.stopPropagation();deleteCustomStamp('${s.id}')">✕</div>
    </div>`).join('');
  const uploadBtn = `<div class="stamp-option stamp-option-add" onclick="document.getElementById('stamp-upload').click()">＋</div>`;
  wrap.innerHTML = defaultHtml + customHtml + uploadBtn;
}

function handleStampUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const size = 120, canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      const min = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
      customStamps.push({ id: 'cus_' + _stickerUid(), dataUrl: canvas.toDataURL('image/jpeg', 0.8) });
      saveCustomStamps();
      renderStampOptions();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function toggleStampPanel() {
  const panel = document.getElementById('stamp-panel');
  if (!panel) return;
  panel.classList.contains('open') ? closeStampPanel() : (renderStampOptions(), panel.classList.add('open'));
}

function closeStampPanel() {
  const panel = document.getElementById('stamp-panel');
  if (panel) panel.classList.remove('open');
}

document.addEventListener('pointerdown', e => {
  if (!e.target.closest('.placed-sticker') && !e.target.closest('#stamp-panel') && !e.target.closest('[onclick="toggleStampPanel()"]')) {
    if (selectedStickerId) {
      document.querySelectorAll('.placed-sticker.selected').forEach(el => el.classList.remove('selected'));
      selectedStickerId = null;
    }
  }
});

// 初期化（ページ読み込み時に呼ぶ）
loadStickerData();
loadCustomStamps();
renderStickerLayer();
```

---

## まとめ：変えるのはここだけ

| 変更箇所 | 内容 | 必須？ |
|--------|------|------|
| `STAMP_STORAGE_KEY` | アプリ固有のキー名 | **必須** |
| `CUSTOM_STAMP_STORAGE_KEY` | アプリ固有のキー名 | **必須** |
| `DEFAULT_STAMPS` の中身 | アプリに合ったスタンプ絵文字・色 | 任意 |
| ボタンのデザイン | `onclick="toggleStampPanel()"` だけ残せばOK | 任意 |

---

## 注意事項

- `#sticker-layer` の `z-index` は `500` に設定しています。モーダルなど他の要素と重なる場合は調整してください。
- `#stamp-panel` の `bottom: 60px` はモバイルのボトムナビがある場合の値です。ナビがない場合は `bottom: 20px` に変更してください。
- カスタムスタンプ画像は `localStorage` に base64 で保存されるため、大量に追加するとストレージを圧迫します。
