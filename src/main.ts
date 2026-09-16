'use strict';

const CONFIG_VERSION = 1;

import { addContextMenuItems, APISocket } from 'airdcpp-apisocket';
import { ExtensionEntryData } from 'airdcpp-extension';
//@ts-ignore
import SettingsManager from 'airdcpp-extension-settings';

import { API } from 'api';

import ScanRunners from './ScanRunners';
import CrcRedownload from './CrcRedownload';
import AcceptedReleases from './AcceptedReleases';
import { ChatCommandData, Context, SessionInfo, SeverityEnum } from './types';
import validators from './validators';
import { setExemptPatterns as setIncompleteReleaseExemptPatterns } from './validators/IncompleteRelease';
import { setDeleteJunkExtraFiles } from './validators/SFVChecker';
import { getSettingDefinitions, hasSeparateLogFileSupport } from 'settings';

const SCAN_ACCESS = 'settings_edit';

const hasScanAccess = (permissions: string[]) => {
  return permissions.includes('admin') || permissions.includes(SCAN_ACCESS);
};

const CONFLICTING_VALIDATOR_IDS = ['airdcpp-release-validator'];

const checkForConflictingValidator = async (
  api: ReturnType<typeof API>,
  extensionName: string,
) => {
  try {
    const extensions = await api.getExtensions();
    const conflicting = extensions.find(
      (ext) => CONFLICTING_VALIDATOR_IDS.includes(ext.id) && ext.id !== extensionName && !ext.disabled,
    );
    if (!conflicting) {
      return;
    }

    try {
      await api.disableExtension(conflicting.id);
      await api.postEvent(
        `Disabled autostart for "${conflicting.id}" (the original release validator this extension was forked ` +
          `from), since running both at once can cause duplicate redownload searches and extra "Search queue ` +
          `overflow" pressure -- ${extensionName} already includes its detection features plus automatic ` +
          `CRC-redownload on top. This only stops it from starting again next time; if it's still running in ` +
          `THIS session, restart the client (or stop it manually) for that to fully take effect. Re-enable it anytime ` +
          `in Settings > Extensions if you want it back.`,
        SeverityEnum.WARNING,
      );
    } catch (disableError) {
      await api.postEvent(
        `Warning: "${conflicting.id}" (the original release validator this extension was forked from) is also ` +
          `installed and enabled, but I could not disable it automatically (missing "admin" permission for ` +
          `editing extensions, or another API error). Please disable or remove it manually in Settings > ` +
          `Extensions to avoid duplicate redownload searches.`,
        SeverityEnum.WARNING,
      );
    }
  } catch (e) {
    
    
  }
};

export default function (socket: APISocket, extension: ExtensionEntryData) {
  let runners: ReturnType<typeof ScanRunners>;

  
  extension.onStart = async (sessionInfo: SessionInfo) => {
    
    const settings = SettingsManager(socket, {
      extensionName: extension.name, 
      configFile: extension.configPath + 'config.json',
      configVersion: CONFIG_VERSION,
      definitions: [ 
        ...validators.map(validator => validator.setting),
        ...getSettingDefinitions(sessionInfo),
      ],
    });

    const validatorEnabled = ({ setting }: any) => {
      return !setting || settings.getValue(setting.key);
    };

    await settings.load();

    
    
    const acceptedReleases = AcceptedReleases(extension.configPath + 'accepted-releases.json', socket.logger);
    await acceptedReleases.load();

    const api = API(socket);

    const prunedAcceptedCount = await acceptedReleases.prune();
    if (prunedAcceptedCount > 0) {
      await api.postEvent(
        `Removed ${prunedAcceptedCount} accepted-release entr${prunedAcceptedCount === 1 ? 'y' : 'ies'} that no ` +
          `longer exist(s) on disk.`,
        SeverityEnum.INFO,
      );
    }

    
    
    
    
    
    
    const crcRedownload = CrcRedownload(socket, {
      getDeleteFiles: () => settings.getValue('crc_delete_files'),
      getRedownload: () => settings.getValue('crc_redownload'),
      getSearchWaitSeconds: () => settings.getValue('search_wait_seconds'),
      getOverflowBackoffSeconds: () => settings.getValue('overflow_backoff_seconds'),
      getRetryIntervalMinutes: () => settings.getValue('retry_interval_minutes'),
      getRetryMaxHours: () => settings.getValue('retry_max_hours'),
    });
    crcRedownload.start();

    const context: Context = {
      api,
      fetch,
      logger: socket.logger,
      extensionName: extension.name,
      generateResultLogName: () => `Share scan ${new Date().toLocaleString()}`,
      configGetter: () => {
        
        
        
        setIncompleteReleaseExemptPatterns(settings.getValue('no_sfv_exempt_patterns'));
        setDeleteJunkExtraFiles(settings.getValue('delete_junk_extra_files'));

        return {
          
          
          
          
          
          
          ignoreExcluded: false,
          separateLogFile: hasSeparateLogFileSupport(sessionInfo) ? settings.getValue('separate_log_file') : false,
          validators: validators.filter(validatorEnabled),
        };
      },
      onFileMissing: crcRedownload.onFileMissing,
      isPathAccepted: acceptedReleases.isAccepted,
      application: {
        server: extension.server,
        session: {
          token: sessionInfo.auth_token,
          tokenType: sessionInfo.token_type,
        },
        cid: sessionInfo.system_info.cid,
      }
    };

    runners = ScanRunners(context);

    
    const checkChatCommand = async (data: ChatCommandData) => {
      const { command, args, permissions } = data;
      if (!hasScanAccess(permissions)) {
        return null;
      }
  
      switch (command) {
        case 'rvalidator': {
          
          
          
          
          
          if (!args.length || args[0] === 'help') {
            return {
              severity: 'info',
              type: 'private',
              text: `

  Release validator commands

  /rvalidator scan - Scan the entire share for invalid content
  /rvalidator scan <path> - Scan only that specific folder (real disk path, not the share name)
  /rvalidator accept <path> - Accept that folder as final; no check will flag it again
  /rvalidator unaccept <path> - Undo /rvalidator accept for that folder
`
            };
          }

          if (args[0] === 'scan') {
            const targetPath = args.slice(1).join(' ').trim();
            if (targetPath) {
              runners.scanPath(targetPath);
              return {
                severity: 'info',
                type: 'system',
                text: `Scan started for "${targetPath}", see the system log for details`
              };
            }

            runners.scanShare();
            return {
              severity: 'info',
              type: 'system',
              text: 'Scan started, see the system log for details'
            };
          }

          
          
          if (!!args.length && (args[0] === 'accept' || args[0] === 'unaccept')) {
            const targetPath = args.slice(1).join(' ').trim();
            if (!targetPath) {
              return {
                severity: 'error',
                type: 'system',
                text: `Usage: /rvalidator ${args[0]} <path> (real disk path, not the share name)`
              };
            }

            if (args[0] === 'accept') {
              const isNew = await acceptedReleases.accept(targetPath);
              return {
                severity: 'info',
                type: 'system',
                text: isNew
                  ? `Accepted "${targetPath}" -- no check will flag it again, and no further automatic ` +
                    `redownload will be triggered for it. Use /rvalidator unaccept to undo.`
                  : `"${targetPath}" was already accepted.`
              };
            }

            const wasAccepted = await acceptedReleases.unaccept(targetPath);
            return {
              severity: 'info',
              type: 'system',
              text: wasAccepted
                ? `"${targetPath}" is no longer accepted -- future scans will check it normally again.`
                : `"${targetPath}" was not on the accepted list.`
            };
          }
        }
      }
  
      return null;
    };
  
    const onChatCommand = async (type: 'hub' | 'private_chat', data: ChatCommandData, entityId: string | number) => {
      const statusMessageData = await checkChatCommand(data);
      if (statusMessageData) {
        socket.post(`${type}/${entityId}/status_message`, {
          ...statusMessageData,
          owner: data.owner,
        });
      }
    };

    const subscriberInfo = {
      id: extension.name,
      name: 'Release validator',
    };

    if (settings.getValue('scan_finished_bundles')) {
      await socket.addHook('queue', 'queue_bundle_finished_hook', runners.onBundleFinished, subscriberInfo);
    }
    
    if (settings.getValue('scan_new_share_directories')) {
      
      const postEventLog = sessionInfo.system_info.api_feature_level <= 4;
      const onShareDirectoryAdded = runners.getShareDirectoryAddedHandler(postEventLog);
      await socket.addHook('share', 'new_share_directory_validation_hook', onShareDirectoryAdded, subscriberInfo);
    }
    
    await socket.addListener('hubs', 'hub_text_command', onChatCommand.bind(null, 'hubs'));
    await socket.addListener('private_chat', 'private_chat_text_command', onChatCommand.bind(null, 'private_chat'));

    addContextMenuItems<string>(
      socket,
      [
        {
          id: 'scan_missing_extra',
          title: `Scan for missing/extra files`,
          icon: {
            semantic: 'yellow broom'
          },
          access: SCAN_ACCESS,
          onClick: ({ selectedIds }) => runners.scanShareRoots(selectedIds),
        }
      ],
      'share_root',
      subscriberInfo,
    );
    
    
    if (sessionInfo.system_info.api_feature_level >= 8) {
      addContextMenuItems<number, string>(
        socket,
        [
          {
            id: 'scan_missing_extra',
            title: `Scan for missing/extra files`,
            icon: {
              semantic: 'yellow broom'
            },
            filter: ({ entityId }) => {
              return entityId === context.application.cid
            },
            access: SCAN_ACCESS,
            onClick: ({ selectedIds, entityId }) => runners.scanOwnFilelistDirectories(selectedIds, entityId),
          }
        ],
        'filelist_item',
        subscriberInfo,
      );
    }

    addContextMenuItems(
      socket,
      [
        {
          id: 'scan_missing_extra',
          title: `Scan share for missing/extra files`,
          icon: {
            semantic: 'yellow broom'
          },
          access: SCAN_ACCESS,
          onClick: async () => {
            await runners.scanShare();
          },
          filter: ({ selectedIds }) => selectedIds.includes(extension.name)
        }
      ],
      'extension',
      subscriberInfo,
    );

    
    
    
    
    
    
    
    
    
    addContextMenuItems<number>(
      socket,
      [
        {
          id: 'accept_and_force_share',
          title: `Accept and force into share (bypass validation)`,
          icon: {
            semantic: 'yellow warning circle'
          },
          access: SCAN_ACCESS,
          filter: async ({ selectedIds }) => {
            for (const token of selectedIds) {
              try {
                const bundle = await api.getQueueBundle(token);
                if (bundle.status?.id === 'completion_validation_error') {
                  return true;
                }
              } catch (e) {
                
                
              }
            }

            return false;
          },
          onClick: async ({ selectedIds }) => {
            for (const token of selectedIds) {
              let bundle;
              try {
                bundle = await api.getQueueBundle(token);
              } catch (e) {
                await api.postEvent(`Could not resolve queue item ${token}: ${e.message}`, SeverityEnum.WARNING);
                continue;
              }

              if (bundle.status?.id !== 'completion_validation_error') {
                await api.postEvent(
                  `"${bundle.name}" is not currently in a failed-validation state -- nothing to force.`,
                  SeverityEnum.WARNING,
                );
                continue;
              }

              await acceptedReleases.accept(bundle.target);

              try {
                await api.shareBundle(token, true);
                await api.postEvent(
                  `Accepted "${bundle.target}" and forced it into the share, bypassing validation. No check will ` +
                    `flag it again.`,
                  SeverityEnum.INFO,
                );
              } catch (e) {
                await api.postEvent(`Failed to force "${bundle.target}" into the share: ${e.message}`, SeverityEnum.ERROR);
              }
            }
          },
        }
      ],
      'queue_bundle',
      subscriberInfo,
    );

    
    
    await checkForConflictingValidator(api, extension.name);

    
    await api.postEvent(
      `${extension.name} started, commands /rvalidator scan and /rvalidator scan <path> are active. Type /rvalidator help for usage.`,
      SeverityEnum.INFO,
    );
  };

  extension.onStop = () => {
    
    if (runners) {
      runners.stop();
    }
  };
};
