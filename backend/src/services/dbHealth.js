// Aviso de banco enchendo. O Supabase Free trava quando o disco enche (aconteceu em 20/11 e
// 24/11/2026) e aí não dá nem pra apagar dados. O plano grátis permite 500 MB de banco;
// a partir de 70% disso o painel do admin mostra um aviso e o log registra um erro.

export const DB_SIZE_LIMIT_MB = Number(process.env.DB_SIZE_LIMIT_MB) || 500;
export const DB_WARN_PERCENT = Number(process.env.DB_WARN_PERCENT) || 70;

let last = null;

export function evaluate(sizeBytes, limitMb = DB_SIZE_LIMIT_MB, warnPercent = DB_WARN_PERCENT) {
  const limitBytes = limitMb * 1024 * 1024;
  const percent = Math.round((sizeBytes / limitBytes) * 1000) / 10;
  return {
    sizeMb: Math.round((sizeBytes / 1024 / 1024) * 10) / 10,
    limitMb,
    percent,
    warnPercent,
    warn: percent >= warnPercent,
  };
}

export async function checkDbHealth(dbImpl, now = new Date()) {
  const { rows } = await dbImpl.query('SELECT pg_database_size(current_database()) AS size');
  const { rows: tables } = await dbImpl.query(
    `SELECT relname AS name, pg_total_relation_size(relid) AS size
       FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 3`
  );
  last = {
    ...evaluate(Number(rows[0].size)),
    biggest: tables.map((t) => ({ name: t.name, sizeMb: Math.round((Number(t.size) / 1024 / 1024) * 10) / 10 })),
    checkedAt: now.toISOString(),
  };
  if (last.warn) {
    console.error(
      `ALERTA banco: ${last.sizeMb} MB de ${last.limitMb} MB (${last.percent}%). Maiores tabelas: ` +
      last.biggest.map((t) => `${t.name} ${t.sizeMb} MB`).join(', ')
    );
  }
  return last;
}

export function lastDbHealth() {
  return last;
}
