// Marca os contatos de evento no histórico de um cliente. Sem --apply só conta.
// Uso (depois do deploy, que cria as colunas):
//   DOTENV_CONFIG_PATH=.env.novo node scripts/backfill-event-leads.mjs --client 8 [--days 90] [--apply]
import 'dotenv/config';
import db from '../src/config/db.js';
import { backfillEventLeads } from '../src/services/eventLeads.js';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const clientId = Number(arg('client'));
if (!clientId) {
  console.error('Informe --client <id>.');
  process.exit(1);
}
const days = Number(arg('days')) || 90;
const apply = process.argv.includes('--apply');
const counts = await backfillEventLeads(db, clientId, { days, apply });
console.log(apply ? 'Gravado:' : 'Simulação (nada gravado):', counts);
process.exit(0);
