# QuickClass Scoreboard MVP

以 Vite、React 與 TypeScript 製作的課堂單選搶答 MVP。第一版不連接 Firebase 或任何後端，適合在單一瀏覽器中用多個分頁示範學生作答、講師控題與即時排行榜。

## 功能與路由

- `#/join`：學生輸入暱稱並選擇隊伍
- `#/play`：作答目前開放的單選題、查看得分與答案揭曉
- `#/host`：講師開關題目、切換題目、查看作答統計及重設 demo
- `#/scoreboard`：適合教室投影的個人與隊伍排行榜

專案採用 **hash router**，所以 URL 的頁面部分位於 `#` 之後。例如本機是 `http://localhost:5173/qc_scroeboard/#/host`，GitHub Pages 是 `https://<帳號>.github.io/qc_scroeboard/#/host`。這能讓 GitHub Pages 直接重新整理任何頁面時仍由同一份 `index.html` 處理，不需要額外的 `404.html` fallback。

## 本機啟動

需要 Node.js 20.19+ 或 22.12+（Vite 8 的版本需求）。

```bash
npm install
npm run dev
```

Vite 設定的 production base 是 `/qc_scroeboard/`。開發伺服器會顯示實際本機 URL；通常可直接開啟 `http://localhost:5173/qc_scroeboard/#/join`。

建議 demo 流程：

1. 開啟 `#/host` 作為講師控制台。
2. 另開一個分頁到 `#/join`，輸入學生資料後進入 `#/play`。
3. 如需模擬另一位學生，開啟新的瀏覽器分頁（不要複製已完成加入的分頁 session），再從 `#/join` 加入。
4. 再開 `#/scoreboard`，從講師台開放題目、在學生分頁作答，觀察各頁同步更新。

## 檢查與 production build

```bash
npm run typecheck
npm run lint
npm run build
npm run preview
```

`npm run build` 會先執行 TypeScript 型別檢查，再輸出靜態檔案至 `dist/`。預覽網址同樣會包含 `/qc_scroeboard/` 子路徑。

## 部署到 GitHub Pages

`vite.config.ts` 已將 `base` 設為 repository 對應的 `/qc_scroeboard/`，repository 也已包含 `.github/workflows/deploy-pages.yml`。啟用方式：

1. 在 repository 的 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。
2. 將此變更合併至 `main`，或在 Actions 頁面手動執行 **Deploy to GitHub Pages** workflow。
3. Workflow 會執行 `npm ci`、`npm run build`，上傳 `dist` 並發佈至 Pages。

也可使用既有的靜態站台部署流程，只要將 `dist/` 的內容發佈到 GitHub Pages 即可。部署後入口為 `https://wslu42.github.io/qc_scroeboard/#/join`（實際是否可公開存取取決於 repository Pages 設定與權限）。

## Local/mock 同步方式與限制

共享遊戲狀態保存在 `localStorage`，每次更新同時透過 `BroadcastChannel` 通知其他分頁，並以瀏覽器的 `storage` event 作為相容機制。每個學生的身分 ID 則保存在該分頁的 `sessionStorage`，方便同一瀏覽器用多分頁模擬多位學生。

此機制的限制：

- 只會在**同一個 origin、同一個瀏覽器 profile** 的分頁間同步；不同裝置、瀏覽器或無痕/一般視窗不會共享。
- 沒有伺服器、登入、權限控管或防作弊；任何人都可開啟講師台，也可從開發者工具修改本機資料。
- 接近同一瞬間的多分頁寫入沒有後端交易保證，極端情況可能發生最後寫入者覆蓋前一筆狀態。
- 清除網站資料會移除玩家、作答與分數。預設會提供四位 mock 玩家，講師台可重設 demo。
- Google Fonts 無法連線時會自動使用系統字型，不影響功能。

本專案沒有 Firebase SDK、API key 或其他秘密資訊。
