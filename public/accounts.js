export const COLORS = ['blue', 'green', 'purple', 'orange', 'pink', 'slate'];
export function validAccountDetails(account) {
  return (account.email === undefined || (typeof account.email === 'string' && account.email.length <= 254 && (account.email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email)))) &&
    (account.color === undefined || COLORS.includes(account.color));
}
export function sortedAccounts(accounts, now = Date.now()) {
  const next = r => r.anchor > now ? r.anchor : r.anchor + (Math.floor((now - r.anchor) / 18000000) + 1) * 18000000;
  return [...accounts].sort((a, b) => Number(a.paused) - Number(b.paused) || (a.paused ? 0 : next(a) - next(b)) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
