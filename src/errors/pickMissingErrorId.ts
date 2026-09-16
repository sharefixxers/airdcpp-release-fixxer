import { ErrorType } from '../types';

// Shared with ScanRunners (whole-scan level, for a just-finished bundle) and
// Scanner (per-directory level, for manual/share scans) -- picks which
// single error ID, if any, should trigger a "redownload this folder" action.
// Prefers "invalid_sfv_file" (a broken SFV itself needs redownloading before
// anything else can be checked against it), otherwise the first
// ITEMS_MISSING-type error found, if any.
export const pickMissingErrorId = (errors: { [key in string]: { type: ErrorType } }): string | null => {
  const ids = Object.keys(errors);

  if (ids.includes('invalid_sfv_file')) {
    return 'invalid_sfv_file';
  }

  return ids.find(id => errors[id].type === ErrorType.ITEMS_MISSING) || null;
};
