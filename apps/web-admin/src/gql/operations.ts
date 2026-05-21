import { gql } from "@apollo/client";

export const ME = gql`
  query Me {
    me {
      id
      name
      lastLoginAt
    }
  }
`;

export const ADMIN_LOGIN = gql`
  mutation AdminLogin($name: String!, $password: String!) {
    adminLogin(name: $name, password: $password) {
      id
      name
    }
  }
`;

export const ADMIN_LOGOUT = gql`
  mutation AdminLogout {
    adminLogout
  }
`;

export const SEARCH_COMICS = gql`
  query SearchComics($q: String!, $page: Int = 1, $pageSize: Int = 50) {
    searchComics(q: $q, page: $page, pageSize: $pageSize) {
      id
      authorJa
      titleJa
      authorEn
      titleEn
      no
      folderPath
      vch9
    }
  }
`;

// ===== 非同期ジョブ =====
export const START_EXTRACT_ALL = gql`
  mutation StartExtractAll {
    startExtractAllArchives {
      id
      status
      message
    }
  }
`;
export const START_EXTRACT_ALL_ER = gql`
  mutation StartExtractAllEr {
    startExtractAllErArchives {
      id
      status
      message
    }
  }
`;
export const START_MERGE_ALL = gql`
  mutation StartMergeAll {
    startMergeAllChapters {
      id
      status
      message
    }
  }
`;
export const JOB_STATUS = gql`
  query JobStatus($id: ID!) {
    jobStatus(id: $id) {
      id
      kind
      status
      message
      logs
      outputs
      elapsedSec
    }
  }
`;

// ===== Unknown / Compare / Search Page (既存) =====
export const SEARCH_UNKNOWN = gql`
  query SearchUnknown($q: String, $page: Int = 1, $pageSize: Int = 50) {
    searchUnknown(q: $q, page: $page, pageSize: $pageSize) {
      items {
        id
        folderPath
        authorJa
        titleJa
      }
      total
      page
      pageSize
    }
  }
`;
export const SEARCH_MK = gql`
  mutation SearchMangaKingdom($titleJa: String!) {
    searchFromMangaKingdom(titleJa: $titleJa) {
      sourceSite
      titleJa
      authorJa
      url
      coverUrl
      description
    }
  }
`;
export const COMPARE_NORMAL = gql`
  query CompareNormal($folderPath: String!) {
    compareNormal(folderPath: $folderPath) {
      folderPath
      existingVolume {
        id
        authorJa
        titleJa
        no
        vch9
      }
      parsedAuthorEn
      parsedTitleEn
      parsedAuthorJa
      parsedTitleJa
      parsedNo
      differences
      canRegister
    }
  }
`;
export const REGISTER_NORMAL = gql`
  mutation RegisterNormal($input: RegisterInput!) {
    registerNormalComic(input: $input) {
      id
      authorJa
      titleJa
      no
      vch9
    }
  }
`;
export const REGISTER_ERO = gql`
  mutation RegisterEro($input: RegisterInput!) {
    registerEroComic(input: $input) {
      id
      authorJa
      titleJa
      no
      vch9
    }
  }
`;
export const CRAWL_PAGE = gql`
  mutation CrawlPage($url: String!) {
    crawlPage(url: $url) {
      ok
      url
      elapsedSec
      pages {
        title
        url
        downloadUrl
        thumbnailUrl
      }
      logs
    }
  }
`;

export const CRAWL_13DL_LIST = gql`
  mutation Crawl13dlList(
    $categoryUrl: String
    $pageNum: Int = 1
    $startIdx: Int = 1
    $endIdx: Int = 7
  ) {
    crawl13dlList(
      categoryUrl: $categoryUrl
      pageNum: $pageNum
      startIdx: $startIdx
      endIdx: $endIdx
    ) {
      ok
      baseUrl
      pageUrl
      pageNum
      startIdx
      endIdx
      totalItems
      items {
        title
        titleJa
        titleEn
        detailUrl
        stock
        foundNo
        newDir
        existDir
        rapidGatorLinks {
          fileName
          url
        }
      }
      elapsedSec
      logs
    }
  }
`;

export const MAKE_REGIST_DIR = gql`
  mutation MakeRegistDir($dir: String!) {
    makeRegistDir(dir: $dir) {
      ok
      message
      path
    }
  }
`;

// ===== フォルダ操作 (Search 結果のアクション) =====
export const MOVE_FOLDER = gql`
  mutation MoveFolder($fromPath: String!, $toPath: String!) {
    moveFolder(fromPath: $fromPath, toPath: $toPath) {
      ok
      message
      path
    }
  }
`;
export const DELETE_TITLE_FOLDER = gql`
  mutation DeleteTitleFolder($folderPath: String!, $permanent: Boolean = false) {
    deleteTitleFolder(folderPath: $folderPath, permanent: $permanent) {
      ok
      message
      path
    }
  }
`;
export const CREATE_TITLE_FOLDER = gql`
  mutation CreateTitleFolder($parentPath: String!, $name: String!) {
    createTitleFolder(parentPath: $parentPath, name: $name) {
      ok
      message
      path
    }
  }
`;

// ===== 比較標準 (UNREGIST → tb_bok) =====
export const COMPARE_UNREGIST = gql`
  query CompareUnregist {
    compareUnregist {
      ok
      baseDir
      totalEntries
      entries {
        folderPath
        authorHead
        authorTitleFolder
        authorJa
        titleJa
        volumeNo
        stockVolumes
        stockBooks {
          id
          no
          folderPath
        }
        stockCount
        alreadyInDb
        existingBokMid
      }
      logs
    }
  }
`;

export const EXCHANGE_DIR = gql`
  mutation ExchangeDir($newDir: String!) {
    exchangeDir(newDir: $newDir) {
      ok
      message
      path
    }
  }
`;

export const DELETE_DB_AND_BOOK = gql`
  mutation DeleteDBandBook($bookPath: String!) {
    deleteDBandBook(bookPath: $bookPath) {
      ok
      message
      path
    }
  }
`;

export const RENAME_REGIST_FOLDER = gql`
  mutation RenameRegistFolder($oldDir: String!, $newDir: String!, $inRegist: Boolean = true) {
    renameRegistFolder(oldDir: $oldDir, newDir: $newDir, inRegist: $inRegist) {
      ok
      message
      path
    }
  }
`;

export const START_REGIST_UNREGIST_ALL = gql`
  mutation StartRegistUnregistAll {
    startRegistUnregistAll {
      id
      status
      message
    }
  }
`;

export const START_REGIST_ER_UNREGIST_ALL = gql`
  mutation StartRegistErUnregistAll {
    startRegistErUnregistAll {
      id
      status
      message
    }
  }
`;

export const START_SPLIT_SPREAD = gql`
  mutation StartSplitSpread($folderPath: String!, $inRegist: Boolean = true) {
    startSplitSpread(folderPath: $folderPath, inRegist: $inRegist) {
      id
      status
      message
    }
  }
`;

// ===== Home 検索結果アクション (旧admin_new準拠) =====
export const MOVE_TO_REGIST = gql`
  mutation MoveToRegist($folderPath: String!) {
    moveToRegist(folderPath: $folderPath) {
      ok
      message
      path
    }
  }
`;
export const CREATE_REGIST_FOLDER = gql`
  mutation CreateRegistFolder($folderPath: String!) {
    createRegistFolder(folderPath: $folderPath) {
      ok
      message
      path
    }
  }
`;
export const DELETE_VOLUME_DB = gql`
  mutation DeleteVolumeDB($id: Int!) {
    deleteVolumeDB(id: $id) {
      ok
      message
      path
    }
  }
`;
export const DELETE_VOLUME_DB_AND_DIR = gql`
  mutation DeleteVolumeDBAndDir($id: Int!, $folderPath: String!) {
    deleteVolumeDBAndDir(id: $id, folderPath: $folderPath) {
      ok
      message
      path
    }
  }
`;

// ===== Unknown 検索 (REGIST_DIR/0 配下) =====
export const LIST_UNKNOWN_FOLDERS = gql`
  query ListUnknownFolders {
    listUnknownFolders {
      ok
      baseDir
      total
      items {
        folderName
        folderPath
        title
        titleEN
        titleJP
      }
      logs
    }
  }
`;
