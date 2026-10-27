# 共有物分割複丈費清冊

法院判決（和解、調解、調處）共有物分割，部分共有人申辦分割複丈時，計算各共有人應繳土地複丈費，並列印清冊 **1 式 2 份**（第一聯附卷、第二聯移送登記課）。

- **單檔分享版**：[`dist/共有物分割複丈費清冊.html`](dist/) — 一個檔案就能用，可用 Email、LINE、隨身碟傳給同事，雙擊即開（免網路、免安裝）。每個 [Release](../../releases) 也會附上該版本的檔案。
- **網頁版**：GitHub Pages `https://gn01918004-hub.github.io/courtPartition-/`
- **Excel 原始檔**：`excel/共有物分割複丈費計算表_v2.1_原始檔.xlsm`
- **v2.1 審查報告**：[`docs/REVIEW.md`](docs/REVIEW.md)
- **改良版巨集**（仍要用 Excel 時）：`excel/改良巨集_工作表1.bas`

## 使用方式

1. 填寫案號、基本費、施測費（全案原價金額）。
   - 「依法院確定判決…申請」且**未**勾選「需實地測量或確定界址點」→ 依收費標準第 6 條半數計收。
   - 需實地測量或確定界址點 → 勾選後原價計收；界址點填點數，每點 200 元由申請人負擔。
2. 輸入「分割後筆數」→ 按「產生表格」，每筆填地號與所有權人、持分。
   - 多筆共有人相同時，按「沿用上一筆名單」。
   - 公同共有（判決書多人共同分配一筆）請寫在同一列、持分 1/1。
3. 在「各共有人應繳彙總」指定申請人（一位）、填已繳金額。捨去後的差額一律由申請人負擔。
4. 「檢核」全部通過後，按「列印清冊（1式2份）」。

資料自動存在本機瀏覽器（不會上傳），可「匯出 JSON」備份或交給同事「匯入」。

## 版本與更新

- 畫面左上角版本號可點開**更新時間軸**；新版本第一次開啟時會自動顯示更新重點。
- 網頁每 30 分鐘檢查一次是否有新版，有新版會出現「立即更新」提示。
- 每次推送到預設分支，GitHub Actions 會自動：執行測試 → 部署 GitHub Pages → 版本號有變更時建立 [Release](../../releases)。

### 新版推播

| 方式 | 說明 | 設定 |
|------|------|------|
| 桌面通知 | 網頁或單檔版按「🔔 開啟更新通知」，之後有新版本會跳出系統通知（每版一次） | 每台電腦按一次允許即可；需有網頁開著 |
| LINE 推播 | 每次發布新版本，自動由 LINE 官方帳號群發給所有好友 | 見下方，設定一次即可 |
| GitHub | 在 repo 右上角 **Watch → Custom → Releases**，新版發布會寄 Email | 每人自行訂閱 |

**LINE 推播設定（一次）**
1. 到 [LINE Developers](https://developers.line.biz/console/) 建立 Provider → 建立 **Messaging API** channel（會同時建立一個 LINE 官方帳號）。
2. 在 channel 的「Messaging API」分頁最下方，發行 **Channel access token (long-lived)** 並複製。
3. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**，名稱 `LINE_CHANNEL_ACCESS_TOKEN`，貼上 token。
4. 請同事掃描官方帳號 QR code 加好友。之後每次新版本發布就會自動群發（官方帳號免費方案每月有訊息則數上限）。

### 發布新版步驟

1. 在 `assets/changelog.js` 最上方新增一筆（版本、日期、更新重點）。
2. 同步修改 `package.json` 的 `version`。
3. `npm run build`（重新產生單檔版與 `version.json`），`npm test` 通過後推送。

> 單檔版會連線檢查 GitHub Pages 上的 `version.json`，有新版時提示下載；離線時自動略過。

## 計算規則

見網頁「計算依據」區塊與 `assets/calc.js` 開頭註解。金額以整數運算，避免浮點誤差。
