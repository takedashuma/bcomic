# zcomic-next

PHP製コミックビューワー（`tb_bok` / `tb_bkm` / `tb_usr`）を、Node.js + GraphQL + React で作り直したもの。

## 構成

```
zcomic-next/
├── apps/
│   ├── api/   # Apollo Server + Prisma + Express + JWT
│   └── web/   # Vite + React + TanStack Router + shadcn/ui + Apollo Client
├── docker-compose.yml
└── .env.example
```

## 画面

1. ログイン（`/login`）
2. 新着順 一覧（`/`） — 4×6=24件/ページ、曖昧検索、フォルダmtime順、お気入トグル
3. お気入 一覧（`/favorites`） — 同レイアウト
4. 設定（`/settings`） — パスワード変更
5. 詳細（`/folder/:authorEn/:titleEn`） — 巻一覧
6. ビューワー（`/viewer/:volumeId`） — 1ページずつ・右→左・最終位置記憶

## セットアップ手順

### 1) `.env` を編集

```bash
cp .env.example .env
vi .env
```

必須項目:
- `DATABASE_URL` … 既存MariaDBへの接続文字列（例 `mysql://zcomic:pw@192.168.40.99:3306/comic`）
- `COMIC_ROOT_HOST` … `/Volumes/public/Comic/Renamed`
- `JWT_SECRET` … 16文字以上のランダム文字列

### 2) `tb_red`（閲覧進捗）テーブルを作成

```bash
mysql -h 192.168.40.99 -u zcomic -p comic < apps/api/prisma/migrations/001_init/migration.sql
```

または phpMyAdmin で同 SQL を実行。

### 3) Prisma のクライアントコードを生成（既存スキーマと整合確認）

```bash
cd apps/api
npm install
npx prisma generate
# 既存DBと差異があれば確認:
# npx prisma db pull --print
```

### 4) Docker起動

```bash
docker compose up -d --build
```

http://localhost:8080 でアクセス。

## 既存PHP版との関係

| データ | 扱い |
|---|---|
| `tb_bok` | PHP側が更新。本サイトは参照のみ |
| `tb_bkm` | 両サイトで共有（同じテーブル） |
| `tb_usr` | 共有。パスワードは初回ログイン時に bcrypt にマイグレーション |
| `tb_red` | 本サイト新規（閲覧進捗） |
| `tb_pth` `tb_adm` | 本サイトでは未使用 |

## 開発（コンテナ外）

```bash
# API（4000番ポート）
cd apps/api
npm install
npm run dev

# Web（5173番ポート）
cd apps/web
npm install
npm run dev
```

Viteは `/graphql` `/img/*` を `http://localhost:4000` にプロキシします。

## アーキテクチャ要点

- **画像配信**: GraphQLではなくREST `/img/cover/:volumeId` `/img/page/:volumeId/:pageIndex` で配信。Range request対応、サムネはsharpで400px縮小
- **作品集約**: `tb_bok` は1巻=1レコード。`(authorEn, titleEn)` で `groupBy` して作品(COMIC_FOLDER)単位に集約
- **お気入**: `tb_bkm` を論理削除（既存仕様に合わせる）
- **認証**: JWT を httpOnly Cookie で配布。Vite/nginx 同一オリジン化のためCORSは開発時のみ
- **パス安全性**: `bok_txt1` から組み立てるパスは必ず COMIC_ROOT 配下にあることを検証（ディレクトリトラバーサル対策）

## 既知の TODO

- [ ] tb_pth を活用するかどうか（購入履歴を残すなら）
- [ ] ファイルスキャナー（PHP廃止後の新規追加検出）
- [ ] サムネイル永続キャッシュ（現状は HTTP の Cache-Control のみ）
- [ ] 見開き表示モード（ビューワー）
- [ ] ダークモード切替
- [ ] e2eテスト
