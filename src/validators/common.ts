const simpleReleaseReg = /^[A-Z0-9]\S{3,}-[A-Za-z0-9_]{2,}$/;

export const isReleaseName = (name: string) => simpleReleaseReg.test(name);

// Shared "release names allowed to have no SFV/NFO" exemption list (the
// "no_sfv_exempt_patterns" setting) -- originally only wired into
// IncompleteRelease, moved here so MissingSfv/MissingNfo respect it too. A
// DIRFIX/PROOFFIX/NFOFIX-style repack legitimately ships without an SFV or
// NFO by design; without this, MissingSfv/MissingNfo flag every one of them
// on every scan, which is noise at best and -- once manual/share scans also
// trigger an automatic redownload search on an items-missing finding --
// wasted searches and possibly a wrong re-grab at worst.
const wildcardToRegExp = (pattern: string) => {
  const escaped = pattern.trim().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
};

let exemptPatterns: RegExp[] = [];

export const setExemptPatterns = (raw: string | undefined) => {
  exemptPatterns = (raw || '')
    .split(',')
    .map(pattern => pattern.trim())
    .filter(Boolean)
    .map(wildcardToRegExp);
};

export const isExemptReleaseName = (name: string) => exemptPatterns.some(reg => reg.test(name));
