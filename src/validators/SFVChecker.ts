import path from 'node:path';
import * as fs from 'fs/promises';
import SFVReader from '../helpers/SFVReader';
import { ErrorType, Validate, ValidateCondition } from '../types';

const audioBookExtrasReg = /^(.+\.(jp(e)?g|png|m3u|cue|zip|sfv|nfo))$/i;
const flacExtrasReg = /^(.+\.(jp(e)?g|png|m3u|cue|log|sfv|nfo))$/i;
const normalExtrasReg = /^(.+\.(jp(e)?g|png|m3u|cue|diz|sfv|nfo))$/i;

const audioBookReg = /^(.+(-|\()AUDIOBOOK(-|\)).+)$/i;
const flacReg = /^(.+(-|\()(LOSSLESS|FLAC)((-|\)).+)?)$/i;

const getExtrasReg = (name: string) => {
  if (audioBookReg.test(name)) {
    return audioBookExtrasReg;
  } else if (flacReg.test(name)) {
    return flacExtrasReg;
  }

  return normalExtrasReg;
};

const validateCondition: ValidateCondition = directory => !!directory.sfvFiles.length;

const isSfvOrNfo = (name: string) => {
  const ext = path.extname(name);
  return ext === '.nfo' || ext === '.sfv';
};

// Known junk-marker suffixes that are never real release content, however
// they got there:
// - ".dctmp" is the client's own suffix for a file that's still being
//   downloaded (renamed away automatically once the transfer finishes), so
//   its presence in a completed release just means some *other*, unrelated
//   transfer touching the same folder hasn't finished yet, or a leftover
//   fragment from an interrupted/replaced download never got cleaned up.
// - a bare "-missing" suffix appended directly onto an otherwise normal
//   filename (origin outside this extension family, but unambiguously not
//   real release content whenever it's seen).
const JUNK_EXTRA_PATTERNS = [/\.dctmp$/i, /-missing$/i];

const isJunkExtraFile = (name: string) => JUNK_EXTRA_PATTERNS.some(reg => reg.test(name));

// Safety margin before a matched junk file is actually deleted: a client
// ".dctmp" file that's genuinely still downloading has its mtime updated
// continuously as data arrives, so anything modified more recently than
// this is left alone this run rather than risking an active transfer --
// it'll be picked up (and by then almost certainly be untouched long
// enough) on a later scan if it's really still there.
const JUNK_MIN_AGE_MS = 2 * 60 * 1000;

let deleteJunkExtraFiles = true;

export const setDeleteJunkExtraFiles = (enabled: boolean) => {
  deleteJunkExtraFiles = enabled;
};

const validate: Validate = async (directory, reporter) => {

  const diskFiles: { [key in string]: string } = {};
  directory.files.forEach(name => diskFiles[name.toLowerCase()] = name);

  const reader = SFVReader(directory.path);

  let loadedSfvFiles = 0;
  await Promise.all(directory.sfvFiles.map(async (file) => {
    try {
      await reader.load(file);
      loadedSfvFiles++;
    } catch (e) {
      reporter.addFile(file, 'invalid_sfv_file', e.message, ErrorType.INVALID_CONTENT);
    }
  }));

  if (!loadedSfvFiles) {
    return;
  }

  Object.keys(reader.content).forEach(sfvFile => {
    const sfvFileLower = sfvFile.toLowerCase();

    if (!diskFiles[sfvFileLower] && !isSfvOrNfo(sfvFileLower)) {

      if (directory.ignoredFiles.some(ignoredFile => ignoredFile.toLowerCase() === sfvFileLower)) {
        reporter.addFile(sfvFile, 'file_ignored', 'File listed in the SFV file is ignored from share', ErrorType.INVALID_CONTENT);
      } else {
        reporter.addFile(sfvFile, 'file_missing', 'File listed in the SFV file does not exist on disk', ErrorType.ITEMS_MISSING);
      }

    } else {
      delete diskFiles[sfvFileLower];
    }
  });

  if (Object.keys(diskFiles).length > 0) {
    const extrasReg = getExtrasReg(directory.name);
    await Promise.all(Object.values(diskFiles).map(async (diskFile) => {
      if (deleteJunkExtraFiles && isJunkExtraFile(diskFile)) {
        const fullPath = path.join(directory.path, diskFile);
        try {
          const stat = await fs.stat(fullPath);
          if (Date.now() - stat.mtimeMs < JUNK_MIN_AGE_MS) {
            // Modified too recently to be confident it's not an active
            // client download right now -- report it as a normal extra
            // file this time instead of risking deleting something live.
            reporter.addFile(diskFile, 'extra_files', 'Extra files in release directory', ErrorType.EXTRA_ITEMS);
            return;
          }

          await fs.unlink(fullPath);
        } catch (e) {
          // Could not stat/delete (permissions, already gone, etc.) --
          // fall through and report it normally so it's still visible.
          reporter.addFile(diskFile, 'extra_files', 'Extra files in release directory', ErrorType.EXTRA_ITEMS);
        }

        return;
      }

      if (!extrasReg.test(diskFile)) {
        reporter.addFile(diskFile, 'extra_files', 'Extra files in release directory', ErrorType.EXTRA_ITEMS);
      }
    }));
  }
};

export default {
  validateCondition,
  validate,
  setting: {
    key: 'scan_sfv_file',
    title: 'Check content based on SFV files',
    default_value: true,
    type: 'boolean'
  },
}
