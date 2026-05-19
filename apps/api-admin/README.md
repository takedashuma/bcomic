# zcomic-api-admin

管理サイト用 GraphQL API。本サイト (`apps/api`) とは **完全に独立** したコンテナ・コードベース。

## ポート

- 4001 (`ADMIN_API_PORT`)

## 認証

- Cookie 名: `zc_admin_token` (本サイトの `zc_token` と別)
- 認証元: `tb_adm` テーブル

## ファイル構成

```
src/
├── index.ts              Express + Apollo Server 起動
├── db.ts                 Prisma クライアント
├── auth.ts               JWT + bcrypt + 平文移行
├── context.ts            GraphQL コンテキスト + requireAdmin
├── util/path.ts          COMIC_ROOT / STAGING_ROOT のパス検証
├── schema/
│   ├── typeDefs.ts       GraphQL 型定義
│   └── resolvers.ts      リゾルバ実装
└── jobs/
    ├── runtime.ts        子プロセス実行ヘルパ
    ├── extractArchive.ts rar/zip/7z 解凍 (同期)
    ├── mergeChapterFolders.ts 話フォルダ結合 (同期)
    ├── extractErComic.ts ERComic 解凍 (同期)
    ├── searchMangaKingdom.ts マンガ王国スクレイピング
    └── crawl13dl.ts      13dl.net クローリング
```

## ジョブ実行

すべて同期（synchronous）。完了するまでクライアント側で待つ。`apps/web-admin` の `nginx.conf` で `proxy_read_timeout 600s` に延長。

## 業務ロジック移植

既存 PHP 版のロジックを参照する場合は `_legacy_admin_php/` の README に従いソースをコピーしてから、各 `src/jobs/*.ts` の TODO 箇所を書き換える。
