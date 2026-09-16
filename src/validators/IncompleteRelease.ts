import { isReleaseName, isExemptReleaseName, setExemptPatterns } from './common';
import { ErrorType, Validate, ValidateCondition } from '../types';

const realContentReg = /^(.+\.(r\d{2}|0\d{2}|mp3|flac|m2v|avi|mkv|mp(e)?g|iso|mp4))$/i;

const hasRealContent = (files: string[]) => files.some(file => realContentReg.test(file));

const nonContentFolderReg = /^(Sample|Proof(s)?|Cover(s)?|.{0,5}Sub(s)?)$/i;

const isNonContentFolder = (name: string) => nonContentFolderReg.test(name);

// The exempt-patterns list now lives in common.ts (shared with
// MissingSfv/MissingNfo) -- re-exported here so main.ts's existing import
// keeps working unchanged.
export { setExemptPatterns };
const isExempt = isExemptReleaseName;

const validate: Validate = async (directory, reporter) => {
  reporter.addFolder(
    directory.path,
    'incomplete_no_sfv',
    'No SFV and no real content found (only NFO plus Sample/Proof/Subs/Covers) -- likely an incomplete download',
    ErrorType.ITEMS_MISSING
  );
};

const validateCondition: ValidateCondition = directory =>
  !directory.sfvFiles.length &&
  !hasRealContent(directory.files) &&
  !!directory.nfoFiles.length &&
  !!directory.folders.length &&
  directory.folders.every(isNonContentFolder) &&
  isReleaseName(directory.name) &&
  !isExempt(directory.name);

export default {
  validateCondition,
  validate,
  setExemptPatterns,
  setting: {
    key: 'incomplete_no_sfv',
    title: 'Check for incomplete releases (no SFV)',
    help:
      'Tries to redownload a folder that has an NFO and only Sample/Proof/Subs/Covers ' +
      'subfolders, no SFV, and no real content files.',
    default_value: true,
    type: 'boolean'
  },
};
