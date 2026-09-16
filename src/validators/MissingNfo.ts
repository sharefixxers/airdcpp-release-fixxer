import * as fs from 'fs/promises';
import path from 'node:path';
import { DirectoryInfo, ErrorType, Validate, ValidateCondition } from '../types';

import { isReleaseName, isExemptReleaseName } from './common';

const subDirReg = /^(((DVD|CD|DIS(K|C)).?([0-9](0-9)?))|Sample|Cover(s)?|.{0,5}Sub(s)?)$/i;

const isSubdir = (name: string) => subDirReg.test(name);

const isNfo = (name: string) => path.extname(name).toLowerCase() === '.nfo';

const findNfo = (directory: DirectoryInfo): boolean => {

  const scanSubdirectory = async (parentPath: string, folderName: string) => {
    const fullPath = path.join(directory.path, folderName);

    try {
      const contentList = await fs.readdir(fullPath);
      return contentList.find(isNfo);
    } catch (e) {
      console.error(`Failed to scan the path ${fullPath}: ${e}`);
    }

    return false;
  };

  return !!directory.folders
    .filter(isSubdir)
    .some(scanSubdirectory.bind(this, directory.path));
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
