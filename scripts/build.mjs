// 產生單一 HTML 檔（CSS／JS 全部內嵌），可直接用 Email、LINE、隨身碟分享，雙擊即可使用
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

export const OUT = 'dist/共有物分割複丈費清冊.html';

// version.json 由 changelog 產生（網頁、單檔版、通知都讀它）
export function versionJson() {
  const ctx = { window: {} };
  vm.runInNewContext(read('assets/changelog.js'), ctx);
  const { version, date, title, highlights } = ctx.window.CHANGELOG[0];
  const download = `https://github.com/gn01918004-hub/courtPartition-/releases/download/v${version}/courtPartition_v${version}.html`;
  return JSON.stringify({ version, date, title, items: [...highlights], download }, null, 2) + '\n';
}

export function build() {
  let html = read('index.html');
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => `<style>\n${read(href)}\n</style>`);
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
    `<script>\n${read(src).replace(/<\/script/gi, '<\\/script')}\n</script>`);
  // 單檔版標記：用線上 version.json 檢查新版
  html = html.replace('<script>', '<script>window.STANDALONE = true;</script>\n<script>');
  return html;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, OUT), build());
  writeFileSync(join(root, 'version.json'), versionJson());
  console.log('已產生', OUT, '與 version.json');
}
