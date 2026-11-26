// CRM estilo Kommo: cada cliente tem as próprias etapas (crm_stages), e o card fica
// onde a equipe colocou. Estes eventos movem o card sozinho, e só se alguma etapa
// estiver ligada a eles (auto_event):
// - novo_lead: contato novo entra nessa etapa (senão, na primeira). Quem está no
//   remarketing e volta a escrever também vem pra cá.
// - atendimento: segunda resposta da casa (só sai de novo_lead)
// - agendado: marcar agendamento
// - venda: lançar venda
// - remarketing: ficou N dias parado em novo_lead ou atendimento
import { computeStage } from './whatsappStage.js';
import { fireStageEvent, inBackground } from './conversionEvents.js';

export const AUTO_EVENTS = ['novo_lead', 'atendimento', 'agendado', 'venda', 'remarketing'];

// Etapas criadas na primeira vez que o cliente abre o funil -- as mesmas 6 que o funil
// automático antigo tinha, pra ninguém perder o que já via. legacyKey liga cada uma à
// etapa calculada antiga, pra posicionar os contatos que já existiam.
export const DEFAULT_STAGES = [
  { name: 'Novo lead', color: '#3b82f6', autoEvent: 'novo_lead', legacyKey: 'novo_lead' },
  { name: 'Em atendimento', color: '#f59e0b', autoEvent: 'atendimento', legacyKey: 'em_atendimento' },
  { name: 'Agendado', color: '#a855f7', autoEvent: 'agendado', legacyKey: 'agendado' },
  { name: 'Não compareceu', color: '#ef4444', autoEvent: null, legacyKey: 'nao_compareceu' },
  { name: 'Compareceu', color: '#10b981', autoEvent: 'venda', legacyKey: 'compareceu' },
  { name: 'Remarketing', color: '#64748b', autoEvent: 'remarketing', legacyKey: 'remarketing' }
];

export function parseRemarketingDays(value) {
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= 90 ? days : null;
}

export function isValidAutoEvent(value) {
  return value === null || value === undefined || AUTO_EVENTS.includes(value);
}

// Etapa em que o card aparece. stage_id pode estar vazio (contato chegou antes das
// etapas existirem) ou apontar pra uma etapa apagada -- nos dois casos, primeira etapa.
export function effectiveStageId(stageId, stages) {
  if (stageId != null && stages.some((s) => s.id === stageId)) return stageId;
  return stages[0]?.id ?? null;
}

// Valor do card: depois que há venda lançada, vale o total real; antes disso, o valor
// estimado digitado pela equipe (se houver).
export function cardValue({ dealValue, salesTotal }) {
  const sales = Number(salesTotal || 0);
  if (sales > 0) return sales;
  return dealValue == null ? 0 : Number(dealValue);
}

// Etapa antiga (calculada) de um contato que já existia, pra posicioná-lo uma única vez
// quando as etapas personalizadas são criadas.
export function legacyStageKey(row, { remarketingDays = 3, now = new Date() } = {}) {
  return row.manual_stage || computeStage({
    hasConversion: row.has_conversion,
    appointmentAt: row.appointment_at,
    hasOutbound: row.has_outbound,
    lastActivityAt: row.last_message_at || row.first_seen_at,
    remarketingDays,
    now
  });
}

// Cria as etapas padrão do cliente se ainda não tiver nenhuma, e posiciona os contatos
// existentes nelas. Roda uma vez por cliente (marca clients.crm_seeded_at). O UPDATE ...
// WHERE crm_seeded_at IS NULL é atômico, então duas chamadas ao mesmo tempo não criam
// etapas em dobro. Se o cliente apagar todas as etapas depois, não recria.
export async function ensureStages(dbImpl, clientId) {
  const { rows: claimed } = await dbImpl.query(
    `UPDATE clients SET crm_seeded_at = CURRENT_TIMESTAMP WHERE id = ? AND crm_seeded_at IS NULL RETURNING id`,
    [clientId]
  );
  if (claimed.length === 0) return false;

  const idsByLegacyKey = {};
  for (const [index, stage] of DEFAULT_STAGES.entries()) {
    const { rows } = await dbImpl.query(
      `INSERT INTO crm_stages (client_id, name, color, position, auto_event) VALUES (?, ?, ?, ?, ?) RETURNING id`,
      [clientId, stage.name, stage.color, index, stage.autoEvent]
    );
    idsByLegacyKey[stage.legacyKey] = rows[0].id;
  }

  const { rows: settingsRows } = await dbImpl.query(
    'SELECT remarketing_days FROM whatsapp_settings WHERE client_id = ?',
    [clientId]
  );
  const remarketingDays = settingsRows[0]?.remarketing_days ?? 3;

  const { rows: contacts } = await dbImpl.query(
    `SELECT wc.id, wc.appointment_at, wc.first_seen_at, wc.manual_stage,
       EXISTS(SELECT 1 FROM real_conversions rc WHERE rc.contact_id = wc.id) AS has_conversion,
       EXISTS(SELECT 1 FROM whatsapp_messages wm WHERE wm.contact_id = wc.id AND wm.direction = 'outbound') AS has_outbound,
       (SELECT MAX(sent_at) FROM whatsapp_messages wm2 WHERE wm2.contact_id = wc.id) AS last_message_at
     FROM whatsapp_contacts wc
     WHERE wc.client_id = ? AND wc.stage_id IS NULL`,
    [clientId]
  );
  const now = new Date();
  for (const contact of contacts) {
    const stageId = idsByLegacyKey[legacyStageKey(contact, { remarketingDays, now })] ?? idsByLegacyKey.novo_lead;
    await dbImpl.query(`UPDATE whatsapp_contacts SET stage_id = ? WHERE id = ?`, [stageId, contact.id]);
  }
  return true;
}

// Move o contato pra etapa ligada ao evento. novo_lead só vale pra quem ainda não está
// em etapa nenhuma (contato novo); agendado/venda movem sempre. Se o card mudou de
// etapa, envia o evento Meta ligado à nova etapa (em segundo plano).
export async function moveToAutoStage(dbImpl, { clientId, contactId, event }, deps = {}) {
  const fire = deps.fire || ((args) => fireStageEvent(args, { db: dbImpl }));
  let result;
  if (event === 'novo_lead') {
    result = await dbImpl.query(
      `UPDATE whatsapp_contacts SET stage_id = (
         SELECT id FROM crm_stages WHERE client_id = ?
         ORDER BY (auto_event = 'novo_lead') DESC NULLS LAST, position ASC LIMIT 1
       ), stage_changed_at = CURRENT_TIMESTAMP WHERE id = ? AND stage_id IS NULL
       RETURNING id`,
      [clientId, contactId]
    );
  } else {
    result = await dbImpl.query(
      `UPDATE whatsapp_contacts SET stage_id = s.id, stage_changed_at = CURRENT_TIMESTAMP
       FROM crm_stages s
       WHERE s.client_id = ? AND s.auto_event = ? AND whatsapp_contacts.id = ?
         AND whatsapp_contacts.stage_id IS DISTINCT FROM s.id
       RETURNING whatsapp_contacts.id`,
      [clientId, event, contactId]
    );
  }
  const moved = result.rows.length > 0;
  if (moved) inBackground(Promise.resolve().then(() => fire({ clientId, contactId })));
  return moved;
}

function fireWith(dbImpl, deps) {
  return deps.fire || ((args) => fireStageEvent(args, { db: dbImpl }));
}

// Move o card da etapa ligada a `from` pra ligada a `to`. Quem está em outra etapa
// (Agendado, Compareceu ou uma criada pela equipe) não sai do lugar.
async function moveBetween(dbImpl, { clientId, contactId, from, to }, deps) {
  const { rows } = await dbImpl.query(
    `UPDATE whatsapp_contacts SET stage_id = nxt.id, stage_changed_at = CURRENT_TIMESTAMP
     FROM crm_stages cur, crm_stages nxt
     WHERE whatsapp_contacts.id = ? AND cur.id = whatsapp_contacts.stage_id
       AND cur.auto_event = '${from}' AND nxt.client_id = ? AND nxt.auto_event = '${to}'
     RETURNING whatsapp_contacts.id`,
    [contactId, clientId]
  );
  if (rows.length === 0) return false;
  const fire = fireWith(dbImpl, deps);
  inBackground(Promise.resolve().then(() => fire({ clientId, contactId })));
  return true;
}

// Quantas vezes a casa respondeu. Mensagens seguidas valem uma resposta só: robô e IA
// mandam duas ou três de uma vez, e isso não quer dizer que o cliente continuou a conversa.
export function countHouseReplies(messages) {
  let replies = 0;
  let waiting = false;
  for (const { direction } of messages) {
    if (direction === 'inbound') waiting = true;
    else if (waiting) {
      replies += 1;
      waiting = false;
    }
  }
  return replies;
}

// Chamado depois de toda mensagem da casa (atendente, celular, robô ou IA). Na segunda
// resposta o card sai de Novo lead: quem clica no anúncio, manda a primeira mensagem e
// some continua lá.
export async function advanceOnHouseReply(dbImpl, { clientId, contactId }, deps = {}) {
  const { rows } = await dbImpl.query(
    `SELECT wm.direction FROM whatsapp_messages wm
     JOIN whatsapp_contacts wc ON wc.id = wm.contact_id
     JOIN crm_stages s ON s.id = wc.stage_id AND s.auto_event = 'novo_lead'
     WHERE wm.contact_id = ? AND wm.status IS DISTINCT FROM 'failed'
     ORDER BY wm.sent_at, wm.id LIMIT 200`,
    [contactId]
  );
  if (countHouseReplies(rows) < 2) return false;
  return moveBetween(dbImpl, { clientId, contactId, from: 'novo_lead', to: 'atendimento' }, deps);
}

export async function reviveFromRemarketing(dbImpl, { clientId, contactId }, deps = {}) {
  return moveBetween(dbImpl, { clientId, contactId, from: 'remarketing', to: 'novo_lead' }, deps);
}

// Contato importado do histórico do WhatsApp não tem etapa, mas o funil o mostra na
// primeira. Grava a etapa Novo lead pra ele seguir as mesmas regras dos outros. Não é uma
// mudança de etapa: sem evento da Meta e sem reiniciar a contagem dos dias parados.
export async function positionUnstagedContacts(dbImpl) {
  const { rows } = await dbImpl.query(
    `UPDATE whatsapp_contacts SET stage_id = s.id
     FROM crm_stages s, clients c
     WHERE whatsapp_contacts.stage_id IS NULL AND s.client_id = whatsapp_contacts.client_id
       AND s.auto_event = 'novo_lead' AND c.id = whatsapp_contacts.client_id AND c.dashboard_enabled IS NOT FALSE
     RETURNING whatsapp_contacts.id`
  );
  return rows.length;
}

// Quem ficou N dias (clients.crm_remarketing_days) sem mensagem de nenhum lado em Novo
// lead ou Em atendimento vai pro Remarketing. A contagem recomeça quando o card muda de
// etapa (stage_changed_at): tirar alguém do Remarketing à mão não é desfeito em seguida.
// Card que nunca mudou de etapa tem stage_changed_at vazio, e o GREATEST ignora vazio.
export async function moveIdleToRemarketing(dbImpl, deps = {}) {
  const { rows } = await dbImpl.query(
    `UPDATE whatsapp_contacts SET stage_id = nxt.id, stage_changed_at = CURRENT_TIMESTAMP
     FROM crm_stages cur, crm_stages nxt, clients c
     WHERE cur.id = whatsapp_contacts.stage_id AND cur.auto_event IN ('novo_lead', 'atendimento')
       AND nxt.client_id = whatsapp_contacts.client_id AND nxt.auto_event = 'remarketing'
       AND c.id = whatsapp_contacts.client_id AND c.dashboard_enabled IS NOT FALSE
       AND (whatsapp_contacts.appointment_at IS NULL OR whatsapp_contacts.appointment_at < CURRENT_TIMESTAMP)
       AND GREATEST(
             COALESCE(whatsapp_contacts.last_message_at, whatsapp_contacts.first_seen_at),
             whatsapp_contacts.stage_changed_at
           ) < CURRENT_TIMESTAMP - make_interval(days => c.crm_remarketing_days)
     RETURNING whatsapp_contacts.id, whatsapp_contacts.client_id, nxt.meta_event`
  );
  // Um por vez: na primeira passada são muitos cards, e disparar tudo junto esgotaria o banco.
  const fire = fireWith(dbImpl, deps);
  for (const row of rows) {
    if (!row.meta_event) continue;
    try {
      await fire({ clientId: row.client_id, contactId: row.id });
    } catch (error) {
      console.error('Funil: erro no evento de remarketing:', error.message);
    }
  }
  return rows.length;
}

// Etapas padrão antigas, que ainda não tinham evento automático: [evento, nome].
const STAGE_NAME_LINKS = [['atendimento', 'em atendimento'], ['remarketing', 'remarketing']];

// Uma vez por cliente (clients.crm_automation_at): liga os eventos novos às etapas que já
// existem, pelo nome, e sobe pra Em atendimento quem já teve a segunda resposta e está com
// conversa recente. Depois disso vale o que estiver em "Configurar funil" -- por isso não
// roda de novo. Devolve quantos cards subiram.
export async function setupFunnelAutomation(dbImpl, deps = {}) {
  const { rows: clients } = await dbImpl.query(
    `UPDATE clients SET crm_automation_at = CURRENT_TIMESTAMP WHERE crm_automation_at IS NULL RETURNING id`
  );
  let moved = 0;
  for (const { id: clientId } of clients) {
    for (const [event, name] of STAGE_NAME_LINKS) {
      await dbImpl.query(
        `UPDATE crm_stages SET auto_event = ? WHERE id = (
           SELECT id FROM crm_stages
           WHERE client_id = ? AND LOWER(TRIM(name)) = ? AND auto_event IS NULL
           ORDER BY position, id LIMIT 1
         ) AND NOT EXISTS (SELECT 1 FROM crm_stages WHERE client_id = ? AND auto_event = ?)`,
        [event, clientId, name, clientId, event]
      );
    }
    const { rows: candidates } = await dbImpl.query(
      `SELECT wc.id
       FROM whatsapp_contacts wc
       JOIN crm_stages s ON s.id = wc.stage_id AND s.auto_event = 'novo_lead'
       JOIN clients c ON c.id = wc.client_id
       WHERE wc.client_id = ?
         AND wc.last_message_at >= CURRENT_TIMESTAMP - make_interval(days => c.crm_remarketing_days)`,
      [clientId]
    );
    for (const contact of candidates) {
      if (await advanceOnHouseReply(dbImpl, { clientId, contactId: contact.id }, deps)) moved += 1;
    }
  }
  return moved;
}
