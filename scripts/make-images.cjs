// 產生 assets/icon-180.png（主畫面圖示／通知圖示）與 assets/og.png（分享連結縮圖）
// 用法：node scripts/make-images.cjs（需 Playwright）
const { chromium } = require('playwright');
const path = require('path');

const logo = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#38e1ff"/><stop offset=".55" stop-color="#8b7bff"/><stop offset="1" stop-color="#ff5fa2"/>
  </linearGradient></defs>
  <rect width="64" height="64" rx="16" fill="url(#g)"/>
  <path d="M14 16h36v32H14zM14 32h36M32 16v32M23 16v16M41 32v16" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>
</svg>`;

const og = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;width:1200px;height:630px;font-family:"Noto Sans CJK TC","Noto Sans TC",sans-serif;color:#e6ecf8;
    background:radial-gradient(700px 400px at 10% 0%,rgba(56,225,255,.25),transparent 60%),
    radial-gradient(700px 400px at 100% 10%,rgba(139,123,255,.3),transparent 60%),
    radial-gradient(600px 400px at 60% 120%,rgba(255,95,162,.18),transparent 60%),#070a12;
    display:flex;flex-direction:column;justify-content:center;padding:0 90px;box-sizing:border-box;position:relative;overflow:hidden}
  body::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(120,150,210,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(120,150,210,.12) 1px,transparent 1px);background-size:48px 48px}
  .row{display:flex;align-items:center;gap:36px;position:relative}
  h1{font-size:76px;margin:0;letter-spacing:.06em}
  p{font-size:32px;color:#8a97b2;margin:28px 0 0;position:relative}
  .chips{display:flex;gap:16px;margin-top:44px;position:relative}
  .chip{font-size:26px;padding:10px 22px;border-radius:999px;border:2px solid rgba(56,225,255,.5);color:#38e1ff;background:rgba(56,225,255,.08)}
</style>
<div class="row">${logo(150)}<h1>共有物分割<br>複丈費清冊</h1></div>
<p>法院判決／和解／調解／調處 · 各共有人應繳規費自動計算</p>
<div class="chips"><span class="chip">依持分自動分算</span><span class="chip">第 6 條減半判斷</span><span class="chip">一鍵列印 1 式 2 份</span></div>`;

(async () => {
  const out = (f) => path.join(__dirname, '..', 'assets', f);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 180, height: 180 } });
  await p.setContent(`<body style="margin:0;background:#070a12">${logo(180).replace('rx="16"', 'rx="0"')}</body>`);
  await p.screenshot({ path: out('icon-180.png') });
  await p.setViewportSize({ width: 1200, height: 630 });
  await p.setContent(og);
  await p.screenshot({ path: out('og.png') });
  await b.close();
  console.log('已產生 assets/icon-180.png、assets/og.png');
})();
