import { classifyCampaignByPrefix } from '../utils/campaignClassifier.js';

export async function classifyAndPrepareRows(rawRows, accountMembers, groupAccessToken, deps) {
  const { fetchCampaignPageId } = deps;

  if (accountMembers.length <= 1) {
    const clientId = accountMembers[0]?.clientId ?? null;
    return rawRows.map((r) => ({
      ...r,
      resolvedClientId: clientId,
      classification: clientId ? 'ok' : 'unclassified'
    }));
  }

  const candidates = accountMembers.map((m) => ({ clientId: m.clientId, campaignPrefix: m.campaignPrefix }));
  const pageIdCache = new Map();
  const classifiedRows = [];

  for (const row of rawRows) {
    const match = classifyCampaignByPrefix(row.campaignName, candidates);

    if (match.status === 'unclassified') {
      classifiedRows.push({ ...row, resolvedClientId: null, classification: 'unclassified' });
      continue;
    }

    const member = accountMembers.find((m) => m.clientId === match.clientId);

    if (!member.pageId) {
      classifiedRows.push({ ...row, resolvedClientId: member.clientId, classification: 'ok' });
      continue;
    }

    let actualPageId;
    if (pageIdCache.has(row.campaignId)) {
      actualPageId = pageIdCache.get(row.campaignId);
    } else {
      try {
        actualPageId = await fetchCampaignPageId(row.campaignId, groupAccessToken);
      } catch {
        actualPageId = null;
      }
      pageIdCache.set(row.campaignId, actualPageId);
    }

    if (actualPageId && actualPageId === member.pageId) {
      classifiedRows.push({ ...row, resolvedClientId: member.clientId, classification: 'ok' });
    } else {
      classifiedRows.push({ ...row, resolvedClientId: null, classification: 'inconsistent' });
    }
  }

  return classifiedRows;
}
