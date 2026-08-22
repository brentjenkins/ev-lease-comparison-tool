// EV feature score — not persisted, recomputed on every read from current specs.
export function computeEvScore(ev) {
  let score = 0;
  if (ev.awd) score += 5;
  if (ev.powered_liftgate) score += 5;
  if (ev.heated_seats) score += 5;
  if (ev.cooled_seats) score += 5;
  if (ev.seats != null && ev.seats > 5) score += 5;

  if (ev.range_miles != null && ev.range_miles >= 300) {
    // 5 pts per 50-mile bracket starting at 300 (300-349 -> 5, 350-399 -> 10, ...).
    score += 5 * (Math.floor((ev.range_miles - 300) / 50) + 1);
  }

  return score;
}
