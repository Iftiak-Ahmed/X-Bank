// Indicative Mudarabah profit-sharing rate for DPS (recurring deposit) accounts —
// not interest (Riba); a fixed illustrative rate stands in for a real profit
// declaration in this prototype. Kept in one place so creation-time and
// preview-time math never drift apart.
export const DPS_PROFIT_RATE_PERCENT = 6;
export const DPS_ALLOWED_TERM_YEARS = [1, 2, 3, 5];

// Future value of a recurring monthly deposit made at the start of each month
// (annuity due), compounded monthly at the given annual rate.
export function calculateDpsMaturity(monthlyDeposit: number, termYears: number, annualRatePercent = DPS_PROFIT_RATE_PERCENT): number {
  const months = termYears * 12;
  const monthlyRate = annualRatePercent / 100 / 12;
  if (monthlyRate === 0) return Math.round(monthlyDeposit * months);
  const futureValue = monthlyDeposit * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate);
  return Math.round(futureValue);
}
