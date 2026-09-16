import { ServerInfo } from 'airdcpp-extension';
import { Logger } from 'airdcpp-apisocket';

import { Validator } from './internal.js';
import { APIType } from 'api.js';

export interface Config {
  ignoreExcluded: boolean;
  separateLogFile: boolean;
  validators: Validator[];
}

type ConfigGetter = () => Config;

export interface ApplicationInfo {
  server: ServerInfo;
  session: {
    token: string;
    tokenType: string;
  };
  cid: string;
}
export interface Context {
  configGetter: ConfigGetter;
  extensionName: string;
  application: ApplicationInfo;
  api: APIType;
  logger: Logger;
  fetch: typeof fetch;
  generateResultLogName: () => string;

  onFileMissing?: (path: string, errorId: string) => void;

  isPathAccepted: (path: string) => boolean;
}
