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
export const COMPARE_ERO = gql`
  query CompareEro($folderPath: String!) {
    compareEro(folderPath: $folderPath) {
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
  mutation Crawl13dlList($categoryUrl: String, $chunkNo: Int!, $chunkSize: Int = 8) {
    crawl13dlList(categoryUrl: $categoryUrl, chunkNo: $chunkNo, chunkSize: $chunkSize) {
      ok
      baseUrl
      pageUrl
      chunkNo
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
