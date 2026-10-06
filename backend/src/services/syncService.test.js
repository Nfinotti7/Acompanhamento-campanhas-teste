import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetaCredentialsConfig, getMetaAccountMembers, storeClassifiedRows, syncClients } from './syncService.js';

function makeFakeTx() {
  const calls = [];
  let nextId = 1;
  const tx = {
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (/RETURNING id/.test(sql)) {
        return { rows: [{ id: nextId++ }] };
      }
      return { rows: [] };
    }
  };
  return { tx, calls };
}

const baseClassifiedRow = (overrides) => ({
  campaignId: 'c1', campaignName: 'Campanha', status: 'ACTIVE', budget: 50,
  resolvedClientId: 5, classification: 'ok',
  date: '2026-10-01', spend: 10, clicks: 1, impressions: 100, reach: 90, conversions: 0, conversionValue: 0,
  ...overrides
});

test('parseMetaCredentialsConfig retorna null para JSON invalido', () => {
  assert.equal(parseMetaCredentialsConfig('{invalido'), null);
});

test('parseMetaCredentialsConfig retorna null quando falta ad_account_id', () => {
  assert.equal(parseMetaCredentialsConfig(JSON.stringify({ access_token: 'tok' })), null);
});

test('parseMetaCredentialsConfig retorna null quando falta access_token', () => {
  assert.equal(parseMetaCredentialsConfig(JSON.stringify({ ad_account_id: 'act_1' })), null);
});

test('parseMetaCredentialsConfig retorna a config quando valida', () => {
  const result = parseMetaCredentialsConfig(JSON.stringify({ ad_account_id: 'act_1', access_token: 'tok' }));
  assert.deepEqual(result, { ad_account_id: 'act_1', access_token: 'tok' });
});

// C1: campanha ja sincronizada sob um dono fica presa a esse dono pra sempre
// se a linha antiga nunca for removida quando a classificacao muda.
test('storeClassifiedRows remove a linha do dono antigo quando a campanha e reclassificada pra outro cliente', async () => {
  const { tx, calls } = makeFakeTx();
  const rows = [baseClassifiedRow({ campaignId: 'c1', resolvedClientId: 6, classification: 'ok' })];

  await storeClassifiedRows('meta', rows, { withTransaction: (fn) => fn(tx) });

  const deleteCalls = calls.filter((c) => /DELETE FROM campaigns/.test(c.sql));
  assert.equal(deleteCalls.length, 1);
  assert.match(deleteCalls[0].sql, /client_id IS DISTINCT FROM/);
  assert.deepEqual(deleteCalls[0].params, ['meta', 'c1', 6]);
});

test('storeClassifiedRows remove o dono antigo quando a campanha passa a ficar escondida', async () => {
  const { tx, calls } = makeFakeTx();
  const rows = [baseClassifiedRow({ campaignId: 'c2', resolvedClientId: null, classification: 'inconsistent' })];

  await storeClassifiedRows('meta', rows, { withTransaction: (fn) => fn(tx) });

  const deleteOwnedCalls = calls.filter((c) => /DELETE FROM campaigns/.test(c.sql) && /client_id IS NOT NULL/.test(c.sql));
  assert.equal(deleteOwnedCalls.length, 1);
  assert.deepEqual(deleteOwnedCalls[0].params, ['meta', 'c2']);
});

// I1: cliente com ad_account_id cadastrado mas sem access_token precisa continuar
// contando como membro do grupo, senao o grupo "encolhe" pra 1 cliente e a
// classificacao por prefixo/pagina e pulada por engano (reabrindo o vazamento).
test('getMetaAccountMembers inclui cliente sem access_token como membro do grupo', async () => {
  const fakeDb = {
    query: async () => ({
      rows: [
        { client_id: 5, campaign_prefix: 'RECREIO -', page_id: null, config_json: JSON.stringify({ ad_account_id: 'act_999', access_token: 'tok-recreio' }) },
        { client_id: 6, campaign_prefix: 'MALIBU -', page_id: null, config_json: JSON.stringify({ ad_account_id: 'act_999' }) }
      ]
    })
  };

  const members = await getMetaAccountMembers('act_999', { db: fakeDb });

  assert.equal(members.length, 2);
  const malibu = members.find((m) => m.clientId === 6);
  assert.equal(malibu.accessToken, null);
});

test('getMetaAccountMembers ignora credencial com JSON invalido sem derrubar os outros membros', async () => {
  const fakeDb = {
    query: async () => ({
      rows: [
        { client_id: 5, campaign_prefix: 'RECREIO -', page_id: null, config_json: '{invalido' },
        { client_id: 6, campaign_prefix: 'MALIBU -', page_id: null, config_json: JSON.stringify({ ad_account_id: 'act_999', access_token: 'tok' }) }
      ]
    })
  };

  const members = await getMetaAccountMembers('act_999', { db: fakeDb });

  assert.equal(members.length, 1);
  assert.equal(members[0].clientId, 6);
});

// I2: um grupo compartilhado com erro (DB fora do ar, ad_account_id malformado em
// outro cliente etc) nao pode derrubar a sincronizacao dos clientes de outra conta.
test('syncClients isola erro de um grupo meta sem afetar outros clientes', async () => {
  const fakeGetCredentials = async (clientId, platform) => {
    if (platform === 'google') return null;
    if (clientId === 1) return { ad_account_id: 'act_A', access_token: 'tok' };
    if (clientId === 2) return { ad_account_id: 'act_B', access_token: 'tok' };
    return null;
  };
  const fakeSyncMetaAccountGroup = async (accountId) => {
    if (accountId === 'act_A') throw new Error('falha de rede na Meta');
    return { 2: { status: 'ok', campaigns: 1, rows: 3 } };
  };

  const results = await syncClients([1, 2], {
    getCredentials: fakeGetCredentials,
    syncMetaAccountGroup: fakeSyncMetaAccountGroup
  });

  const r1 = results.find((r) => r.clientId === 1);
  const r2 = results.find((r) => r.clientId === 2);
  assert.equal(r1.meta.status, 'error');
  assert.equal(r2.meta.status, 'ok');
  assert.equal(r2.meta.campaigns, 1);
});
