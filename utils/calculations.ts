/** Buy Value = Buy Price × Quantity */
export const calcBuyValue = (buyPrice: number, quantity: number): number =>
  buyPrice * quantity;

/** Sale Value = Sell Price × Quantity */
export const calcSaleValue = (sellPrice: number, quantity: number): number =>
  sellPrice * quantity;

/** Profit / Loss = Sale Value − Buy Value */
export const calcProfitLoss = (saleValue: number, buyValue: number): number =>
  saleValue - buyValue;

/** P/L % = (P/L ÷ Buy Value) × 100 */
export const calcProfitLossPct = (profitLoss: number, buyValue: number): number =>
  buyValue > 0 ? (profitLoss / buyValue) * 100 : 0;

/** Net Profit = P/L − Tax − User Cut */
export const calcNetProfit = (profitLoss: number, tax: number, userCut: number): number =>
  profitLoss - tax - userCut;

/**
 * Portfolio CAGR = ((totalInvested + netProfit) / totalInvested)^(1/years) − 1
 * Returns null if inputs are invalid (no invested capital, no time elapsed).
 */
export const calcPortfolioCAGR = (
  netProfit: number,
  totalInvested: number,
  earliestDateStr: string,
): number | null => {
  if (totalInvested <= 0 || !earliestDateStr) return null;
  const start = new Date(earliestDateStr).getTime();
  const now = Date.now();
  const years = (now - start) / (1000 * 60 * 60 * 24 * 365.25);
  if (years < 0.01) return null; // too little time elapsed
  const ratio = (totalInvested + netProfit) / totalInvested;
  if (ratio <= 0) return null;
  return (Math.pow(ratio, 1 / years) - 1) * 100;
};
