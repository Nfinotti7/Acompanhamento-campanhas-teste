const token = process.env.META_ACCESS_TOKEN || '';
const ad_account_id = process.env.META_AD_ACCOUNT_ID || 'act_1641105394012172';

async function testParams() {
  const tests = [
    { name: '1. Basic', params: 'level=campaign' },
    { name: '2. With fields', params: 'level=campaign&fields=campaign_id,campaign_name,spend,clicks,impressions,actions,action_values' },
    { name: '3. With time_range', params: `level=campaign&time_range=${JSON.stringify({since: '2026-08-17', until: '2026-09-15'})}` },
    { name: '4. With time_increment', params: 'level=campaign&time_increment=1' },
    { name: '5. time_range + time_increment', params: `level=campaign&time_increment=1&time_range=${JSON.stringify({since: '2026-08-17', until: '2026-09-15'})}` },
    { name: '6. Recent dates (2024-01-01 to 2024-01-31)', params: `level=campaign&time_range=${JSON.stringify({since: '2024-01-01', until: '2024-01-31'})}` },
    { name: '7. Recent dates 2026-09-01 to 2026-09-15', params: `level=campaign&time_range=${JSON.stringify({since: '2026-09-01', until: '2026-09-15'})}` },
    { name: '8. date_preset=last_30d', params: 'level=campaign&time_increment=1&date_preset=last_30d' }
  ];

  for (const t of tests) {
    const res = await fetch(`https://graph.facebook.com/v19.0/${ad_account_id}/insights?${t.params}&access_token=${token}`);
    const body = await res.json();
    console.log(`${t.name} => status ${res.status}:`, body.error ? body.error.message + ` (subcode: ${body.error.error_subcode})` : `Success (${body.data?.length} rows)`);
  }
}

testParams();
