import path from 'node:path';
import * as fs from 'fs/promises';

import { TotalErrorCounter, ValidatorErrorReporter, pickMissingErrorId } from './errors';

import { DirectoryInfo, ErrorLogger, ErrorType, Validator } from './types';

export type PathValidator = (path: string) => Promise<boolean> | boolean;
export type DirectoryMissingItemsCallback = (directoryPath: string, errorId: string) => void;

const Scanner = (
  validators: Validator[],
  errorLogger: ErrorLogger,
  validatePath: PathValidator,
  isPathAccepted: (path: string) => boolean = () => false,
  onDirectoryMissingItems?: DirectoryMissingItemsCallback,
) => {
  const start = new Date();

  const errors = TotalErrorCounter();
  let running = 0, maxRunning = 0, scannedDirectories = 0, scannedFiles = 0, ignoredFiles = 0, ignoredDirectories = 0;

  const parseFile = async (directoryInfo: DirectoryInfo, name: string) => {
    const fullPath = path.join(directoryInfo.path, name);

    let stat;
    try {
      stat = await fs.stat(fullPath);
    } catch (e) {
      errors.add('disk_read_error', `Failed to read file: ${e}`, ErrorType.INVALID_CONTENT);
      return false;
    }

    if (stat.isFile()) {
      if (!await validatePath(fullPath)) {
        ignoredFiles++;
        directoryInfo.ignoredFiles.push(name);
        return false;
      }

      const extension = path.extname(name).toLowerCase();
      if (extension === '.sfv') {
        directoryInfo.sfvFiles.push(name);
      } else if (extension === '.nfo') {
        directoryInfo.nfoFiles.push(name);
      } else {
        directoryInfo.files.push(name);
      }
    } else {
      if (!await validatePath(fullPath + path.sep)) {
        ignoredDirectories++;
        directoryInfo.ignoredDirectories.push(name);
        return false;
      }

      directoryInfo.folders.push(name);
    }

    return true;
  };

  const parseContent = async (directoryPath: string) => {
    let contentList;

    try {
      contentList = await fs.readdir(directoryPath);
    } catch (e) {
      errors.add('disk_read_error', `Failed to read disk content: ${e}`, ErrorType.INVALID_CONTENT);
      return null;
    }

    const info: DirectoryInfo = {
      name: path.parse(directoryPath).base,
      path: directoryPath,
      files: [],
      folders: [],
      sfvFiles: [],
      nfoFiles: [],
      ignoredDirectories: [],
      ignoredFiles: [],
    };

    const contentResults = await Promise.all(contentList.map(parseFile.bind(this, info)));
    if (contentResults.every(res => res === false)) {

      return null;
    }

    return info;
  };

  const runValidator = async (
    content: DirectoryInfo,
    directoryErrorTypes: { [key in string]: { type: ErrorType } },
    validator: Validator,
  ) => {
    if (validator.validateCondition && !validator.validateCondition(content)) {
      return;
    }

    const validatorErrors = ValidatorErrorReporter(content, errors, errorLogger, (errorId, errorType) => {
      directoryErrorTypes[errorId] = { type: errorType };
    });
    await validator.validate(content, validatorErrors);
    validatorErrors.flush();
  };

  const scanPath = async (directoryPath: string, recursive = true) => {
    running++;
    if (running > maxRunning) {
      maxRunning = running;
    }

    const content = await parseContent(directoryPath);
    if (!content) {
      running--;
      return;
    }

    if (!isPathAccepted(directoryPath)) {

      // Tracked per directory (as opposed to the scan-wide `errors` counter
      // above) so that, on a manual or whole-share scan spanning many
      // release folders, a "this folder needs redownloading" decision can
      // be made for each folder individually rather than only once for the
      // entire scan.
      const directoryErrorTypes: { [key in string]: { type: ErrorType } } = {};
      const promises = validators.map(validator => runValidator(content, directoryErrorTypes, validator));
      await Promise.all(promises);

      if (onDirectoryMissingItems) {
        const missingErrorId = pickMissingErrorId(directoryErrorTypes);
        if (missingErrorId) {
          onDirectoryMissingItems(directoryPath, missingErrorId);
        }
      }
    }

    running--;
    scannedDirectories++;
    scannedFiles += content.files.length + content.sfvFiles.length + content.nfoFiles.length;

    if (recursive) {

      const childPaths = content.folders.map(name => path.join(directoryPath, name) + path.sep);
      await scanPathsSequential(childPaths);
    }
  };

  const scanPathsConcurrent = async (paths: string[]) => {
    await Promise.all(paths.map(p => scanPath(p)));
  };

  const scanPathsSequential = async (paths: string[]) => {
    for (let p of paths) {
      await scanPath(p);
    }
  };

  const scanPaths = async (paths: string[]) => {
    await scanPathsConcurrent(paths);
  };

  return {
    scanPath,
    scanPaths,
    errors,
    get stats() {
      return {
        maxRunning,
        duration: new Date().getTime() - start.getTime(),

        scannedDirectories,
        scannedFiles,

        ignoredDirectories,
        ignoredFiles,
      };
    }
  };
};

export type ScannerType = ReturnType<typeof Scanner>;

export default Scanner;