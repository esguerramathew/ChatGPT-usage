export const PERIOD = 5 * 60 * 60 * 1000;
export function nextReset(anchor, now = Date.now()) {
  return anchor > now ? anchor : anchor + (Math.floor((now - anchor) / PERIOD) + 1) * PERIOD;
}
export function dueSlot(anchor, now) {
  return now < anchor ? null : anchor + Math.floor((now - anchor) / PERIOD) * PERIOD;
}
