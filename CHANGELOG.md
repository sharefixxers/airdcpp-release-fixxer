## Notes (1.2.28-beta)

Cosmetic-only pass, requested directly: every user-facing/prose mention
of the "AirDC++" product name (in code comments, log messages, and this
file's own changelog/docs) is now generic "the client" instead, since
this extension family targets both AirDC++ and FulDC++. Left untouched
by design: technical identifiers that have to keep the literal name
(npm dependency names, this package's own name/keywords/repository
fields -- required to start with `airdcpp-` for the settings-registration
API to work, see "Notes (1.2.10-beta)" below -- and the `airdcpp` block
in `package.json`), plus the parts of `README.md` and all of
`CHANGELOG.md` that are the original upstream `airdcpp-release-validator`
project's own text, kept here for reference/build instructions rather
than written by this extension's author. No functional change; 50/50
tests still pass, `tsc --noEmit` clean.

## Notes (1.2.27-beta)

Cosmetic-only pass over the Settings screen text, requested directly:
shortened/reworded several help texts (search-wait, retry-max-hours,
delete-junk-extra-files) and removed the help text on the
overflow-backoff setting entirely. No functional change -- all keys,
defaults and min/max values are unchanged.

## Notes (1.2.26-beta)

Five incremental fixes, all from a "just for fun" brainstorm about the
remaining hardcoded/rough spots in the redownload-search machinery
(`CrcRedownload.ts`) and the accepted-releases list:

- **Automatic retry for a redownload search that finds nothing.** Before
  this, a CRC error, missing SFV/NFO, etc. that triggered a search with no
  results available *right then* just gave up for good -- nothing brought
  it back unless some unrelated event (a later scan, a fresh CRC error)
  happened to retrigger it. New settings `retry_interval_minutes` (default
  60) and `retry_max_hours` (default 24, `0` = disable retries) now retry
  on a timer, same pattern already used by `airdcpp-sample-proof-checker`.
  Each retry re-checks that the release folder still exists before
  searching again, and cancels itself the moment it doesn't.
- **"Search queue overflow" backoff.** A redownload search that itself
  fails with an overflow error now pauses for an extra
  `overflow_backoff_seconds` (default 60) before anything else is
  searched for, instead of just logging the error and moving straight on
  to the next thing -- same backoff `airdcpp-sample-proof-checker` already
  had for its own searches.
- **`search_wait_seconds` is now a real, live setting** (default 15,
  matching the old hardcoded value) instead of being hardcoded in
  `main.ts` behind what looked like a configurable interface.
- **The best search result is no longer picked blindly.** `results[0]` is
  now only used as a fallback -- if any result's name matches the searched
  folder name exactly (case-insensitive), that one is downloaded instead,
  reducing the chance of grabbing a wrong/mismatched folder from a loosely
  matching search.
- **The accepted-releases list now prunes itself.** At startup, any
  accepted path that no longer exists on disk is dropped from
  `accepted-releases.json` -- previously the list only ever grew, keeping
  entries for releases long since deleted or renamed.

New unit tests added for all of this (`tests/CrcRedownload.test.ts`,
`tests/AcceptedReleases.test.ts`) -- the retry/overflow-backoff tests use
Jest's fake timers plus a mocked `fs.promises.access` (real disk I/O
doesn't play well with fake timers) to deterministically verify the
retry-until-give-up sequence, the folder-disappeared cancellation, and the
`retry_max_hours: 0` = try-once behavior. All 50 tests pass, `tsc --noEmit`
clean.

## Notes (1.2.25-beta)

Three changes, all from real scan output showing findings that either
should have been fixed automatically or weren't being redownloaded when
they should have been:

- **SFV/NFO-missing findings now trigger redownload on manual and share
  scans too, not just freshly finished downloads.** Previously,
  `context.onFileMissing` (the "search the whole folder and redownload
  it" action, gated by `crc_redownload`) was only ever wired to
  `onBundleFinished` and the new-share-directory hook -- a manual
  `/rvalidator scan`, `/rvalidator scan <path>`, or a full share scan
  found the same problems but never acted on them. Fixed by tracking
  which error types were reported *per directory* during a scan (as
  opposed to only a scan-wide total, which would be useless across a
  share scan spanning many unrelated folders) and firing the same
  redownload action per flagged folder as each one is scanned.
- **`no_sfv_exempt_patterns` now also applies to the `sfv_missing` and
  `nfo_missing` checks**, not just `incomplete_no_sfv`. This was a
  pre-existing gap that became a real problem together with the above:
  without it, a legitimately SFV/NFO-less repack type (dirfix, prooffix,
  etc.) would now also trigger a redownload search on every manual/share
  scan, repeatedly, for something that was never broken.
- **Known junk files reported as "extra" are now deleted automatically**
  instead of just being flagged: the client's own `.dctmp` partial-download
  leftovers, and any file ending in `-missing`. Gated by a new
  `delete_junk_extra_files` setting (on by default) with a 2-minute
  staleness check before deleting anything, so an actively-downloading
  `.dctmp` file is never touched. See Settings below for the full
  behavior and how to turn it off.

## Notes (1.2.24-beta)

Cosmetic fix in `ScanRunners.ts`: the manual-scan status message for a single path ("Scanning the path X...") had a literal trailing "..." hardcoded right after the path, regardless of the actual path. Removed. The multi-path variant ("Scanning N paths...") keeps its "..." -- that one follows static text, not a raw value, and reads as an intentional "in progress" indicator rather than a truncated value.

## Notes (1.2.21-beta)

Doc-only fix: the 1.2.9-beta note said "Renamed the package from
`airdcpp-release-fixxer` to `airdcpp-release-fixxer`" -- both names were
the same due to a copy/paste error, the second one should have read
`dce-release-fixxer` (see that note's own explanation, and 1.2.10-beta
for the revert). Line removed rather than corrected, since 1.2.10-beta
already covers the revert back to `airdcpp-release-fixxer` in full. No
functional change.

## Notes (1.2.20-beta)

The 1.2.19-beta fix (an exact `overrides` pin plus a `tsconfig.json`
`paths` redirect pointing at the real `airdcpp-apisocket` file inside
`node_modules`) turned out not to be enough -- it still failed with the
exact same `TS7016: Could not find a declaration file` error on a real
build elsewhere, which meant that machine's `node_modules` genuinely
never had a usable declaration file for `airdcpp-apisocket` to redirect
to in the first place (regardless of the version-pinning). This release
removes that dependency entirely: a full, unmodified copy of the real
`airdcpp-apisocket` type declarations now lives in this project's own
`src/types/airdcpp-apisocket-vendor/`, and `tsconfig.json`'s `paths`
entry points there instead of into `node_modules`. Type-checking no
longer depends on what `npm install` happens to resolve for this
package on any given machine. Verified two ways: with a normal
`node_modules` install (types resolve fine either way, no conflict),
and with the real `node_modules` declaration files deliberately deleted
to reproduce the reported failure directly (0 errors either way,
`tsc --noEmit`, the real webpack build, and the full 29-test Jest suite
all pass). No functional/runtime change -- this only affects
compile-time type-checking.

## Notes (1.2.19-beta)

Build-robustness fix, no functional change: `airdcpp-apisocket` (a
transitive dependency, pulled in via `airdcpp-extension`) ships a
package.json `exports` map with no `types` condition, so whether
TypeScript can find its type declarations at all depends on subtle,
version-specific fallback behavior -- this built and type-checked fine
in testing here, but failed with `TS7016: Could not find a declaration
file for module 'airdcpp-apisocket'` (and a cascade of ~19 follow-on
implicit-any errors from it) in a real build elsewhere. Fixed two ways:
added an exact `overrides` pin for `airdcpp-apisocket` so the same
known-good version is always installed regardless of what
`airdcpp-extension` itself requests, and added a `tsconfig.json`
`paths` entry that points TypeScript directly at that version's real
declaration file for type-checking purposes only (webpack/ts-loader's
actual runtime module resolution is untouched). Also pinned
`typescript` itself to an exact, current version rather than a
`^5.0.2` range, since TypeScript's "bundler" module resolution mode
(used by this project) was new in 5.0 and has had resolution-fallback
refinements since. Verified with a full clean `node_modules` reinstall,
a standalone `tsc --noEmit` pass, the normal webpack build, and the
Jest suite (still 29/29 passing).

## Notes (1.2.18-beta)

Version bump only, doc cleanup: removed remaining references to the
project's original development language/origin from the docs. No
source code changed; all 29 tests still pass and the built bundle
behaves identically.

## Notes (1.2.17-beta)

Version bump only, to mark a documentation cleanup as its own release:
the top `README.md` note was rewritten in plain English, and a
`.gitignore` merge error from packaging this project for GitHub
(`node_modules/` had accidentally been glued onto the previous line,
`/*.txt`, so it wasn't actually being ignored) was fixed. No source
code changed; all 29 tests still pass and the built bundle behaves
identically.

## Notes (1.2.16-beta)

Fixed a bug where `/rvalidator help` produced no response at all.
The client delivers `/rvalidator help` as command `rvalidator` with `help`
as an argument, never as a bare command `help` -- but the help text
lived under its own top-level switch case that could only ever match a
literal, undocumented `/help`, so the documented `/rvalidator help`
fell through every branch and silently did nothing. Moved the help
response inside the `rvalidator` case itself, alongside
scan/accept/unaccept, so it now also fires on a bare `/rvalidator` with
no arguments at all. No other functional change.

## Notes (1.2.15-beta)

Added a way to manually accept a release folder as final and,
separately, a native-backed way to force a rejected download straight
into the share. Two independent additions:

- `/rvalidator accept <path>` and `/rvalidator unaccept <path>` -- put a
  real disk path on (or take it off) a small persisted exemption list.
  Once accepted, every check -- manual scan, automatic on completed
  download, and automatic on new share directory -- skips that exact
  folder entirely (subfolders are not exempted, so a multi-disc release
  with one bad disc is still checked disc by disc). Useful for something
  like an NFO-less release where an NFOFIX is expected to show up later:
  accept the folder so it stops being flagged while that's pending. The
  list survives an extension or client restart (stored in this
  extension's own config folder) and is not exposed as a regular
  setting, since a free-text list of full disk paths, potentially many
  and always machine-written, doesn't fit the Settings dialog well.
- Right-click "Accept and force into share (bypass validation)" on a
  bundle in the Download Queue screen -- only offered when that bundle
  is actually stuck in a failed-validation state. Adds it to the
  accepted-paths list above, then pushes it into the share via the client's
  own native `POST queue/bundles/:id/share` call with `skip_validation`,
  the same mechanism the client's own Queue screen itself offers for a
  bundle stuck there -- no custom sharing logic of this extension's own.
  Accepting first (rather than just calling that API directly) matters
  because the client runs its "Scan new share directories" hook right after
  a bundle is shared, regardless of `skip_validation` -- without the
  accept, this extension's own hook could immediately re-flag the same
  folder a moment later.

No changes to any existing check, setting, or the automatic
CRC-redownload behavior.

## Notes (1.2.13-beta)

Fixed a typo in the "Release names allowed to have no SFV" setting: the example was `*.proofix.*`, but the real release tag is `PROOFFIX` (double F). Also gave `no_sfv_exempt_patterns` a sensible non-empty default instead of shipping empty: `*.dirfix.*,*.prooffix.*,*.nfofix.*,*.samplefix.*,*.fix.*`. These are all release types that legitimately ship with only an NFO and a Sample/Proof subfolder (no SFV, no real content) by design, not because the download is broken -- e.g. a SAMPLEFIX release with just an NFO and a Sample folder was being wrongly flagged as `incomplete_no_sfv` before this. Existing installs keep whatever value they already have in this setting; the new default only applies on a fresh install.

## Notes (1.2.12-beta)

Added a "files": ["dist"] field to package.json. Without it, `npm pack`
(or an eventual `npm publish`) would include everything not explicitly
excluded by .npmignore -- CHANGELOG.md, jest.config.js, tsconfig.json,
webpack.config.cjs -- none of which the extension needs at runtime,
since `dist/main.js` is a self-contained webpack bundle with all
dependencies already inlined. Packaging is smaller and cleaner now; no
functional change.

## Notes (1.2.11-beta)

Shortened the "Check for incomplete releases (no SFV)" setting's help
text at the user's request -- from a longer explanation covering the
NFO requirement, the Sample-folder-without-NFO exception, and the
conditional re-download behavior, down to one plain sentence: "Tries to
redownload a folder that has an NFO and only Sample/Proof/Subs/Covers
subfolders, no SFV, and no real content files." Note that the actual
redownload still only happens if "Automatically re-search and
redownload the release folder" is also on -- this check alone detects
and flags, same as before; only the help text changed. No other
functional change.

## Notes (1.2.10-beta)

Reverted the 1.2.9-beta rename: back to `airdcpp-release-fixxer`. Turns
out the official "name must start with airdcpp-" requirement is real
after all, just narrower than a quick test had suggested -- a minimal
test extension with no settings (`dce-hello-fixxer`) loaded, ran, and
handled chat commands fine under a non-`airdcpp-`-prefixed name, which
looked like proof the whole requirement was obsolete. But every real
extension in this family uses settings, and the client rejects the
settings-registration API call (`POST extensions/<name>/settings/
definitions`) for a non-`airdcpp-`-prefixed name -- confirmed with an
isolated one-line diff (only `name`/`version` changed, nothing else)
that reproduced a clean crash: a 400 on that endpoint, silently
swallowed by the settings library, followed by a hard crash the moment
any setting was read. Confirmed consistent even after a full client
restart, so not a one-time registration race either. Back to
`airdcpp-` for good. No functional change otherwise.

## Notes (1.2.9-beta)

The client's official extension spec says a package name "must start with
airdcpp-", but that turned out to only apply to extensions published
through npm's own registry and picked up via the client's in-app update
checker -- a locally-installed or FulDC++-catalogue extension with a
non-`airdcpp-`-prefixed name loads and runs identically (confirmed with
a small purpose-built test extension, installed manually and via
`dce-tiny-fileserver`'s auto-install, in a real client, version 4.30). Since this
whole family is only ever installed that way, `dce-` (Direct Connect
Extension) reads better than a name implying it only works with one
specific client. No functional change otherwise -- everything below the
`dce-` rename still behaves exactly as before.

## Notes (1.2.8-beta)

Added `repository` and `bugs` fields to `package.json`, pointing at this
fork's own GitHub source (placeholder URL -- replace
`YOUR-USERNAME-HERE` with the real account/repo before actually running
`npm publish`) instead of the upstream `airdcpp-release-validator`
project's repo, which is where they incorrectly still pointed (and, as
written, weren't even a valid git URL). Also flipped `private` from
`true` back to `false`, in preparation for an eventual real npm
publish -- see "A note on `private: true`" below for why this
reintroduces a previously-fixed cosmetic issue until that publish
actually happens.

## Notes (1.2.7-beta)

Shortened the `incomplete_no_sfv` setting's title from a long
one-line description to just "Check for incomplete releases (no SFV)"
-- it was getting cut off in the client's Settings dialog. The detail
that was in the title (NFO required, automatic redownload only on a
freshly-finished download, manual scans only report) moved into the
setting's help text instead. No behavior change.

## Notes (1.2.6-beta)

Removed two settings that were rarely worth touching, in favor of
just always doing the sensible thing:

- "Log actions to the system log" (`crc_log_events`) -- was on by
  default anyway; the CRC-redownload actions it gated are now always
  logged.
- "Ignore files/directories that are excluded from share"
  (`ignore_excluded`) -- defaulted to on on Windows, off elsewhere.
  Now always off (never ignore), since skipping a check for content
  you deliberately downloaded made little sense as a default.

Neither is a behavior change for most setups -- both settings kept
their default value, just without a way to turn them off anymore.

## Notes (b1.2.5)

Added the `incomplete_no_sfv` check: a release folder with no SFV, no
real content at the top level, and only a Sample and/or Proof (or
Cover/Sub) subfolder alongside its NFO is now treated the same as a
missing-file release and re-searched/redownloaded. Previously this case
was invisible to every existing check -- `sfv_missing` only looks at
top-level files, and `no_release_files` only fires when there are no
subfolders at all. A folder consisting only of disc-style subfolders
(CD1/CD2/DISC1/...) is deliberately never flagged by this check, since
that's a normal structure checked per-subfolder instead. Configure
`no_sfv_exempt_patterns` for release types that legitimately never ship
an SFV.

## A note on `private: true`

`package.json` currently has `"private": false` -- flipped back from
`true` in 1.2.8-beta to prepare for an eventual real `npm publish`.
Until that publish actually happens, this brings back a small cosmetic
issue that `private: true` had deliberately fixed: the client checks
npmjs.org for updates to installed extensions, and since this package
still isn't actually published there, that check will fail with a 404
again (harmless, just a log line). If this extension is being installed
from source/zip rather than through an actual npm publish, setting
`private` back to `true` removes that log line with no other effect.
