import db from '../config/db.js';
import { ensureStages, isValidAutoEvent, effectiveStageId } from '../services/crmStages.js';
import { isValidStageMetaEvent } from '../services/metaCapi.js';
import { fireStageEvent, inBackground } from '../services/conversionEvents.js';

// Etapas, tags e equipe podem ser editadas por qualquer papel (admin, cliente e o
// /caixa) -- decisão do usuário. O clientId vem do token pra quem não é admin.
function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.body.clientId || req.user.clientId)
    : req.user.clientId;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function cleanName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  return name.length > 0 && name.length <= 60 ? name : null;
}

async function loadConfig(clientId) {
  await ensureStages(db, clientId);
  const [{ rows: stages }, { rows: tags }, { rows: team }] = await Promise.all([
    db.query(`SELECT id, name, color, position, auto_event, meta_event FROM crm_stages WHERE client_id = ? ORDER BY position, id`, [clientId]),
    db.query(`SELECT id, name, color FROM crm_tags WHERE client_id = ? ORDER BY name`, [clientId]),
    db.query(`SELECT id, name FROM crm_team_members WHERE client_id = ? ORDER BY name`, [clientId])
  ]);
  return { stages, tags, team };
}

function withClient(handler, errorMessage) {
  return async (req, res) => {
    try {
      const clientId = resolveClientId(req);
      if (!clientId) return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
      return await handler(req, res, clientId);
    } catch (error) {
      console.error(`${errorMessage}:`, error);
      return res.status(500).json({ error: `${errorMessage}.` });
    }
  };
}

export const getCrmConfig = withClient(async (_req, res, clientId) => {
  return res.json(await loadConfig(clientId));
}, 'Erro ao carregar o CRM');

// ---- Etapas ----

export const createStage = withClient(async (req, res, clientId) => {
  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ error: 'Nome da etapa é obrigatório (até 60 caracteres).' });
  const color = HEX_COLOR.test(req.body.color || '') ? req.body.color : '#6366f1';
  await ensureStages(db, clientId);
  const { rows } = await db.query(
    `INSERT INTO crm_stages (client_id, name, color, position)
     VALUES (?, ?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM crm_stages WHERE client_id = ?))
     RETURNING id`,
    [clientId, name, color, clientId]
  );
  return res.status(201).json({ id: rows[0].id });
}, 'Erro ao criar etapa');

export const updateStage = withClient(async (req, res, clientId) => {
  const { stageId } = req.params;
  const { name, color, autoEvent, metaEvent } = req.body;
  const sets = [];
  const params = [];

  if (name !== undefined) {
    const clean = cleanName(name);
    if (!clean) return res.status(400).json({ error: 'Nome da etapa inválido.' });
    sets.push('name = ?');
    params.push(clean);
  }
  if (color !== undefined) {
    if (!HEX_COLOR.test(color)) return res.status(400).json({ error: 'Cor inválida.' });
    sets.push('color = ?');
    params.push(color);
  }
  if (autoEvent !== undefined) {
    if (!isValidAutoEvent(autoEvent)) return res.status(400).json({ error: 'Evento automático inválido.' });
    // Cada evento move pra uma etapa só: ligar aqui desliga de qualquer outra.
    if (autoEvent) {
      await db.query(`UPDATE crm_stages SET auto_event = NULL WHERE client_id = ? AND auto_event = ?`, [clientId, autoEvent]);
    }
    sets.push('auto_event = ?');
    params.push(autoEvent || null);
  }
  if (metaEvent !== undefined) {
    if (!isValidStageMetaEvent(metaEvent)) return res.status(400).json({ error: 'Evento Meta inválido.' });
    sets.push('meta_event = ?');
    params.push(metaEvent || null);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'Nada pra atualizar.' });

  const { rows } = await db.query(
    `UPDATE crm_stages SET ${sets.join(', ')} WHERE id = ? AND client_id = ? RETURNING id`,
    [...params, stageId, clientId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Etapa não encontrada.' });
  return res.json({ message: 'Etapa atualizada.' });
}, 'Erro ao atualizar etapa');

export const reorderStages = withClient(async (req, res, clientId) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids é obrigatório.' });
  for (const [position, id] of ids.entries()) {
    await db.query(`UPDATE crm_stages SET position = ? WHERE id = ? AND client_id = ?`, [position, id, clientId]);
  }
  return res.json({ message: 'Ordem salva.' });
}, 'Erro ao reordenar etapas');

export const deleteStage = withClient(async (req, res, clientId) => {
  const { stageId } = req.params;
  const { rows: stages } = await db.query(
    `SELECT id FROM crm_stages WHERE client_id = ? ORDER BY position, id`,
    [clientId]
  );
  if (!stages.some((s) => String(s.id) === String(stageId))) {
    return res.status(404).json({ error: 'Etapa não encontrada.' });
  }
  if (stages.length === 1) {
    return res.status(400).json({ error: 'O funil precisa ter pelo menos uma etapa.' });
  }
  // Os cards da etapa apagada vão pra primeira etapa que sobrar, em vez de sumirem.
  const target = stages.find((s) => String(s.id) !== String(stageId));
  await db.query(`UPDATE whatsapp_contacts SET stage_id = ? WHERE stage_id = ? AND client_id = ?`, [target.id, stageId, clientId]);
  await db.query(`DELETE FROM crm_stages WHERE id = ? AND client_id = ?`, [stageId, clientId]);
  return res.json({ message: 'Etapa removida.', movedTo: target.id });
}, 'Erro ao remover etapa');

// ---- Tags e equipe (mesma forma: nome, e cor só pra tag) ----

function simpleCrud(table, { hasColor, label }) {
  return {
    create: withClient(async (req, res, clientId) => {
      const name = cleanName(req.body.name);
      if (!name) return res.status(400).json({ error: `Nome ${label} é obrigatório (até 60 caracteres).` });
      const cols = ['client_id', 'name'];
      const params = [clientId, name];
      if (hasColor) {
        cols.push('color');
        params.push(HEX_COLOR.test(req.body.color || '') ? req.body.color : '#6366f1');
      }
      const { rows } = await db.query(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) RETURNING id`,
        params
      );
      return res.status(201).json({ id: rows[0].id });
    }, `Erro ao criar ${label}`),

    update: withClient(async (req, res, clientId) => {
      const sets = [];
      const params = [];
      if (req.body.name !== undefined) {
        const name = cleanName(req.body.name);
        if (!name) return res.status(400).json({ error: 'Nome inválido.' });
        sets.push('name = ?');
        params.push(name);
      }
      if (hasColor && req.body.color !== undefined) {
        if (!HEX_COLOR.test(req.body.color)) return res.status(400).json({ error: 'Cor inválida.' });
        sets.push('color = ?');
        params.push(req.body.color);
      }
      if (sets.length === 0) return res.status(400).json({ error: 'Nada pra atualizar.' });
      const { rows } = await db.query(
        `UPDATE ${table} SET ${sets.join(', ')} WHERE id = ? AND client_id = ? RETURNING id`,
        [...params, req.params.id, clientId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Não encontrado.' });
      return res.json({ message: 'Atualizado.' });
    }, `Erro ao atualizar ${label}`),

    remove: withClient(async (req, res, clientId) => {
      const { rows } = await db.query(`DELETE FROM ${table} WHERE id = ? AND client_id = ? RETURNING id`, [req.params.id, clientId]);
      if (rows.length === 0) return res.status(404).json({ error: 'Não encontrado.' });
      return res.json({ message: 'Removido.' });
    }, `Erro ao remover ${label}`)
  };
}

export const tagsCrud = simpleCrud('crm_tags', { hasColor: true, label: 'da tag' });
export const teamCrud = simpleCrud('crm_team_members', { hasColor: false, label: 'do responsável' });

// ---- Dados de negócio de um contato ----

export const getContactCrm = withClient(async (req, res, clientId) => {
  const { contactId } = req.params;
  const config = await loadConfig(clientId);
  const { rows } = await db.query(
    `SELECT wc.stage_id, wc.deal_value, wc.responsible_id,
       (SELECT COALESCE(SUM(amount_spent), 0) FROM real_conversions rc WHERE rc.contact_id = wc.id) AS sales_total,
       COALESCE((SELECT array_agg(tag_id) FROM whatsapp_contact_tags t WHERE t.contact_id = wc.id), '{}') AS tag_ids
     FROM whatsapp_contacts wc WHERE wc.id = ? AND wc.client_id = ?`,
    [contactId, clientId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Contato não encontrado.' });
  const r = rows[0];
  return res.json({
    ...config,
    stageId: effectiveStageId(r.stage_id, config.stages),
    dealValue: r.deal_value == null ? null : Number(r.deal_value),
    salesTotal: Number(r.sales_total),
    responsibleId: r.responsible_id,
    tagIds: r.tag_ids
  });
}, 'Erro ao carregar dados do negócio');

async function belongsToClient(table, id, clientId) {
  const { rows } = await db.query(`SELECT id FROM ${table} WHERE id = ? AND client_id = ?`, [id, clientId]);
  return rows.length > 0;
}

// Atualiza só os campos enviados: stageId, dealValue, responsibleId, tagIds.
export const updateContactCrm = withClient(async (req, res, clientId) => {
  const { contactId } = req.params;
  const { stageId, dealValue, responsibleId, tagIds } = req.body;

  const { rows: contactRows } = await db.query(
    `SELECT id FROM whatsapp_contacts WHERE id = ? AND client_id = ?`,
    [contactId, clientId]
  );
  if (contactRows.length === 0) return res.status(404).json({ error: 'Contato não encontrado.' });

  const sets = [];
  const params = [];
  if (stageId !== undefined) {
    if (!(await belongsToClient('crm_stages', stageId, clientId))) return res.status(400).json({ error: 'Etapa inválida.' });
    sets.push('stage_id = ?');
    params.push(stageId);
  }
  if (dealValue !== undefined) {
    const value = dealValue === null || dealValue === '' ? null : Number(dealValue);
    if (value !== null && (Number.isNaN(value) || value < 0)) return res.status(400).json({ error: 'Valor do negócio inválido.' });
    sets.push('deal_value = ?');
    params.push(value);
  }
  if (responsibleId !== undefined) {
    if (responsibleId !== null && !(await belongsToClient('crm_team_members', responsibleId, clientId))) {
      return res.status(400).json({ error: 'Responsável inválido.' });
    }
    sets.push('responsible_id = ?');
    params.push(responsibleId);
  }
  if (sets.length > 0) {
    await db.query(`UPDATE whatsapp_contacts SET ${sets.join(', ')} WHERE id = ?`, [...params, contactId]);
  }
  // Card movido pra uma etapa com evento Meta ligado: envia (uma vez por contato).
  if (stageId !== undefined) {
    inBackground(fireStageEvent({ clientId, contactId }));
  }

  if (tagIds !== undefined) {
    if (!Array.isArray(tagIds)) return res.status(400).json({ error: 'tagIds deve ser uma lista.' });
    const { rows: validTags } = await db.query(`SELECT id FROM crm_tags WHERE client_id = ?`, [clientId]);
    const valid = new Set(validTags.map((t) => t.id));
    await db.query(`DELETE FROM whatsapp_contact_tags WHERE contact_id = ?`, [contactId]);
    for (const tagId of new Set(tagIds.map(Number))) {
      if (valid.has(tagId)) {
        await db.query(`INSERT INTO whatsapp_contact_tags (contact_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [contactId, tagId]);
      }
    }
  }

  return res.json({ message: 'Negócio atualizado.' });
}, 'Erro ao atualizar negócio');
