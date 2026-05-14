import { gql } from "@apollo/client";
export const ME = gql `
  query Me {
    me {
      id
      email
      nickname
    }
  }
`;
export const LOGIN = gql `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      id
      email
      nickname
    }
  }
`;
export const LOGOUT = gql `
  mutation Logout {
    logout
  }
`;
export const CHANGE_PASSWORD = gql `
  mutation ChangePassword($oldPassword: String!, $newPassword: String!) {
    changePassword(oldPassword: $oldPassword, newPassword: $newPassword)
  }
`;
export const COMIC_FOLDERS = gql `
  query ComicFolders($q: String, $page: Int = 1, $pageSize: Int = 24) {
    comicFolders(q: $q, page: $page, pageSize: $pageSize) {
      items {
        id
        authorEn
        titleEn
        authorJa
        titleJa
        volumeCount
        latestVolume {
          id
          no
          noJa
        }
        latestUpdatedAt
        isFavorite
      }
      total
      page
      pageSize
    }
  }
`;
export const FAVORITES = gql `
  query Favorites($q: String, $page: Int = 1, $pageSize: Int = 24) {
    favorites(q: $q, page: $page, pageSize: $pageSize) {
      items {
        id
        authorEn
        titleEn
        authorJa
        titleJa
        volumeCount
        latestVolume {
          id
          no
          noJa
        }
        latestUpdatedAt
        isFavorite
      }
      total
      page
      pageSize
    }
  }
`;
export const COMIC_FOLDER_DETAIL = gql `
  query ComicFolderDetail($authorEn: String!, $titleEn: String!) {
    comicFolder(authorEn: $authorEn, titleEn: $titleEn) {
      id
      authorEn
      titleEn
      authorJa
      titleJa
      volumeCount
      isFavorite
      volumes {
        id
        no
        noJa
        updatedAt
        progress {
          lastPage
        }
      }
    }
  }
`;
export const VOLUME = gql `
  query Volume($id: Int!) {
    volume(id: $id) {
      id
      no
      noJa
      titleJa
      authorJa
      pageCount
      progress {
        lastPage
      }
    }
  }
`;
export const TOGGLE_FAVORITE = gql `
  mutation ToggleFavorite($authorEn: String!, $titleEn: String!) {
    toggleFavorite(authorEn: $authorEn, titleEn: $titleEn)
  }
`;
export const SAVE_PROGRESS = gql `
  mutation SaveProgress($volumeId: Int!, $page: Int!) {
    saveProgress(volumeId: $volumeId, page: $page)
  }
`;
