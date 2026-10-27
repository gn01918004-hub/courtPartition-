// 產生單一 HTML 檔（CSS／JS 全部內嵌），可直接用 Email、LINE、隨身碟分享，雙擊即可使用
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

export const OUT = 'dist/共有物分割複丈費清冊.html';

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
  console.log('已產生', OUT);
}
