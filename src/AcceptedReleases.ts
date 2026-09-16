import * as fs from 'fs/promises';
import path from 'node:path';

const normalize = (targetPath: string) => {
  return path.resolve(targetPath).replace(/[\\/]+$/, '').toLowerCase();
};

export interface AcceptedReleasesStore {
  load: () => Promise<void>;
  isAccepted: (targetPath: string) => boolean;
  // Returns true if this was a new entry (false if it was already accepted).
  accept: (targetPath: string) => Promise<boolean>;
  // Returns true if it had been accepted (false if it wasn't on the list).
  unaccept: (targetPath: string) => Promise<boolean>;
  // Drops entries whose path no longer exists on disk. Returns how many were removed.
  prune: () => Promise<number>;
}

const AcceptedReleases = (
  stateFilePath: string,
  logger: { verbose: (message: string) => void },
): AcceptedReleasesStore => {

  const accepted = new Map<string, string>();

  const save = async () => {
    try {
      await fs.writeFile(stateFilePath, JSON.stringify(Array.from(accepted.values()), null, 2), 'utf8');
    } catch (e) {
      logger.verbose(`Failed to save the accepted releases list: ${e}`);
    }
  };

  const load = async () => {
    let data;
    try {
      data = await fs.readFile(stateFilePath, 'utf8');
    } catch (e) {

      return;
    }

    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        for (const targetPath of parsed) {
          if (typeof targetPath === 'string' && targetPath) {
            accepted.set(normalize(targetPath), targetPath);
          }
        }
      }
    } catch (e) {
      logger.verbose(`Failed to parse the accepted releases file, starting empty: ${e}`);
    }
  };

  const isAccepted = (targetPath: string) => accepted.has(normalize(targetPath));

  const accept = async (targetPath: string) => {
    const key = normalize(targetPath);
    const wasAccepted = accepted.has(key);
    accepted.set(key, targetPath);
    await save();
    return !wasAccepted;
  };

  const unaccept = async (targetPath: string) => {
    const key = normalize(targetPath);
    const wasAccepted = accepted.delete(key);
    if (wasAccepted) {
      await save();
    }
    return wasAccepted;
  };

  // An accepted path that's since been deleted (release removed, folder
  // renamed by hand, etc.) has no reason to stay on the list forever --
  // drops anything that no longer exists on disk, one fs.access per entry.
  const prune = async () => {
    let removed = 0;

    for (const [key, targetPath] of Array.from(accepted.entries())) {
      try {
        await fs.access(targetPath);
      } catch (e) {
        accepted.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      await save();
    }

    return removed;
  };

  return {
    load,
    isAccepted,
    accept,
    unaccept,
    prune,
  };
};

export default AcceptedReleases;
