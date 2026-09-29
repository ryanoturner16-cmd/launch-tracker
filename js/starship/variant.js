// Which Starship generation does a launch record describe? (tiny module, safe to import from the list page)
// LL2 names the configuration e.g. "Starship V3" (variant "V3"). Block 3 == V3; Block 1/2 == V1/V2.
export function starshipVariant(l) {
  const s = `${(l && l.rocket && (l.rocket.variant || '')) || ''} ${(l && l.rocket && l.rocket.full_name) || ''}`;
  if (/\b(v\s*3|block\s*3)\b/i.test(s)) return { v: 3, known: true };
  if (/\b(v\s*2|block\s*2|v\s*1|block\s*1)\b/i.test(s)) return { v: 2, known: true };
  return { v: 3, known: false }; // unknown: assume the currently flying generation (V3, since May 2026) and say so
}
