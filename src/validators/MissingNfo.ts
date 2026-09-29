import * as fs from 'fs/promises';
import path from 'node:path';
import { DirectoryInfo, ErrorType, Validate, ValidateCondition } from '../types';

import { isReleaseName, isExemptReleaseName } from './common';

const subDirReg = /^(((DVD|CD|DIS(K|C)).?([0-9](0-9)?))|Sample|Cover(s)?|.{0,5}Sub(s)?)$/i;

const isSubdir = (name: string) => subDirReg.test(name);

const isNfo = (name: string) => path.extname(name).toLowerCase() === '.nfo';

const findNfo = async (directory: DirectoryInfo): Promise<boolean> => {

  const scanSubdirectory = async (folderName: string) => {
    const fullPath = path.join(directory.path, folderName);

    try {
      const contentList = await fs.readdir(fullPath);
      return contentList.some(isNfo);
    } catch (e) {
      console.error(`Failed to scan the path ${fullPath}: ${e}`);
    }

    return false;
  };

  // Array.prototype.some with an async callback checks the truthiness of the
  // returned Promise, not its resolved value -- a Promise object is always
  // truthy, so a plain `.some(scanSubdirectory)` here used to report "NFO
  // found" for any release with a matching subdirectory (Sample/Cover/DVD/
  // CD/Disk/Subs) even when that subdirectory had no NFO in it at all,
  // silently skipping the nfo_missing check for those releases. Await every
  // subdirectory scan first, then check the resolved booleans.
  const results = await Promise.all(
    directory.folders.filter(isSubdir).map(scanSubdirectory)
  );

  return results.some(Boolean);
};

const validate: Validate = async (directory, reporter) => {

  if (!directory.nfoFiles.length && isReleaseName(directory.name) && !isExemptReleaseName(directory.name) && (!directory.folders.length || !directory.folders.every(isReleaseName))) {
    let found = false;
    if (!directory.files.length) {

      found = await findNfo(directory);
    }

    if (!found) {
      reporter.addFolder(directory.path, 'nfo_missing', 'NFO file possibly missing', ErrorType.ITEMS_MISSING);
    }
  }
};

const validateCondition: ValidateCondition = directory => !directory.nfoFiles.length;

export default {
  validateCondition,
  validate,
  setting: {
    key: 'missing_nfo',
    title: 'Check missing NFO files',
    default_value: true,
    type: 'boolean'
  },
}
