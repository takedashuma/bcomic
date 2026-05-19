import gql from "graphql-tag";

export const typeDefs = gql`
  scalar DateTime

  type Admin {
    id: Int!
    name: String
    lastLoginAt: DateTime
  }

  type Volume {
    id: Int!
    topFolder: String
    authorEn: String
    titleEn: String
    no: String
    authorJa: String
    titleJa: String
    noJa: String
    vch9: String
    folderPath: String
    updatedAt: DateTime
    point: Int
  }

  enum JobStatus {
    pending
    running
    success
    failed
  }

  """
  非同期ジョブの状態。startXxx で受け取った id を jobStatus(id) で polling して進捗確認。
  """
  type Job {
    id: ID!
    kind: String!
    status: JobStatus!
    message: String!
    logs: [String!]!
    outputs: [String!]!
    startedAt: Float!
    finishedAt: Float
    elapsedSec: Float!
  }

  type UnknownItem {
    id: Int!
    folderPath: String
    authorJa: String
    titleJa: String
  }
  type UnknownConnection {
    items: [UnknownItem!]!
    total: Int!
    page: Int!
    pageSize: Int!
  }

  """
  REGIST_DIR/0 配下の Unknown フォルダ。
  フォルダ名形式: "[Unknown;Unknown] EnglishTitle;日本語タイトル"
  """
  type UnknownFolderItem {
    folderName: String!
    folderPath: String!
    title: String!
    titleEN: String!
    titleJP: String!
  }
  type UnknownFoldersResult {
    ok: Boolean!
    baseDir: String!
    items: [UnknownFolderItem!]!
    total: Int!
    logs: [String!]!
  }

  type ExternalCandidate {
    sourceSite: String!
    titleJa: String!
    authorJa: String
    url: String
    coverUrl: String
    description: String
  }

  type CompareResult {
    folderPath: String!
    existingVolume: Volume
    parsedAuthorEn: String
    parsedTitleEn: String
    parsedAuthorJa: String
    parsedTitleJa: String
    parsedNo: String
    differences: [String!]!
    canRegister: Boolean!
  }

  input RegisterInput {
    folderPath: String!
    authorEn: String!
    titleEn: String!
    authorJa: String!
    titleJa: String!
    no: String!
    kind: String!
  }

  type CrawlResult {
    ok: Boolean!
    url: String!
    elapsedSec: Float!
    pages: [CrawlPage!]!
    logs: [String!]!
  }
  type CrawlPage {
    title: String!
    url: String!
    downloadUrl: String
    thumbnailUrl: String
  }

  # ===== 13dl カテゴリ クローラー =====
  type RGLink {
    fileName: String!
    url: String!
  }
  type CrawledItem {
    title: String!
    titleJa: String!
    titleEn: String!
    detailUrl: String!
    """
    DBに既存の同タイトル作品の所有巻一覧 (カンマ区切り)
    """
    stock: String!
    foundNo: String!
    """
    既存なし → 新規登録用フォルダの相対パス (/0/[Unknown;Unknown] EN;JP)
    """
    newDir: String
    """
    既存あり → 既存フォルダの相対パス (/<vch0>/[<vch1>] <vch3>;<vch7>/)
    """
    existDir: String
    rapidGatorLinks: [RGLink!]!
  }
  type CrawlListResult {
    ok: Boolean!
    baseUrl: String!
    pageUrl: String!
    pageNum: Int!
    startIdx: Int!
    endIdx: Int!
    totalItems: Int!
    items: [CrawledItem!]!
    elapsedSec: Float!
    logs: [String!]!
  }

  """
  フォルダ操作結果（移動・削除・作成共通）
  """
  type FolderOpResult {
    ok: Boolean!
    message: String!
    path: String
  }

  type CompareEntry {
    folderPath: String!
    authorHead: String!
    authorTitleFolder: String!
    authorJa: String!
    titleJa: String!
    volumeNo: String!
    stockVolumes: [String!]!
    stockCount: Int!
    alreadyInDb: Boolean!
    existingBokMid: Int
  }
  type UnregistCompareResult {
    ok: Boolean!
    baseDir: String!
    entries: [CompareEntry!]!
    totalEntries: Int!
    logs: [String!]!
  }

  type Query {
    me: Admin
    searchComics(q: String!, page: Int = 1, pageSize: Int = 50): [Volume!]!
    searchUnknown(q: String, page: Int = 1, pageSize: Int = 50): UnknownConnection!
    compareNormal(folderPath: String!): CompareResult!
    compareEro(folderPath: String!): CompareResult!
    """
    REGIST_DIR 配下を再帰スキャンして UNREGIST のエントリ一覧と
    既存DBの同タイトル巻情報 (stock) を返す。
    """
    compareUnregist: UnregistCompareResult!
    """
    旧 search_unknown.php の代替。
    REGIST_DIR/0 配下の Unknown フォルダ一覧を返す。
    """
    listUnknownFolders: UnknownFoldersResult!
    """
    非同期ジョブの進捗を取得（フロントは polling で完了検知）
    """
    jobStatus(id: ID!): Job
  }

  type Mutation {
    adminLogin(name: String!, password: String!): Admin!
    adminLogout: Boolean!
    adminChangePassword(oldPassword: String!, newPassword: String!): Boolean!

    """
    rar/zip 一括解凍を起動。環境変数 EXTRACT_ARCHIVE_DIR 配下を対象。
    Job を即座に返し、UI 側で jobStatus(id) を polling する。
    """
    startExtractAllArchives: Job!

    """
    ERComic 一括解凍を起動。環境変数 EXTRACT_ER_ARCHIVE_DIR 配下を対象（多くは EXTRACT_ARCHIVE_DIR と同じ）。
    """
    startExtractAllErArchives: Job!

    """
    話フォルダ結合を一括実行。環境変数 MERGE_CHAPTER_DIR 配下の各作品を対象。
    """
    startMergeAllChapters: Job!

    """
    マンガ王国から外部検索（短時間想定なので同期）
    """
    searchFromMangaKingdom(titleJa: String!): [ExternalCandidate!]!

    registerNormalComic(input: RegisterInput!): Volume!
    registerEroComic(input: RegisterInput!): Volume!

    crawlPage(url: String!): CrawlResult!

    """
    13dl カテゴリページ (1ページ=24件) の指定範囲 (startIdx..endIdx) をクロールし
    各アイテム詳細から RapidGator リンクを抽出する。
    pageNum=1, startIdx=1, endIdx=7  →  Page1の1〜7番目  という指定。
    """
    crawl13dlList(
      categoryUrl: String
      pageNum: Int = 1
      startIdx: Int = 1
      endIdx: Int = 7
    ): CrawlListResult!

    """
    REGIST_DIR 配下に dir をそのまま作成する
    例: dir="/K/[Author;著者] Title;タイトル/"
    例: dir="/0/[Unknown;Unknown] NoEnglishTitle;蟲蝕のアイリス"
    """
    makeRegistDir(dir: String!): FolderOpResult!

    # ===== 比較標準 =====
    """
    REGIST_DIR/<newDir> を COMIC_ROOT/<newDir> に入換 (rm + cp + rm)
    """
    exchangeDir(newDir: String!): FolderOpResult!
    """
    DBから該当 bookPath を含むレコード削除 + COMIC_ROOT/bookPath を rm
    """
    deleteDBandBook(bookPath: String!): FolderOpResult!
    """
    REGIST_DIR (デフォルト) または COMIC_ROOT 内で oldDir → newDir に rename
    """
    renameRegistFolder(oldDir: String!, newDir: String!, inRegist: Boolean = true): FolderOpResult!
    """
    REGIST_DIR 配下の全ての /initial/authorTitle/volume を tb_bok に登録し、
    COMIC_ROOT へコピー後 REGIST_DIR を空にする (非同期ジョブ)
    """
    startRegistUnregistAll: Job!

    # ----- 検索結果に対するフォルダ操作 -----
    """
    タイトルフォルダの丸ごと移動（rename） / 旧コード互換
    """
    moveFolder(fromPath: String!, toPath: String!): FolderOpResult!
    """
    タイトル削除。デフォルトは .__trash 配下に退避。permanent=true で物理削除 / 旧コード互換
    """
    deleteTitleFolder(folderPath: String!, permanent: Boolean = false): FolderOpResult!
    """
    タイトルフォルダの新規作成（任意パス配下） / 旧コード互換
    """
    createTitleFolder(parentPath: String!, name: String!): FolderOpResult!

    # ----- 検索結果に対する新仕様アクション (旧admin_new準拠) -----
    """
    COMIC_ROOT/<folderPath> を REGIST_DIR/<folderPath> へ移動。
    例: folderPath = "/H/[HaraYasuhisa;原泰久] Kingdom;キングダム"
    """
    moveToRegist(folderPath: String!): FolderOpResult!
    """
    旧 admin_new/makeFolder.php 代替。
    REGIST_DIR/<folderPath> を空フォルダで mkdir -p。
    """
    createRegistFolder(folderPath: String!): FolderOpResult!
    """
    tb_bok の該当 id 行だけを削除 (FSは触らない)
    """
    deleteVolumeDB(id: Int!): FolderOpResult!
    """
    tb_bok の該当 id 行を削除 + COMIC_ROOT/<folderPath> を rm -rf
    """
    deleteVolumeDBAndDir(id: Int!, folderPath: String!): FolderOpResult!
  }
`;
