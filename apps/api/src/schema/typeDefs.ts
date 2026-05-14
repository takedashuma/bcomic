import gql from "graphql-tag";

export const typeDefs = gql`
  scalar DateTime

  """
  作品（COMIC_FOLDER）。tb_bok を (topFolder, authorEn, titleEn) で集約した単位。
  """
  type ComicFolder {
    """
    作品識別キー（authorEn|titleEn を base64 した文字列）
    """
    id: ID!
    topFolder: String
    authorEn: String!
    titleEn: String!
    authorJa: String
    titleJa: String
    """
    所属する巻数
    """
    volumeCount: Int!
    """
    最新巻（最大の vch4）
    """
    latestVolume: Volume
    """
    最新更新日時（巻のいずれかの updatedAt の max）
    """
    latestUpdatedAt: DateTime
    """
    全ての巻（詳細ページ用）。一覧クエリではフィールド省略可
    """
    volumes: [Volume!]!
    """
    お気入登録済み
    """
    isFavorite: Boolean!
  }

  type Volume {
    id: Int!
    no: String
    noJa: String
    authorEn: String
    titleEn: String
    authorJa: String
    titleJa: String
    folderPath: String
    pageCount: Int!
    updatedAt: DateTime
    """
    閲覧進捗（未読は null）
    """
    progress: ReadingProgress
  }

  type ReadingProgress {
    lastPage: Int!
    updatedAt: DateTime!
  }

  type User {
    id: Int!
    email: String
    nickname: String
  }

  type ComicFolderConnection {
    items: [ComicFolder!]!
    total: Int!
    page: Int!
    pageSize: Int!
  }

  enum SortKey {
    NEW_ARRIVAL
    TITLE
    AUTHOR
  }

  type Query {
    me: User
    """
    新着順一覧。q は曖昧検索（authorJa / titleJa / authorEn / titleEn）
    """
    comicFolders(q: String, page: Int = 1, pageSize: Int = 24, sort: SortKey = NEW_ARRIVAL): ComicFolderConnection!
    favorites(q: String, page: Int = 1, pageSize: Int = 24): ComicFolderConnection!
    comicFolder(authorEn: String!, titleEn: String!): ComicFolder
    volume(id: Int!): Volume
  }

  type Mutation {
    login(email: String!, password: String!): User!
    logout: Boolean!
    changePassword(oldPassword: String!, newPassword: String!): Boolean!
    """
    お気入トグル。返り値: 登録後の状態 (true=登録/false=解除)
    """
    toggleFavorite(authorEn: String!, titleEn: String!): Boolean!
    """
    閲覧位置を保存
    """
    saveProgress(volumeId: Int!, page: Int!): Boolean!
  }
`;
