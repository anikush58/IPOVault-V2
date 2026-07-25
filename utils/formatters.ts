/** Format a number using Indian comma grouping and ₹ prefix. */
export function formatCurrency(amount: number, showDecimals = false): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const fixed = showDecimals ? abs.toFixed(2) : abs.toFixed(0);
  const [intPart, decPart] = fixed.split('.');

  let grouped = '';
  const len = intPart.length;
  if (len <= 3) {
    grouped = intPart;
  } else {
    grouped = intPart.slice(-3);
    let rest = intPart.slice(0, -3);
    while (rest.length > 2) {
      grouped = rest.slice(-2) + ',' + grouped;
      rest = rest.slice(0, -2);
    }
    if (rest.length > 0) grouped = rest + ',' + grouped;
  }

  return `${sign}₹${grouped}${decPart ? '.' + decPart : ''}`;
}

/** Format a percentage with sign. */
export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

/** Format an ISO date string (YYYY-MM-DD) to "15 Nov 2025". */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[parseInt(parts[1]!, 10) - 1] ?? parts[1];
  return `${parseInt(parts[2]!, 10)} ${month} ${parts[0]}`;
}

/** Return today's date as YYYY-MM-DD. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
