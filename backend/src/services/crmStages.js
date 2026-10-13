// CRM estilo Kommo: cada cliente tem as próprias etapas (crm_stages), e o card fica
// onde a equipe colocou. Só três eventos movem o card sozinho, e só se alguma etapa
// estiver ligada a ele (auto_event):
// - novo_lead: contato novo entra nessa etapa (senão, na primeira)
// - agendado: marcar agendamento
// - venda: lançar venda
import { computeStage } from './whatsappStage.js';

export const AUTO_EVENTS = ['novo_lead', 'agendado', 'venda'];

// Etapas criadas na primeira vez que o cliente abre o funil -- as mesmas 6 que o funil
// automático antigo tinha, pra ninguém perder o que já via. legacyKey liga cada uma à
// etapa calculada antiga, pra posicionar os contatos que já existiam.
export const DEFAULT_STAGES = [
  { name: 'Novo lead', color: '#3b82f6', autoEvent: 'novo_lead', legacyKey: 'novo_lead' },
  { name: 'Em atendimento', color: '#f59e0b', autoEvent: null, legacyKey: 'em_atendimento' },
  { name: 'Agendado', color: '#a855f7', autoEvent: 'agendado', legacyKey: 'agendado' },
  { name: 'Não compareceu', color: '#ef4444', autoEvent: null, legacyKey: 'nao_compareceu' },
  { name: 'Compareceu', color: '#10b981', autoEvent: 'venda', legacyKey: 'compareceu' },
  { name: 'Remarketing', color: '#64748b', autoEvent: null, legacyKey: 'remarketing' }
];

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
// em etapa nenhuma (contato novo); agendado/venda movem sempre.
export async function moveToAutoStage(dbImpl, { clientId, contactId, event }) {
  if (event === 'novo_lead') {
    await dbImpl.query(
      `UPDATE whatsapp_contacts SET stage_id = (
         SELECT id FROM crm_stages WHERE client_id = ?
         ORDER BY (auto_event = 'novo_lead') DESC NULLS LAST, position ASC LIMIT 1
       ) WHERE id = ? AND stage_id IS NULL`,
      [clientId, contactId]
    );
    return;
  }
  await dbImpl.query(
    `UPDATE whatsapp_contacts SET stage_id = s.id
     FROM crm_stages s
     WHERE s.client_id = ? AND s.auto_event = ? AND whatsapp_contacts.id = ?`,
    [clientId, event, contactId]
  );
}
