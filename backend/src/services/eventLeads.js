// Contatos de evento no Balcão (clients.events_tracking): quem veio por anúncio de evento ou
// escreveu pedindo um evento ganha a etiqueta Empresa, Aniversário/comemoração ou
// "a definir". A equipe pode trocar ou tirar; escolha dela (event_locked) nunca é sobrescrita.

export const EVENT_TYPES = ['empresa', 'aniversario', 'a_definir'];
export const EVENT_STATUSES = ['orcamento', 'fechado'];

// Quanto maior, mais específico: o automático só troca por um tipo de peso maior.
const WEIGHT = { a_definir: 1, aniversario: 2, empresa: 3 };

const normalize = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const COMPANY = [
  /\bconfraternizac(ao|oes)\b/,
  /\bconfra\b/,
  /\b(evento|jantar|almoco|reuniao|comemoracao|festa|encontro)\b.{0,25}\b(empresa|firma|equipe|corporativ[oa]|empresarial)\b/,
  /\b(evento|jantar|almoco)s? (corporativo|empresarial)/
];
const BIRTHDAY = [/\banivers/, /\bniver\b/, /\bcomemora/];
const GENERIC = [
  /\b(fazer|marcar|organizar|realizar|fechar|reservar) (um |uns |o |meu |nosso )?eventos?\b/,
  /\borcamento\b.{0,40}\beventos?\b/,
  /\beventos?\b.{0,40}\borcamento\b/,
  /\b(fechar|reservar|alugar) (o |um )?(salao|espaco)\b/
];

export function classifyEventText(text) {
  const t = normalize(text);
  if (!t) return null;
  if (COMPANY.some((re) => re.test(t))) return 'empresa';
  if (BIRTHDAY.some((re) => re.test(t))) return 'aniversario';
  if (GENERIC.some((re) => re.test(t))) return 'a_definir';
  return null;
}

// Pelo nome da campanha/anúncio. O texto do anúncio não entra: ele costuma citar
// aniversário e empresa juntos, e não diz o que a pessoa quer.
export function classifyEventAd({ campaignName, adName } = {}) {
  const name = normalize(`${campaignName || ''} ${adName || ''}`);
  if (/confraterniza|corporativ|empresarial/.test(name)) return 'empresa';
  if (/anivers/.test(name)) return 'aniversario';
  if (/evento|\[evt\]|4052/.test(name)) return 'a_definir';
  return null;
}

export function mergeEventType(current, found) {
  if (!found) return current || null;
  return (WEIGHT[found] || 0) > (WEIGHT[current] || 0) ? found : current;
}

// Olha a mensagem recebida (se houver) e o anúncio do contato, e grava o tipo quando ele
// aparece ou fica mais específico. event_at guarda a data do primeiro sinal.
export async function markEventLead(db, { clientId, contactId, body = null, at }) {
  const { rows: flags } = await db.query('SELECT events_tracking FROM clients WHERE id = ?', [clientId]);
  if (!flags[0]?.events_tracking) return null;

  const { rows } = await db.query(
    `SELECT wc.event_type, wc.event_locked, mac.campaign_name, mac.ad_name
     FROM whatsapp_contacts wc LEFT JOIN meta_ad_cache mac ON mac.ad_id = wc.ad_id
     WHERE wc.id = ? AND wc.client_id = ?`,
    [contactId, clientId]
  );
  const contact = rows[0];
  if (!contact || contact.event_locked) return null;

  const fromAd = classifyEventAd({ campaignName: contact.campaign_name, adName: contact.ad_name });
  const type = mergeEventType(mergeEventType(contact.event_type, fromAd), classifyEventText(body));
  if (type === (contact.event_type || null)) return type;

  await db.query(
    'UPDATE whatsapp_contacts SET event_type = ?, event_at = COALESCE(event_at, ?) WHERE id = ?',
    [type, at, contactId]
  );
  return type;
}

// Linhas: { event_type, answered, event_status }. Quem fechou também recebeu orçamento.
export function summarizeEventLeads(rows) {
  const empty = () => ({ arrived: 0, answered: 0, quoted: 0, closed: 0 });
  const summary = Object.fromEntries([...EVENT_TYPES, 'total'].map((k) => [k, empty()]));
  for (const row of rows) {
    if (!EVENT_TYPES.includes(row.event_type)) continue;
    for (const bucket of [summary[row.event_type], summary.total]) {
      bucket.arrived += 1;
      if (row.answered) bucket.answered += 1;
      if (EVENT_STATUSES.includes(row.event_status)) bucket.quoted += 1;
      if (row.event_status === 'fechado') bucket.closed += 1;
    }
  }
  return summary;
}

export function eventFilterSql(value) {
  if (value === 'all') return ' AND wc.event_type IS NOT NULL';
  return EVENT_TYPES.includes(value) ? ` AND wc.event_type = '${value}'` : '';
}

// Correção feita pela equipe no painel do contato.
export function parseEventUpdate({ eventType, eventStatus } = {}) {
  const sets = [];
  const params = [];
  if (eventType !== undefined) {
    if (eventType !== null && !EVENT_TYPES.includes(eventType)) return { error: 'Tipo de evento inválido.' };
    sets.push('event_type = ?', 'event_locked = true');
    sets.push(eventType === null ? 'event_status = NULL' : 'event_at = COALESCE(event_at, CURRENT_TIMESTAMP)');
    params.push(eventType);
  }
  if (eventStatus !== undefined && eventType !== null) {
    if (eventStatus !== null && !EVENT_STATUSES.includes(eventStatus)) return { error: 'Andamento inválido.' };
    sets.push('event_status = ?');
    params.push(eventStatus);
  }
  return { sets, params };
}

// "Continuaram a conversa": o cliente escreveu de novo depois de uma resposta da casa.
export async function loadEventSummary(db, clientId, { days = 30, now = new Date() } = {}) {
  const start = new Date(now.getTime() - days * 86400000);
  const previousStart = new Date(start.getTime() - days * 86400000);
  const { rows } = await db.query(
    `SELECT wc.event_type, wc.event_status, wc.event_at,
            EXISTS (
              SELECT 1 FROM whatsapp_messages i
              WHERE i.contact_id = wc.id AND i.direction = 'inbound'
                AND i.sent_at > (SELECT MIN(o.sent_at) FROM whatsapp_messages o
                                 WHERE o.contact_id = wc.id AND o.direction = 'outbound' AND o.sent_at >= wc.event_at)
            ) AS answered
     FROM whatsapp_contacts wc
     WHERE wc.client_id = ? AND wc.event_type IS NOT NULL AND wc.event_at >= ?`,
    [clientId, previousStart.toISOString()]
  );
  const isCurrent = (row) => new Date(row.event_at) >= start;
  return {
    days,
    current: summarizeEventLeads(rows.filter(isCurrent)),
    previous: summarizeEventLeads(rows.filter((row) => !isCurrent(row)))
  };
}

// Marca o histórico já gravado (scripts/backfill-event-leads.mjs). A data volta do banco já
// com fuso: sent_at é UTC sem fuso, e lido direto pelo Node andaria 3h no PC em Brasília.
export async function backfillEventLeads(db, clientId, { days = 90, apply = false } = {}) {
  const { rows } = await db.query(
    `SELECT m.contact_id, m.body, m.sent_at AT TIME ZONE 'UTC' AS at, mac.campaign_name, mac.ad_name
     FROM whatsapp_messages m
     JOIN whatsapp_contacts wc ON wc.id = m.contact_id
     LEFT JOIN meta_ad_cache mac ON mac.ad_id = wc.ad_id
     WHERE wc.client_id = ? AND wc.wa_id ~ '^[0-9]{8,15}$' AND wc.event_locked IS NOT TRUE
       AND m.direction = 'inbound' AND m.sent_at > now() - make_interval(days => ?)
     ORDER BY m.sent_at, m.id`,
    [clientId, days]
  );
  const found = new Map();
  for (const row of rows) {
    const previous = found.get(row.contact_id);
    const fromAd = classifyEventAd({ campaignName: row.campaign_name, adName: row.ad_name });
    const type = mergeEventType(mergeEventType(previous?.type, fromAd), classifyEventText(row.body));
    if (type) found.set(row.contact_id, { type, at: previous?.at || row.at });
  }
  const counts = { empresa: 0, aniversario: 0, a_definir: 0, total: found.size };
  for (const [contactId, { type, at }] of found) {
    counts[type] += 1;
    if (apply) {
      await db.query(
        'UPDATE whatsapp_contacts SET event_type = ?, event_at = ? WHERE id = ? AND client_id = ? AND event_locked IS NOT TRUE',
        [type, new Date(at).toISOString(), contactId, clientId]
      );
    }
  }
  return counts;
}
