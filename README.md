# オフィスハブ（React + Vite）

3つの社内アプリを1つに統合した実行可能な Vite プロジェクトです。

- **おごりペア** (`src/components/OgoriPair.jsx`) — タブ間 BroadcastChannel を使ったランチマッチングPoC
- **座席・温度** (`src/components/SeatAndTemperature.jsx`) — 座席の空き状況と室温の記録（ブラウザの localStorage に保存）
- **在庫確認** (`src/components/Camera.jsx`) — Raspberry Pi 実機のカメラを `/api/camera/capture` 経由で呼び出し撮影

`src/App.jsx` が3つをタブで切り替えるシェルです。

## 動かし方

```bash
npm install
npm run dev
```

表示された URL（通常 http://localhost:5173）をブラウザで開いてください。

- 「おごりペア」と「座席・温度」はこのプロジェクトだけで完結して動きます。
- 「在庫確認」はバックエンド（Raspberry Pi、`vite.config.js` の `pz03.local:3000` にプロキシ設定済み）が無い環境では「撮影に失敗しました」と表示されます。実機のRaspberry Piに接続した環境で動作確認してください。

## ビルド

```bash
npm run build
npm run preview
```

## ダークモード

ヘッダー右上（ログイン画面ではカード右上）の月／太陽ボタンで切り替えます。
初回は OS の設定（`prefers-color-scheme`）に従い、手動で切り替えるとその選択を
`localStorage` の `office-hub:theme` に保存して以後優先します。

色は `src/theme.css` の CSS 変数に集約しています。ライトは `:root`、ダークは
`:root[data-theme="dark"]` が持ち、`<html>` の `data-theme` 属性だけで切り替わります。

- `src/useTheme.js` — テーマの状態、保存、OS 設定への追従
- `index.html` の先頭スクリプト — 初回描画前に `data-theme` を確定させ、ライト画面のちらつきを防ぐ

**色を足すときは `src/theme.css` に書き、ライトとダークの両方の値を定義してください。**
JSX のインラインスタイルからも `style={{ background: "var(--surface)" }}` の形で参照できます。
コンポーネントに 16 進数の色を直接書くと、そこだけ切り替わらなくなります。

## 依存関係の変更点

- `lucide-react` をアイコン用に追加しました（元の `ti ti-*` アイコンフォントの代わり）。
- Tailwind CSS v4（`@tailwindcss/vite`）を追加し、`おごりペア` コンポーネントのユーティリティクラスをそのまま使えるようにしています。
- 座席・温度データの永続化は、Claude Artifacts 専用の `window.storage` から、通常のブラウザで動く `localStorage` に置き換えています。複数端末で座席状況を共有したい場合は、ここを自前のバックエンドAPI呼び出しに差し替えてください。

---

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
