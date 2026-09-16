import path from 'node:path';
import fs from 'node:fs';

import { APISocket } from 'airdcpp-apisocket';

export interface CrcRedownloadSettings {
  getDeleteFiles: () => boolean;
  getRedownload: () => boolean;
  getSearchWaitSeconds: () => number;
  getOverflowBackoffSeconds: () => number;
  getRetryIntervalMinutes: () => number;
  getRetryMaxHours: () => number;
}

type LogSeverity = 'info' | 'warning' | 'error';

interface QueueItem {
  path: string;
  silentIfNotFound: boolean;
}

interface RetryEntry {
  attempts: number;
  timer: ReturnType<typeof setTimeout>;
}

const isSubsFolder = (dirPath: string) => {
  const name = path.basename(dirPath).toLowerCase();
  return name === 'subs' || name === 'sub' || name.includes('subpack');
};

// Prefer a result whose name matches the searched folder exactly
// (case-insensitive) over whatever happens to be first in the list --
// a loose hub search on just the folder name can return other, unrelated
// results ranked above the actual release. Falls back to the first result
// if nothing matches exactly, since something is still better than nothing.
export const pickBestResult = <T extends { name?: string }>(results: T[], expectedName: string): T => {
  const exactMatch = results.find(r => r.name && r.name.toLowerCase() === expectedName.toLowerCase());
  return exactMatch || results[0];
};

const CrcRedownload = (socket: APISocket, settings: CrcRedownloadSettings) => {
  const lastQueuedAt = new Map<string, number>();
  const pendingPaths = new Set<string>();
  const queue: QueueItem[] = [];
  const retryState = new Map<string, RetryEntry>();
  let running = false;

  const postLog = async (text: string, severity: LogSeverity = 'info') => {
    try {
      await socket.post('events', { text, severity });
    } catch (e: any) {
      console.error(`Could not send event message: ${e.message}`);
    }
  };

  // Returns whether a source was actually found and queued for download.
  const searchAndDownload = async (folderPath: string, silentIfNotFound: boolean): Promise<boolean> => {
    const parentDir = path.dirname(folderPath);
    const folderName = path.basename(folderPath);

    let search: { id: string };
    try {
      search = await socket.post('search', undefined);
    } catch (e: any) {
      await postLog(`[CRC-redownload] Could not start a search for folder ${folderName}: ${e.message}`, 'error');
      return false;
    }

    try {
      try {
        await socket.post(`search/${search.id}/hub_search`, {
          query: {
            pattern: folderName,
            file_type: 'directory',
          },

          priority: 1,
        });
      } finally {

        await new Promise(resolve => setTimeout(resolve, 1000 * settings.getSearchWaitSeconds()));
      }

      const results: Array<{ id: string; name?: string }> = await socket.get(`search/${search.id}/results/0/5`);
      if (!results || results.length === 0) {
        if (!silentIfNotFound) {
          await postLog(`[CRC-redownload] No sources found for folder: ${folderName}`, 'warning');
        }
        return false;
      }

      const best = pickBestResult(results, folderName);
      await socket.post(`search/${search.id}/results/${best.id}/download`, {
        target_name: folderName,
        target_directory: parentDir + path.sep,
      });

      await postLog(
        `[CRC-redownload] Re-queued folder for download: ${folderName} (${results.length} source(s) found)`,
        'info'
      );
      return true;
    } catch (e: any) {
      await postLog(`[CRC-redownload] Search/download failed for folder ${folderName}: ${e.message}`, 'error');

      if (e && e.message && /overflow/i.test(e.message)) {
        const backoffMs = 1000 * settings.getOverflowBackoffSeconds();
        await postLog(
          `[CRC-redownload] Pausing ${Math.round(backoffMs / 1000)}s after a search queue overflow...`,
          'warning'
        );
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }

      return false;
    } finally {
      try {
        await socket.delete(`search/${search.id}`);
      } catch (e) {

      }
    }
  };

  // Pushes a folder onto the shared, serialized search queue -- used both
  // for a fresh redownload request and for a scheduled retry, so the two
  // can never run their searches concurrently with each other (keeping the
  // "one search at a time" behavior that avoids "Search queue overflow").
  const enqueue = (folderPath: string, silentIfNotFound: boolean) => {
    if (pendingPaths.has(folderPath)) {
      return;
    }

    pendingPaths.add(folderPath);
    queue.push({ path: folderPath, silentIfNotFound });

    processQueue();
  };

  const stopRetrying = (folderPath: string) => {
    const state = retryState.get(folderPath);
    if (state) {
      clearTimeout(state.timer);
      retryState.delete(folderPath);
    }
  };

  // Schedules another attempt after a search that found nothing, up to
  // "retry_max_hours" worth of attempts (0 = give up after the first try,
  // same as before this existed). Each attempt re-checks that the release
  // folder still exists before searching again -- it may have been deleted,
  // fixed manually, or already redownloaded some other way in the meantime.
  const scheduleRetry = (folderPath: string, silentIfNotFound: boolean) => {
    const intervalMinutes = Math.max(5, settings.getRetryIntervalMinutes() || 60);
    const maxHours = Math.max(0, settings.getRetryMaxHours() || 0);

    if (maxHours <= 0) {
      return;
    }

    const maxAttempts = Math.max(1, Math.round((maxHours * 60) / intervalMinutes));
    const intervalMs = 60000 * intervalMinutes;

    const existing = retryState.get(folderPath);
    const attempts = existing ? existing.attempts : 0;

    if (attempts >= maxAttempts) {
      retryState.delete(folderPath);
      postLog(
        `[CRC-redownload] Giving up searching for folder after ${attempts} attempt(s) (~${maxHours}h): ${path.basename(folderPath)}`,
        'warning'
      );
      return;
    }

    if (existing) {
      clearTimeout(existing.timer);
    }

    const timer = setTimeout(async () => {
      let folderExists = true;
      try {
        await fs.promises.access(folderPath);
      } catch (e) {
        folderExists = false;
      }

      if (!folderExists) {
        retryState.delete(folderPath);
        await postLog(
          `[CRC-redownload] Release folder no longer exists -- canceling redownload retry for: ${path.basename(folderPath)}`,
          'info'
        );
        return;
      }

      enqueue(folderPath, silentIfNotFound);
    }, intervalMs);

    retryState.set(folderPath, { attempts: attempts + 1, timer });
  };

  const processQueue = async () => {
    if (running) {
      return;
    }

    running = true;
    while (queue.length > 0) {
      const item = queue.shift() as QueueItem;
      pendingPaths.delete(item.path);
      lastQueuedAt.set(item.path, Date.now());

      const found = await searchAndDownload(item.path, item.silentIfNotFound);
      if (found) {
        stopRetrying(item.path);
      } else {
        scheduleRetry(item.path, item.silentIfNotFound);
      }
    }
    running = false;
  };

  const redownloadFolder = (folderPath: string) => {
    const normalized = folderPath.replace(/[\\/]+$/, '');

    const lastAt = lastQueuedAt.get(normalized);
    if (lastAt && Date.now() - lastAt < 5 * 60 * 1000) {
      // Already (re)queued this exact folder in the last 5 minutes
      return;
    }

    enqueue(normalized, isSubsFolder(normalized));
  };

  // Hook: a file failed hashing/verification
  const onHasherFileFailed = async (data: { error_id: string; path: string }) => {
    if (data.error_id !== 'crc_error') {
      return;
    }

    if (settings.getDeleteFiles()) {
      try {
        await fs.promises.unlink(data.path);
        await postLog(`[CRC-redownload] Deleted due to CRC error: ${data.path}`, 'warning');
      } catch (e: any) {
        await postLog(`[CRC-redownload] Could not delete file (${data.path}): ${e.message}`, 'error');
        return;
      }

      if (settings.getRedownload()) {
        redownloadFolder(path.dirname(data.path));
      }
    } else {
      await postLog(`[CRC-redownload] CRC error detected (not deleted, disabled in settings): ${data.path}`, 'warning');
    }
  };

  const onFileMissing = async (folderPath: string, errorId: string) => {
    if (!settings.getRedownload()) {
      return;
    }

    if (errorId === 'invalid_sfv_file') {

      let entries: fs.Dirent[] | undefined;
      try {
        entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
      } catch (e: any) {
        await postLog(`[CRC-redownload] Could not read folder to delete broken SFV (${folderPath}): ${e.message}`, 'error');
      }

      if (entries) {
        for (const entry of entries) {
          if (entry.isFile() && entry.name.toLowerCase().endsWith('.sfv')) {
            const sfvPath = path.join(folderPath, entry.name);
            try {
              await fs.promises.unlink(sfvPath);
              await postLog(`[CRC-redownload] Deleted broken SFV (no valid lines): ${sfvPath}`, 'warning');
            } catch (e: any) {
              await postLog(`[CRC-redownload] Could not delete broken SFV (${sfvPath}): ${e.message}`, 'error');
            }
          }
        }
      }
    }

    redownloadFolder(folderPath);
  };

  return {
    start: () => {
      socket.addListener('hash', 'hasher_file_failed', onHasherFileFailed);
    },
    onFileMissing,
    redownloadFolder,
  };
};

export type CrcRedownloadType = ReturnType<typeof CrcRedownload>;

export default CrcRedownload;
