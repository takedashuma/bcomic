# zcomic-web-admin

管理サイト用 Web UI。本サイト (`apps/web`) とは完全に独立。

## ポート

- Web (nginx) : 8081 (`ADMIN_WEB_PORT`)
- vite dev    : 5174 (`VITE_ADMIN_DEV_PORT`)

## 画面

| Path | 画面 | 主機能 |
|---|---|---|
| `/login` | ログイン | `tb_adm` 認証 → `zc_admin_token` Cookie |
| `/` | Home | 登録済みコミック検索 / rar/zip 解凍 / 話フォルダー結合 / ERComic 解凍 |
| `/unknown` | Unknown 検索 | 未識別作品一覧 + マンガ王国スクレイピング |
| `/compare-normal` | 比較標準 | フォルダ vs DB の比較取得 + NormalComic登録 |
| `/compare-ero` | 比較E | 同上の成人向け版 + EroComic登録 |
| `/search-page` | Page 取得 | 13dl.net クローリング |

## 共通コンポーネント

- `AppLayout` – ヘッダー + 横タブナビ + ログアウト
- `JobResultPanel` – 同期ジョブの結果（OK/NG・経過秒・出力・ログ展開）
- `_compare-view` – `/compare-normal` `/compare-ero` の共通実装
