const BOOL_FIELDS = ['awd', 'powered_liftgate', 'heated_seats', 'cooled_seats', 'charging_800v'];

// Normalizes a raw `evs` row (sqlite integers for booleans) and attaches the
// computed score. Shared by both the EVs endpoints and leases' embedded ev,
// so the score is never missing depending on which route you hit.
export function serializeEv(row) {
  if (!row) return null;
  const out = { ...row };
  for (const f of BOOL_FIELDS) out[f] = !!row[f];
  out.score = computeEvScore(out);
  return out;
}

// EV feature score — not persisted, recomputed on every read from current specs.
export function computeEvScore(ev) {
  let score = 0;
  if (ev.awd) score += 5;
  if (ev.powered_liftgate) score += 5;
  if (ev.heated_seats) score += 5;
  if (ev.cooled_seats) score += 5;
  if (ev.charging_800v) score += 5;
  if (ev.seats != null && ev.seats > 5) score += 5;

  if (ev.range_miles != null) {
    if (ev.range_miles >= 300) {
      // 5 pts per 50-mile bracket starting at 300 (300-349 -> 5, 350-399 -> 10, ...).
      score += 5 * (Math.floor((ev.range_miles - 300) / 50) + 1);
    } else {
      // Mirrored penalty below 300 (250-299 -> -5, 200-249 -> -10, ...).
      score -= 5 * (Math.floor((300 - ev.range_miles - 1) / 50) + 1);
    }
  }

  return score;
}
