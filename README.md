# QC scoreboard

以 Vite、React、TypeScript 與 Firebase 製作的跨裝置課堂多選作答系統。題目與選項顯示在原始投影片，學生手機顯示 A–H 八個 checkbox；題目、作答與全域個人排行榜透過 Cloud Firestore 即時同步。

## 功能與路由

- `#/join`：掃描 QR code 或輸入 `0S1Q01` 格式的題目代碼；首次輸入暱稱
- `#/play`：勾選 A–H 多個答案並明確送出，關題後查看正確組合
- `#/host`：Google 講師登入、設定題目代碼與正確組合、產生 QR code、開關及結算題目；下方的講師專用紀錄可查看該講師帳號擁有的所有計分輪次、學生、題目答案與作答紀錄
- `#/scoreboard`：跨所有 Session 共用的 active 個人總積分排行榜

專案採 hash router。講師控制台位於 `https://qc-scoreboard-69c7b.web.app/#/host`；題目 QR code 連結形式為 `#/join?code=0S1Q01`。格式固定為 `0S#Q##`：Session 是一位數、Question 是兩位數。

## Firebase 架構

- Firebase Authentication
  - 講師：Google provider
  - 學生／未登入投影裝置：Anonymous provider
- Cloud Firestore
  - `config/scoreboard`：目前啟用的全域計分板 round
  - `scoreboardRounds/{roundId}`：計分板版本與講師
  - `scoreboardRounds/{roundId}/players`：跨 Session 累積的暱稱及個人總分
  - `scoreboardRounds/{roundId}/multiplierUses`：每位學生、每個 Session 的限定倍率 token
  - `questions/{code}`：題目代碼、Session／Question 編號、開關狀態及公布答案
  - `questions/{code}/private/answerKey`：只有題目講師可讀的正確組合
  - `questions/{code}/answers`：學生在該 round 的一次性多選作答
- Firebase Hosting：部署 `dist/`，所有非靜態路徑 rewrite 至 `index.html`

`firestore.rules` 強制學生只能建立自己的 player、answer 與一次性倍率 token，不能修改分數、題目、答案或開關狀態。同一 round、同一題、同一 UID 只能送出及計分一次。

### 計分

信心倍率功能目前暫時關閉。新作答固定採標準計分：完全答對 +1,000 分，答錯 0 分。Firestore 仍保留既有倍率答案與 token 資料，以便日後重新啟用並正確顯示歷史紀錄；Security Rules 目前只允許新的標準 ×1 作答，不能從舊版前端建立倍率 token。

同分時以「所有答對題目的累計作答時間」較短者優先。開題與送出時間均使用 Firestore 伺服器時間，結算後只儲存毫秒數作為隱性排序資訊；學生畫面不顯示計時器或精確耗時。答錯題不累加時間。更新前建立且沒有 `openedAt` 的題目不會納入計時，講師需關閉後重新開放該題，才會建立公平的起算時間。

Firebase Web config 位於 `src/firebase.ts`，它是瀏覽器端公開識別資訊，不是管理員密鑰。專案內不得加入 service-account JSON、private key 或其他後端憑證。

## Firebase Console 必要設定

Firebase project：`qc-scoreboard-69c7b`

1. Firestore `(default)`：Standard、Native mode、`us-east4`。
2. Authentication → Sign-in method：啟用 Google 與 Anonymous。
3. Authentication → Settings → Authorized domains：Firebase Hosting 預設網域會自動加入；如果也從 GitHub Pages 測試 Google 登入，需加入 `wslu42.github.io`。
4. 部署前使用本 repository 的 `firestore.rules`，不要保留允許任意讀寫的測試規則。

## 本機啟動

需要 Node.js 20.19+ 或 22.12+。

```bash
npm install
npm run dev
```

本機通常為 `http://localhost:5173/#/join`。`localhost` 預設是 Firebase Auth 的授權網域。

由於 Firebase Auth 的 browser-local 登入狀態會在同一 origin 的分頁間同步，不適合在同一個瀏覽器 profile 用多分頁同時模擬講師與不同學生。請使用不同瀏覽器 profile、無痕視窗，或真實的不同裝置測試各種角色。

## 檢查與 build

```bash
npm run typecheck
npm run lint
npm run build
npm run preview
```

`npm run build` 會產生適用 Firebase Hosting 根路徑的 `dist/`。如需保留 GitHub Pages 版本，使用：

```bash
npm run build:pages
```

該指令會將 Vite base 設為 `/qc_scroeboard/`；現有 GitHub Pages workflow 已使用此指令。

## 部署 Firebase

先安裝或更新官方 Firebase CLI，然後登入：

```bash
npm install -g firebase-tools
firebase login
firebase use qc-scoreboard-69c7b
```

先部署規則並確認沒有錯誤：

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

再建置及部署 Hosting：

```bash
npm run build
firebase deploy --only hosting
```

也可以一次執行：

```bash
npm run deploy:firebase
```

部署後請至少以一台講師裝置與兩台學生裝置驗證：Google 登入、設定 `0S1Q01`、QR 加入、A–H 多選、單次送出、關題結算與全域排行榜。

## 第一版限制

- 單題單次結算上限為 200 位學生，避免超過 Firestore 單次 batch write 限制。
- 清除瀏覽器網站資料後，匿名學生會取得新的 UID，無法找回舊身分或分數。
- Google 講師登入狀態與匿名學生身分都以 browser origin 為界；切換網域會建立不同登入狀態。
- 題目與選項文字只存在投影片；手機固定顯示 A–H，講師端只保存正確選項組合。
- 第一版僅顯示個人積分；隊伍選擇與隊伍排行榜暫時隱藏。
- 尚未啟用 App Check；正式公開並完成多裝置驗證後建議加入。
- 所有 Session 預設共用 active scoreboard round；講師可手動開始新一輪，舊 round 不會刪除。
- 沒有 Cloud Functions；計分由已通過 Security Rules 授權的講師裝置在關題時執行，因此講師必須保持連線直到結算完成。
