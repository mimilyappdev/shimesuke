# EasyReply スタンプ機能 組み込み指示書

ベース仕様は `STAMP_INTEGRATION.md` と同じ。  
このドキュメントは **EasyReply固有の差分と課金ロジック** のみ記載する。

---

## 仕様概要

| 機能 | 無料ユーザー | 有料ユーザー |
|------|------------|------------|
| デフォルトスタンプ（5種） | ✅ 使用可 | ✅ 使用可 |
| カスタムスタンプ追加（画像アップロード） | ❌ ロック | ✅ 最大10件まで |
| スタンプを画面に貼る・動かす・削除 | ✅ 使用可 | ✅ 使用可 |

---

## Step 1 ── CSS

`STAMP_INTEGRATION.md` の CSS をそのままコピー。追加で以下を加える。

```css
/* プレミアム誘導バナー */
.stamp-premium-banner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #FFF8E1, #FFF3E0);
  border: 1.5px solid #FFD54F;
  border-radius: 12px;
  text-align: center;
}
.stamp-premium-banner p {
  font-size: 11px;
  color: #7A6000;
  line-height: 1.6;
  margin: 0;
}
.stamp-premium-btn {
  font-size: 11px;
  font-weight: 700;
  padding: 6px 16px;
  border-radius: 20px;
  background: #FFB300;
  color: #fff;
  cursor: pointer;
  border: none;
  font-family: inherit;
  transition: background 0.15s;
}
.stamp-premium-btn:hover { background: #FFA000; }
```

---

## Step 2 ── HTML

`STAMP_INTEGRATION.md` の HTML をそのままコピー（変更なし）。

```html
<div id="sticker-layer"></div>
<input type="file" id="stamp-upload" accept="image/*" style="display:none" onchange="handleStampUpload(this)">
<div id="stamp-panel">
  <p class="stamp-panel-title">🎨 スタンプを選んで画面に貼ろう</p>
  <div class="stamp-options" id="stamp-options"></div>
  <p class="stamp-panel-hint">貼った後はドラッグで移動・タップで削除</p>
  <p class="stamp-panel-close" onclick="closeStampPanel()">閉じる</p>
</div>
```

---

## Step 3 ── JavaScript

### ① EasyReply 固有の定数（ここだけ変える）

```js
const STAMP_STORAGE_KEY        = 'easyreply_stickers';
const CUSTOM_STAMP_STORAGE_KEY = 'easyreply_custom_stamps';
const CUSTOM_STAMP_MAX         = 10;   // 有料ユーザーの上限
```

### ② プレミアム判定フック（EasyReply側で実装する）

```js
// EasyReply の認証・課金状態に合わせて実装してください。
// true を返す = 有料ユーザー、false = 無料ユーザー
function isStampPremium() {
  // 実装例：
  //   return currentUser?.plan === 'premium';
  //   return localStorage.getItem('easyreply_plan') === 'premium';
  return false; // ← デフォルトは無料扱い。実装後に置き換える
}

// 課金導線を開く処理（EasyReply側で実装する）
function openStampPremiumFlow() {
  // 実装例：
  //   showUpgradeModal();
  //   location.href = '/upgrade';
  alert('プレミアムプランでカスタムスタンプが使えます！');
}
```

### ③ デフォルトスタンプ（変更なし・5種固定）

```js
const DEFAULT_STAMPS = [
  { id: 'def_shimekiri', emoji: '⚡', label: 'しめきり！', bg: '#FF6B6B', color: '#fff' },
  { id: 'def_ganbaru',   emoji: '💪', label: '頑張るぞ！', bg: '#FFD93D', color: '#333' },
  { id: 'def_kanryo',    emoji: '✨', label: '完了！',     bg: '#6BCB77', color: '#fff' },
  { id: 'def_rough',     emoji: '✏️', label: 'ラフ中',     bg: '#4D96FF', color: '#fff' },
  { id: 'def_fix',       emoji: '🔄', label: '修正中',     bg: '#C77DFF', color: '#fff' },
];
```

> 絵文字・文言・色はEasyReplyのトーンに合わせて変更してOK。

---

### ④ 本体コード（`STAMP_INTEGRATION.md` からの差分のみ）

以下の関数を **差し替え** る（他はそのままコピー）。

#### `renderStampOptions()` を差し替え

無料ユーザーには ＋ボタンの代わりにプレミアム誘導バナーを表示する。

```js
function renderStampOptions() {
  const wrap = document.getElementById('stamp-options');
  if (!wrap) return;

  const defaultHtml = DEFAULT_STAMPS.map(s => `
    <div class="stamp-option" style="background:${s.bg};color:${s.color}" onclick="addSticker('${s.id}')">
      <span class="so-emoji">${s.emoji}</span>
      <span class="so-label">${s.label}</span>
    </div>`).join('');

  const customHtml = customStamps.map(s => `
    <div class="stamp-option stamp-option-img" onclick="addSticker('${s.id}')">
      <img src="${s.dataUrl}" alt="">
      <div class="so-del" onclick="event.stopPropagation();deleteCustomStamp('${s.id}')">✕</div>
    </div>`).join('');

  // 有料 & 上限未達 → 追加ボタン
  // 有料 & 上限到達 → ボタンなし（上限表示）
  // 無料           → プレミアム誘導バナー
  let addAreaHtml = '';
  if (isStampPremium()) {
    if (customStamps.length < CUSTOM_STAMP_MAX) {
      addAreaHtml = `<div class="stamp-option stamp-option-add" onclick="document.getElementById('stamp-upload').click()">＋</div>`;
    } else {
      addAreaHtml = `<p style="font-size:10px;color:#7A8090;text-align:center;width:100%;">カスタムスタンプは${CUSTOM_STAMP_MAX}件まで</p>`;
    }
  } else {
    addAreaHtml = `
      <div class="stamp-premium-banner" style="width:100%;">
        <p>🎨 自分の画像をスタンプにできる！<br>カスタムスタンプは<strong>プレミアム</strong>機能です</p>
        <button class="stamp-premium-btn" onclick="openStampPremiumFlow()">アップグレードする</button>
      </div>`;
  }

  wrap.innerHTML = defaultHtml + customHtml + addAreaHtml;
}
```

#### `handleStampUpload()` を差し替え

アップロード時にも念のため課金チェックを行う（UI回避対策）。

```js
function handleStampUpload(input) {
  const file = input.files[0];
  if (!file) return;

  if (!isStampPremium()) {
    openStampPremiumFlow();
    input.value = '';
    return;
  }
  if (customStamps.length >= CUSTOM_STAMP_MAX) {
    alert(`カスタムスタンプは${CUSTOM_STAMP_MAX}件までです`);
    input.value = '';
    return;
  }

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
```

---

## 初期化（変更なし）

```js
loadStickerData();
loadCustomStamps();
renderStickerLayer();
```

---

## 実装チェックリスト

- [ ] `isStampPremium()` を EasyReply の認証状態に接続した
- [ ] `openStampPremiumFlow()` を課金フローに接続した
- [ ] `STAMP_STORAGE_KEY` が他アプリと重複していないか確認した
- [ ] スタンプパネルを開くボタンを配置した（`onclick="toggleStampPanel()"`）
- [ ] 動作確認：無料ユーザーでバナーが出る、有料ユーザーで追加できる
