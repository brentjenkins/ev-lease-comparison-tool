import type { CSSProperties } from 'react';

// White-to-green background for a "how good is this" metric cell, scaled against the
// min/max seen across the rows currently in the table. Use `invert` for metrics where a
// lower value is better (e.g. effective cost per month) — otherwise higher is greener.
export function scoreGradient(
  value: number | null | undefined,
  min: number,
  max: number,
  invert = false
): CSSProperties | undefined {
  if (value == null || !Number.isFinite(value) || max === min) return undefined;
  let t = (value - min) / (max - min);
  if (invert) t = 1 - t;
  t = Math.max(0, Math.min(1, t));
  return { backgroundColor: `rgba(46, 204, 113, ${t.toFixed(3)})` };
}

export function numericRange(values: Array<number | null | undefined>): [number, number] {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0) return [0, 0];
  return [Math.min(...nums), Math.max(...nums)];
}
