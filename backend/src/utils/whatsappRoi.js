export function computeRoi({ adSpend, conversions }) {
  const totalSpend = Number(adSpend) || 0;
  const totalRevenue = conversions.reduce((sum, c) => sum + (Number(c.amountSpent) || 0), 0);
  const matchedCount = conversions.filter((c) => c.contactId != null).length;

  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const roi = totalSpend > 0 ? ((totalRevenue - totalSpend) / totalSpend) * 100 : 0;

  return {
    totalSpend: Number(totalSpend.toFixed(2)),
    totalRevenue: Number(totalRevenue.toFixed(2)),
    conversionCount: conversions.length,
    matchedCount,
    roi: Number(roi.toFixed(2)),
    roas: Number(roas.toFixed(2))
  };
}
