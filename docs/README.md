# zcomic-next 設計ドキュメント一覧

| No. | 文書名 | 文書ID | ファイル |
|---|---|---|---|
| 1 | 基本設計書 | ZCN-BD-001 | [01_基本設計書.docx](./01_基本設計書.docx) |
| 2 | 詳細設計書 | ZCN-DD-001 | [02_詳細設計書.docx](./02_詳細設計書.docx) |
| 3 | システム構成図 | ZCN-AR-001 | [03_システム構成図.md](./03_システム構成図.md) |
| 4 | ER図 | ZCN-ER-001 | [04_ER図.md](./04_ER図.md) |
| 5 | テスト計画書 | ZCN-TP-001 | [05_テスト計画書.docx](./05_テスト計画書.docx) |
| 6 | テスト項目書 | ZCN-TC-001 | [06_テスト項目書.xlsx](./06_テスト項目書.xlsx) |
| 7 | API一覧 | ZCN-API-001 | [07_API一覧.xlsx](./07_API一覧.xlsx) |
| 8 | API仕様（Redoc HTML） | ZCN-API-002 | [08_API仕様_redoc.html](./08_API仕様_redoc.html) + [openapi.yaml](./openapi.yaml) |

## 読み順の推奨

1. **基本設計書** — システム概要・機能要件・非機能要件を把握
2. **システム構成図** — 物理配置・通信経路を視覚的に理解
3. **ER図** — DB設計の全体像を理解
4. **詳細設計書** — 実装レベルの仕様
5. **テスト計画書** — テスト方針・体制・スケジュール
6. **テスト項目書** — 個別テストケース実行用

## Mermaid 図を表示するには

`*.md` ファイルの図（システム構成・ER図）は Mermaid 記法で記述されています。以下のいずれかで表示できます。

- **VS Code**: 拡張機能「Markdown Preview Mermaid Support」を導入
- **GitHub / GitLab**: そのまま表示される
- **Obsidian**: 標準対応
- **Mermaid Live Editor**: https://mermaid.live にコードを貼り付け
- **コマンドライン**: `mmdc -i 03_システム構成図.md -o out.svg`（mermaid-cli 導入後）

## Swagger UI / OpenAPI

`docker compose up -d` で API を起動した後、以下から API 仕様を閲覧できます。

| URL | 内容 |
|---|---|
| `http://192.168.40.26:8080/docs` | Swagger UI（Web経由・本番想定） |
| `http://192.168.40.26:4000/docs` | Swagger UI（API直接アクセス） |
| `http://192.168.40.26:4000/openapi.yaml` | OpenAPI 3.1 YAML |
| `http://192.168.40.26:4000/openapi.json` | OpenAPI 3.1 JSON |
| `08_API仕様_redoc.html` をダブルクリック | オフラインで Redoc 表示 |

## 改版履歴

| 版数 | 発行日 | 改版内容 |
|---|---|---|
| 1.0 | 2026-05-13 | 初版作成 |
