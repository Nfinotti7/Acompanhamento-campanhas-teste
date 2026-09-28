export function parseWhatsAppWebhook(payload) {
  const events = [];
  const entries = payload?.entry || [];

  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const profileNameByWaId = {};
      for (const c of value.contacts || []) {
        profileNameByWaId[c.wa_id] = c.profile?.name || null;
      }

      for (const m of value.messages || []) {
        const referral = m.referral || null;
        events.push({
          phoneNumberId,
          waId: m.from,
          profileName: profileNameByWaId[m.from] || null,
          waMessageId: m.id,
          direction: 'inbound',
          body: m.text?.body || null,
          sentAt: new Date(Number(m.timestamp) * 1000).toISOString(),
          ctwaClid: referral?.ctwa_clid || null,
          adId: referral?.source_id || null,
          adHeadline: referral?.headline || null,
          adBody: referral?.body || null
        });
      }
    }
  }

  return events;
}
