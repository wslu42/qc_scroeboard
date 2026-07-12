# QC scoreboard

以 Vite、React、TypeScript 與 Firebase 製作的跨裝置課堂單選搶答系統。學生使用匿名身分加入，講師使用 Google 登入建立及控制自己的課堂；題目、作答與排行榜透過 Cloud Firestore 即時同步。

## 功能與路由

- `#/join`：學生輸入 6 碼課堂代碼與暱稱
- `#/play`：回答目前開放的單選題，關題後查看答案與得分
- `#/host`：Google 講師登入、建立課堂、開關及切換題目、查看統計
- `#/scoreboard`：適合教室投影的個人即時排行榜

專案採 hash router。Firebase Hosting URL 例如 `https://qc-scoreboard-69c7b.web.app/#/host`；投影連結會帶入 `#/scoreboard?session=ABC234`，學生加入連結則是 `#/join?session=ABC234`。

## Firebase 架構

- Firebase Authentication
  - 講師：Google provider
  - 學生／未登入投影裝置：Anonymous provider
- Cloud Firestore
  - `sessions/{code}`：講師、目前題目、開關狀態及已公布答案
  - `sessions/{code}/questions`：學生可讀的題目及選項
  - `sessions/{code}/answerKeys`：只有該課堂講師可讀的答案
  - `sessions/{code}/players`：暱稱及個人分數（`team` 欄位暫留作向後相容）
  - `sessions/{code}/answers`：學生的一次性作答
- Firebase Hosting：部署 `dist/`，所有非靜態路徑 rewrite 至 `index.html`

`firestore.rules` 強制學生只能建立自己的 player 與 answer，不能修改分數、題目、答案或課堂狀態。講師只能控制 `hostUid` 等於自己 Firebase UID 的課堂。關題時由講師端批次標記作答並更新正確學生的分數；同一作答不會重複計分。

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

部署後請至少以一台講師裝置與兩台學生裝置驗證：Google 登入、建立課堂、加入、開題、單次作答、關題結算、切題及排行榜。

## 第一版限制

- 同一課堂單題結算上限為 200 位學生，避免超過 Firestore 單次 batch write 限制。
- 清除瀏覽器網站資料後，匿名學生會取得新的 UID，無法找回舊身分或分數。
- Google 講師登入狀態與匿名學生身分都以 browser origin 為界；切換網域會建立不同登入狀態。
- 目前題目為建立課堂時寫入的四題 seed，尚未提供題庫編輯器。
- 第一版僅顯示個人積分；隊伍選擇與隊伍排行榜暫時隱藏。
- 尚未啟用 App Check；正式公開並完成多裝置驗證後建議加入。
- 沒有 Cloud Functions；計分由已通過 Security Rules 授權的講師裝置在關題時執行，因此講師必須保持連線直到結算完成。
