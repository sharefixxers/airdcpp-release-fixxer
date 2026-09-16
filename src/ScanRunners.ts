import Scanner, { ScannerType } from './Scanner';

import { HookCallback } from 'airdcpp-apisocket';
import { Bundle, GroupedPath, SharePathHookData, SeverityEnum, Context } from './types';
import { getApiErrorLogger, getMemoryErrorLogger } from 'errors/ErrorLogger';
import { pickMissingErrorId } from 'errors/pickMissingErrorId';
import { openLog } from 'helpers/LogViewer';

const getEmptyScanner = () => {
  return Scanner([], getMemoryErrorLogger(true).logger, () => false)
}

const ScanRunners = function (context: Context) {
  const { api, logger, configGetter } = context;
  const reduceGroupedPath = (reduced: string[], info: GroupedPath) => {
    reduced.push(...info.paths);
    return reduced;
  };

  const logCompletedDebug = (scanner: ScannerType, message: string) => {
    let text = message;
    text += `: scanned ${scanner.stats.scannedDirectories} directories and ${scanner.stats.scannedFiles} files, took ${scanner.stats.duration} ms`;
    text += ` (${(scanner.stats.duration / scanner.stats.scannedDirectories).toFixed(2)} ms per directory, ${(scanner.stats.duration / scanner.stats.scannedFiles).toFixed(2)} ms per file)`;
    if (scanner.stats.ignoredFiles > 0 || scanner.stats.ignoredDirectories > 0) {
      text += `, ignored ${scanner.stats.ignoredDirectories} directories and ${scanner.stats.ignoredFiles} files`;
    }

    logger.info(text);
  };

  const pathValidator = (skipQueueCheck: boolean) => {
    if (!configGetter().ignoreExcluded) {
      return () => true;
    }

    const validate = async (path: string) => {
      try {
        await api.validateSharePath(path, skipQueueCheck);
      } catch (e) {
        logger.verbose(`Path ${path} is ignored from share (${e.message})`);
        return false;
      }

      return true;
    };

    return validate;
  };

  const ApiErrorLogger = getApiErrorLogger(api.postEvent);

  const onManualScanCompleted = (scanner: ReturnType<typeof Scanner>) => {
    let text;
    if (scanner.errors.count()) {
      text = `Scan completed and the following problems were found: ${scanner.errors.format()}`;
    } else {
      text = 'Scan completed, no problems were found';
    }

    logCompletedDebug(scanner, `Manual scan completed with maximum concurrency of ${scanner.stats.maxRunning}`);
    api.postEvent(text, scanner.errors.count() ? SeverityEnum.WARNING : SeverityEnum.INFO);
  };

  const doManualScan = async (paths: string[]) => {
    const logger = context.configGetter().separateLogFile ? getMemoryErrorLogger(true) : {
      getLog: () => undefined,
      logger: ApiErrorLogger,
    };

    const scanner = Scanner(
      configGetter().validators,
      logger.logger,
      pathValidator(false),
      context.isPathAccepted,
      // Manual/share scans cover many unrelated release folders in one run,
      // unlike a bundle-finished scan which is already scoped to a single
      // folder -- so the "search and redownload the whole folder" action
      // (same one used for a just-finished bundle, respecting the same
      // "crc_redownload" setting) is triggered per folder as each one is
      // scanned, instead of only ever firing for freshly completed
      // downloads.
      context.onFileMissing,
    );
    await scanner.scanPaths(paths);

    const resultData = logger.getLog();
    if (!!resultData) {
      try {
        await openLog(resultData, context);
      } catch (e) {
        api.postEvent(`Failed to open scan results: ${e.message}`, SeverityEnum.ERROR);
      }
    }

    onManualScanCompleted(scanner);

    return scanner;
  };

  const scanPathsManual = async (paths: string[]) => {
    const text = paths.length === 1 ? `Scanning the path ${paths[0]}` : `Scanning ${paths.length} paths...`;
    api.postEvent(text, SeverityEnum.INFO);

    const scanner = doManualScan(paths);
    return scanner;
  };

  const scanPath = async (targetPath: string) => {
    return scanPathsManual([targetPath]);
  };

  const scanShare = async () => {
    const groupedDirectories = await api.getGroupedShareRoots();
    api.postEvent('Scanning shared releases...', SeverityEnum.INFO);

    const scanner = await doManualScan(groupedDirectories.reduce((accumulator, element) => reduceGroupedPath(accumulator, element), []));
    return scanner;
  };

  const onBundleFinished: HookCallback<Bundle> = async (bundle, accept, reject) => {
    if (bundle.type.id === 'file') {
      accept(undefined);
      return null;
    }

    const scanner = Scanner(configGetter().validators, ApiErrorLogger, pathValidator(true), context.isPathAccepted);
    await scanner.scanPath(bundle.target);

    logCompletedDebug(scanner, 'Bundle scan completed');
    if (scanner.errors.count()) {

      const error = scanner.errors.pickOne();

      api.postEvent(
        `Following problems were found while scanning the bundle ${bundle.name}: ${scanner.errors.format()}`, 
        SeverityEnum.ERROR
      );

      if (context.onFileMissing) {
        const missingErrorId = pickMissingErrorId(scanner.errors.getErrors());
        if (missingErrorId) {
          context.onFileMissing(bundle.target, missingErrorId);
        }
      }

      reject(error.id, error.message);
    } else {
      accept(undefined);
    }

    return scanner;
  };

  const getShareDirectoryAddedHandler = (postEventApi: boolean) => {
    const onShareDirectoryAdded: HookCallback<SharePathHookData> = async ({ path, new_parent }, accept, reject) => {

      const errorLogger = getMemoryErrorLogger(false);

      const scanner = Scanner(configGetter().validators, errorLogger.logger, pathValidator(false), context.isPathAccepted);
      await scanner.scanPath(path, false);

      logCompletedDebug(scanner, 'New share directory scan completed');
      if (scanner.errors.count()) {

        if (postEventApi) {
          const errorMessage = `Following problems were found while scanning the share directory ${path}: ${scanner.errors.format()}`;
          api.postEvent(
            errorMessage, 
            SeverityEnum.ERROR
          );
        }

        const error = scanner.errors.pickOne();
        reject(error.id, errorLogger.getLog());
      } else {
        accept(undefined);
      }

      return scanner;
    };

    return onShareDirectoryAdded;
  };

  const scanShareRoots = async (ids: string[]) => {
    const paths = [];
    for (const id of ids) {
      try {
        const shareRoot = await api.getShareRoot(id);
        paths.push(shareRoot.path);
      } catch (e) {
        logger.info(`Failed to fetch share root information: ${e} (id ${id})`);
      }
    }

    return await scanPathsManual(paths);
  };

  const scanOwnFilelistDirectories = async (ids: number[], entityId: string) => {
    const paths = [];
    for (const id of ids) {
      try {
        const filelistItem = await api.getFilelistItem(id, entityId);
        if (filelistItem.type.id !== 'directory' || !filelistItem.dupe) {
          continue;
        }

        if (filelistItem.path === '/') {
          return scanShare();
        }

        paths.push(...filelistItem.dupe.paths);
      } catch (e) {
        logger.info(`Failed to fetch filelist item: ${e} (id ${id})`);
      }
    }

    if (!paths.length) {
      return getEmptyScanner();
    }

    return scanPathsManual(paths);
  };

  const stop = () => {

  };

  return {

    scanShare,
    scanShareRoots,
    scanOwnFilelistDirectories,
    scanPath,

    onBundleFinished,
    getShareDirectoryAddedHandler,

    stop,
  };
};

export default ScanRunners;