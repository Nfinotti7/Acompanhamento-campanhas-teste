import db from '../config/db.js';
import { parseGoogleAdsCsv, summarizeRows } from '../services/googleCsvImport.js';
import { dropRowsBeforeStart, storeRows } from '../services/syncService.js';

// POST /api/campaigns/import-google?clientId=..[&dryRun=1]  (corpo: texto do CSV)
// dryRun só confere e resume o arquivo, sem gravar nada.
export async function importGoogleCsv(req, res) {
  try {
    const clientId = Number(req.query.clientId);
    if (!clientId) return res.status(400).json({ error: 'Escolha um cliente.' });

    const { rows: clients } = await db.query(
      "SELECT id, name, to_char(data_start_date, 'YYYY-MM-DD') AS start FROM clients WHERE id = ?",
      [clientId]
    );
    if (!clients[0]) return res.status(404).json({ error: 'Cliente não encontrado.' });

    let parsed;
    try {
      parsed = parseGoogleAdsCsv(typeof req.body === 'string' ? req.body : '');
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const start = clients[0].start;
    const rows = dropRowsBeforeStart(parsed.rows, () => start);
    if (rows.length === 0) {
      return res.status(400).json({ error: `Todas as linhas são anteriores à data de início do cliente (${start}).` });
    }

    const summary = {
      ...summarizeRows(rows),
      client: clients[0].name,
      droppedBeforeStart: parsed.rows.length - rows.length,
      startDate: start
    };
    if (req.query.dryRun) return res.json({ imported: false, summary });

    await storeRows(clientId, 'google', rows);
    return res.json({ imported: true, summary });
  } catch (error) {
    console.error('Import Google CSV error:', error);
    return res.status(500).json({ error: 'Erro ao importar o CSV.' });
  }
}
