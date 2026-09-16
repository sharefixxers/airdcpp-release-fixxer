# airdcpp-release-fixxer

Fork of the official release validator for the client. Scans downloaded and
shared release directories for missing/extra files (CRC/SFV/NFO) and
automatically redownloads what is broken or missing.

## Detects

Via scan or automatically on new/completed downloads:

- CRC errors (file does not match the `.sfv`)
- Missing files (`file_missing`)
- Missing SFV (`sfv_missing`)
- Missing NFO (`nfo_missing`)
- Broken/unreadable SFV -- not a single valid line could be parsed from it
  (`invalid_sfv_file`)
- Folders containing only an nfo/sfv but nothing else (`no_release_files`)
- Incomplete releases where the source only ever offered a Sample and/or
  Proof plus an NFO, with no SFV and no real content at all
  (`incomplete_no_sfv`) -- these otherwise slip through undetected, since
  the client's download queue considers the bundle finished and there's no
  SFV to compare against. Configurable exemption list for release types
  that legitimately never ship an SFV (dirfix, prooffix, etc.) -- see
  Settings below.
- Plus the standard checks from the original validator: extra files,
  duplicate nfo/sfv, etc. -- these are only reported, not fixed
  automatically, since "redownload" isn't a solution for those

## Takes action on (CRC-redownload)

- **CRC error** -- the file is automatically deleted, after which the
  release folder is searched for and downloaded.
- **Broken/unreadable SFV** -- the `.sfv` file itself is deleted first
  (otherwise "file already exists on disk" would block a new download of
  it), after which the release folder is searched for and downloaded.
- **Missing file / SFV / NFO / no_release_files / incomplete_no_sfv** --
  the release folder is searched for and downloaded. Since 1.2.25-beta
  this also applies to a manual `/rvalidator scan`, a full share scan, or
  a new-share-directory scan -- not just a just-finished download --
  triggered per affected folder as each one is scanned (still gated by
  `crc_redownload`).

## Chat commands

- `/rvalidator scan` -- scan the entire share.
- `/rvalidator scan <path>` -- scan only that specific folder.
- `/rvalidator accept <path>` -- accept that folder as final; no check
  will flag it again, and no further automatic redownload for it.
- `/rvalidator unaccept <path>` -- undo `/rvalidator accept` for that
  folder.
- `/rvalidator help`

Since 1.2.26-beta, the accepted-releases list is automatically pruned at
startup: an accepted path that no longer exists on disk (folder deleted,
renamed by hand, etc.) is dropped, so the list doesn't grow forever with
entries for releases that aren't there anymore.

## Smart features

- Background redownload searches use the lowest search priority (1), so
  manual searches/downloads from the client UI always get sent to the
  hub first.
- One-at-a-time queue -- prevents "Search queue overflow".
- Subs/Sub/SUBPACK folders: still searched, but no warning if nothing is
  found.
- Reports itself in the system log when the client starts, listing the
  available commands.
- Node.js DEP0169 deprecation warning suppressed; all other warnings
  still print normally.

## Settings

`crc_delete_files`, `crc_redownload` (both on by default),
`incomplete_no_sfv` (on by default -- toggles the check described
above).

- **Seconds to wait before reading redownload search results**
  (`search_wait_seconds`, default 15) -- how long a CRC/missing-file
  redownload search waits after being sent before its results are read.
  Increase if you see "Search queue overflow" errors. Was hardcoded at 15
  seconds before 1.2.26-beta.
- **Extra pause (seconds) after a search queue overflow**
  (`overflow_backoff_seconds`, default 60) -- when a redownload search
  itself fails with a "Search queue overflow" error, this extra pause is
  added before anything else is searched for, to let the hub's own
  flood-protection cool down. New in 1.2.26-beta -- previously an overflow
  error was only logged, with no backoff at all.
- **Minutes between automatic redownload retries** (`retry_interval_minutes`,
  default 60) and **maximum hours to keep retrying** (`retry_max_hours`,
  default 24, `0` = try once, no retries) -- when a redownload search finds
  no sources, it's retried on this interval until either a source is found
  or the time budget runs out. Each retry first checks that the release
  folder still exists on disk, and cancels itself (no more retries) if it
  doesn't -- e.g. the release was deleted, fixed by hand, or already
  redownloaded some other way in the meantime. New in 1.2.26-beta --
  previously a redownload search that found nothing gave up permanently
  until something else (a later scan, a new CRC error) happened to trigger
  it again.
- **Release names allowed to have no SFV/NFO** (`no_sfv_exempt_patterns`)
  -- comma-separated list, `*` matches any run of characters, e.g.
  `*.dirfix.*,*.prooffix.*,*.nfofix.*,*.samplefix.*,*.fix.*` (the shipped default). Matched against the whole release folder
  name, case-insensitive. A folder matching one of these is never
  flagged by the `incomplete_no_sfv` check, regardless of its content.
  Tip: real release names usually put a hyphen (not a dot) before the
  group tag, so a pattern like `*dirfix*` (no surrounding dots) matches
  more reliably than `*.dirfix.*` unless you've checked the exact naming
  your sources use. Takes effect immediately, no restart needed. Since
  1.2.25-beta this also exempts a matching folder from the `sfv_missing`
  and `nfo_missing` checks, not just `incomplete_no_sfv` -- previously
  those two ignored this setting entirely, so a repack type that
  legitimately never ships an SFV/NFO still got flagged (and, once
  scan-triggered redownload covered manual/share scans, would have kept
  triggering pointless redownload searches for it too).
- **Automatically delete known junk files found as "extra" in a release
  directory** (`delete_junk_extra_files`, on by default) -- covers
  the client's own `.dctmp` partial-download leftovers and any file ending
  in `-missing`, neither of which is ever real release content. A
  matched file is only deleted if it hasn't been modified in the last 2
  minutes, so a `.dctmp` file that's genuinely still downloading (its
  mtime keeps updating as data arrives) is left alone and picked up on a
  later scan instead. Deletion is silent by design -- it's not reported
  as a problem in the scan results, so a bundle that only had junk
  extras isn't wrongly rejected for something that's already been
  cleaned up. Turn this off to have those files reported as ordinary
  extra files instead, same as before.

## Conflict check with the original validator

At every startup, this checks whether `airdcpp-release-validator` (the
extension it was forked from) is also installed and enabled, and if so,
automatically disables its autostart. Running both at once means they'd
react independently to the same downloads/share scans -- doubling up
redownload searches and search-queue pressure.

This is deliberately conservative:

- It only disables autostart, never uninstalls/removes the other
  extension -- fully reversible anytime in Settings > Extensions.
- It never blocks release-fixxer's own startup, even if the check or the
  disable itself fails (most likely a missing `admin` permission) -- a
  warning is logged in that case instead.
- It only affects *autostart*. If the original validator is already
  running in the current client session when this check runs, restart
  the client (or stop it manually) for the disable to fully take effect this
  session.
- It runs on every startup, so if the original validator is ever manually
  re-enabled, it gets disabled again the next time the client starts.

## Works together with

Works independently from `airdcpp-sample-proof-checker`, which
specifically checks Sample/Proof subfolders. Works together with
`airdcpp-sfv-folder-checker`: that extension writes a JSON report this
extension can read, and it also detects CRC mismatches at the file level
itself.

## What is new in each version
[Changelog](https://github.com/sharefixxers/airdcpp-release-fixxer/blob/master/CHANGELOG.md)

## Troubleshooting
Enable extension debug mode from application settings and check the extension error logs
`(Settings\Extensions\airdcpp-release-fixxer\logs)` for additional information.
