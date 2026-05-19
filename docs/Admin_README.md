# 管理サイト (Admin) 構築サマリ

本サイト (apps/api, apps/web) とは完全分離した管理機能。

## 構成

```
zcomic-next/
├── apps/
│   ├── api/                既存・一般向けAPI (port 4000)
│   ├── web/                既存・一般向けWeb (port 8080)
│   ├── api-admin/          管理API (port 4001) ← NEW
│   └── web-admin/          管理Web (port 8081) ← NEW
├── _legacy_admin_php/      旧PHP管理サイト参照用(コミット対象外)
├── _legacy_admin_web/      旧Vite管理サイト参照用(コミット対象外)
└── docker-compose.yml      4サービス + comic_data volume
```

## 起動

```bash
cd /Users/dirs/SourceCode/bcomic/src/zcomic-next

# .env を確認・編集（少なくとも ADMIN_JWT_SECRET を強力なランダム文字列に）
vi .env

# 全コンテナをビルド
docker compose build api-admin web-admin

# 起動
docker compose up -d

# アクセス
#   一般サイト:    http://192.168.40.99:8080/
#   管理サイト:    http://192.168.40.99:8081/
#   admin API直:  http://192.168.40.99:4001/healthz
```

## 認証

`tb_adm` テーブルに管理者を1人以上作る必要があります（平文パスワードでOK、初回ログイン時に bcrypt 化）:

```sql
INSERT INTO tb_adm (adm_mid, adm_vch0, adm_vch1, adm_inday)
VALUES (1, 'admin', 'change-me', NOW());
```

ログイン後、Cookie `zc_admin_token` が発行される（本サイトの `zc_token` と完全別物）。

## 画面と機能

### Home (`/`)
1. **登録済みコミック検索** – 部分一致で `tb_bok` を検索
2. **rar/zip 解凍** – STAGING_ROOT 配下のアーカイブを解凍
3. **話フォルダー結合** – 話別フォルダを巻フォルダに合体
4. **ERComic 解凍** – 成人向け解凍

### Unknown 検索 (`/unknown`)
1. **Search Unknown** – titleJa/authorJa が NULL or "" な未識別作品の一覧
2. **Search From マンガ王国** – 日本語タイトルで [comic.k-manga.jp](https://comic.k-manga.jp) を検索

### 比較標準 (`/compare-normal`) / 比較E (`/compare-ero`)
1. **比較取得** – `folderPath` を入力すると命名規約 `[Author;著者] Title;タイトル/01` をパースし、DB の既存巻と突合
2. **NormalComic登録 / EroComic登録** – パース結果を編集して `tb_bok` に INSERT
   - `bok_vch9` = `'comic'` or `'ercomic'` で識別
   - `bok_mid` は MAX+1 で手動採番

### Page取得 (`/search-page`)
- 13dl.net などのページ URL を入力 → ページ内の `.rar/.zip/.7z` リンクを抽出

## 重い処理の実装方針

ユーザーリクエストに従い **同期実行**。

| ジョブ | 実装 | 想定実行時間 |
|---|---|---|
| extractArchive | 7z / unrar-free を子プロセスで spawn | 数秒〜数分 |
| mergeChapterFolders | fs.readdir + rename ループ | 秒オーダー |
| extractErComic | extractArchive のラッパー（拡張余地あり） | 数秒〜数分 |
| searchMangaKingdom | axios + cheerio | 1〜3秒 |
| crawl13dl | axios + cheerio | 1〜5秒 |

nginx の `proxy_read_timeout` を **600s** に延長して、長時間ジョブにも対応。

## 既存 PHP からの移植

旧ロジックは `_legacy_admin_php/` に配置（参照のみ）。各 `apps/api-admin/src/jobs/*.ts` のコメントに「`_legacy_admin_php` を参照」とマーキング済み。実コードを見ながら調整してください。

- マンガ王国 / 13dl.net のセレクタ・URL パターンはサイト構造の変化で要調整
- 命名規則のパース `parseFolderPath` も PHP 側に追加ルールがあれば反映

## 環境変数 (.env)

| 変数 | 用途 | デフォルト |
|---|---|---|
| `ADMIN_DATABASE_URL` | Admin Prisma の接続文字列 | DATABASE_URL と共有可 |
| `ADMIN_JWT_SECRET` | JWT 署名鍵 | 必須・要変更 |
| `ADMIN_JWT_EXPIRES_IN` | JWT 有効期限 | 1d |
| `ADMIN_CORS_ORIGINS` | CORS 許可Origin | 8081/4001/localhost系 |
| `VITE_ADMIN_API_URL` | ビルド時APIベースURL | 空(相対) |
| `VITE_ADMIN_DEV_API_PROXY` | dev サーバのプロキシ先 | http://localhost:4001 |
| `STAGING_ROOT_HOST/CONTAINER` | 解凍・結合の作業領域 | COMIC_ROOT 共用 |
| `ADMIN_API_PORT` / `ADMIN_WEB_PORT` | ポート | 4001 / 8081 |

## 既存ソースコピー手順

```bash
# Mac で実行
cp -R /Volumes/web/comicadmin.ds918.dirs.jp/. \
      /Users/dirs/SourceCode/bcomic/src/zcomic-next/_legacy_admin_php/
cp -R /Volumes/web/vite-comics/. \
      /Users/dirs/SourceCode/bcomic/src/zcomic-next/_legacy_admin_web/
```

これらは `.gitignore` 済みで commit されません。

## TODO

- マンガ王国 / 13dl.net のセレクタ調整（実HTML確認後）
- ERComic 特有の処理（パスワード対応・特殊命名）の実装
- 比較取得時の名寄せロジック強化（既存 PHP のルール反映）
- 同期ジョブの進捗表示（現状は完了まで待つだけ。必要なら SSE 化可）
