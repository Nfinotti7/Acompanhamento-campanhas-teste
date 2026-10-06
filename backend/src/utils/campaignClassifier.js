export function classifyCampaignByPrefix(campaignName, candidates) {
  const matches = candidates.filter((c) => c.campaignPrefix && campaignName.startsWith(c.campaignPrefix));

  if (matches.length === 1) {
    return { status: 'matched', clientId: matches[0].clientId };
  }

  return { status: 'unclassified', clientId: null };
}
