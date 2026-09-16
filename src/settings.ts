import { SessionInfo } from 'types';

export const hasSeparateLogFileSupport = (sessionInfo: SessionInfo) => {
  return sessionInfo.system_info.api_feature_level >= 6;
};

export const getSettingDefinitions = (sessionInfo: SessionInfo) => {
  type SettingDefinition = {
    key: string;
    title: string;
    default_value: boolean | string | number;
    type: string;
    optional?: boolean;
    help?: string;
    min?: number;
    max?: number;
  };

  const SettingDefinitions: SettingDefinition[] = [
    {
      key: 'scan_finished_bundles',
      title: 'Scan finished bundles',
      default_value: true,
      type: 'boolean'
    }, {
      key: 'scan_new_share_directories',
      title: 'Scan new share directories',
      default_value: true,
      type: 'boolean'
    },
  ];

  if (hasSeparateLogFileSupport(sessionInfo)) {

    SettingDefinitions.push({
      key: 'separate_log_file',
      title: 'Open manual scan results in a separate file/tab',
      default_value: false,
      type: 'boolean'
    });
  }

  SettingDefinitions.push(
    {
      key: 'crc_delete_files',
      title: 'Delete files that fail CRC verification',
      default_value: true,
      type: 'boolean'
    }, {
      key: 'crc_redownload',
      title: 'Automatically re-search and redownload the release folder.',
      default_value: true,
      type: 'boolean'
    }, {
      key: 'search_wait_seconds',
      title: 'Seconds to wait before reading redownload search results',
      help: 'Wait time after starting a CRC/missing-file redownload search. Increase when "Search queue overflow" errors occur.',
      default_value: 15,
      type: 'number',
      min: 5,
      max: 120,
    }, {
      key: 'overflow_backoff_seconds',
      title: 'Extra pause (seconds) after a search queue overflow',
      default_value: 60,
      type: 'number',
      min: 20,
      max: 600,
    }, {
      key: 'retry_interval_minutes',
      title: 'Minutes between automatic redownload retries',
      help:
        'How long to wait before retrying a redownload search that found no sources, and between retries after ' +
        'that.',
      default_value: 60,
      type: 'number',
      min: 5,
      max: 1440,
    }, {
      key: 'retry_max_hours',
      title: 'Maximum hours to keep retrying a redownload (0 = try once)',
      help: 'How long to keep retrying a CRC/missing-file redownload search before stopping. 0 = try only once, max 168.',
      default_value: 24,
      type: 'number',
      min: 0,
      max: 168,
    }, {
      key: 'no_sfv_exempt_patterns',
      title: 'Release names allowed to have no SFV/NFO (comma-separated, * = wildcard, e.g. *.dirfix.*,*.prooffix.*)',
      default_value: '*.dirfix.*,*.prooffix.*,*.nfofix.*,*.samplefix.*,*.fix.*',
      type: 'string',
      optional: true
    }, {
      key: 'delete_junk_extra_files',
      title: 'Automatically delete known junk files found as "extra" in a release directory',
      help: 'Covers the client\'s own ".dctmp" partial-download leftovers and any file ending in "-missing". A genuinely still-downloading ".dctmp" file is left alone.',
      default_value: true,
      type: 'boolean'
    },
  );

  return SettingDefinitions;
};
