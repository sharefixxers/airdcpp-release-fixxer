
export interface ChatCommandData {
  command: string;
  args: string[];
  permissions: string[];
  owner?: string;
}

export enum PlatformEnum {
  WINDOWS = 'win32',
  MAC = 'darwin',
  LINUX = 'linux',
  FREEBSD = 'freebsd',
  OTHER = 'other',
}

export interface SessionInfo {
  system_info: {

    cid: string;
    api_feature_level: number;
    platform: PlatformEnum;
  };
  auth_token: string;
  token_type: string;
}

export interface BundleStatus {
  id: string;
  failed: boolean;
  downloaded: boolean;
  completed: boolean;
  str: string;
}

export interface Bundle {
  type: {
    id: string;
  };
  target: string;
  name: string;

  status?: BundleStatus;
}

export interface SharePathHookData {
  path: string;
  new_parent: boolean;
}

export interface ShareRoot {
  path: string;
}

export interface DirectoryType {
  id: 'directory';
}

export interface FileType {
  id: 'file';
}

export type FileItemType = FileType | DirectoryType;

export interface Dupe {
  id: string;
  paths: string[];
}

export interface FilelistItem {
  id: number;
  path: string;
  type: FileItemType;
  dupe: Dupe | null;
}

export interface GroupedPath {
  paths: string[];
}

export interface Extension {
  id: string;
  name: string;
  running: boolean;
  disabled: boolean;
}

export const enum SeverityEnum {
  NOTIFY = 'notify',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
}

export interface PostTempShareResponse {
  item: {
    id: number;
    tth: string;
  }
}
