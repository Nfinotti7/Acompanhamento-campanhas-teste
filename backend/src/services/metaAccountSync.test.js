import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAndPrepareRows } from './metaAccountSync.js';

const baseRow = (overrides) => ({
  campaignId: 'c1', campaignName: '', date: '2026-10-01', spend: 10, clicks: 1,
  impressions: 100, reach: 90, conversions: 0, conversionValue: 0, status: 'ACTIVE', budget: 50,
  ...overrides
});

// Membro distrator: nunca bate com o nome de nenhuma campanha usada nos testes
// abaixo. Serve só para tirar o grupo do caminho "1 cliente só" (que
// intencionalmente pula toda a classificacao) e forcar a logica real a rodar.
const distractorMember = { clientId: 99, campaignPrefix: 'DISTRATOR -', pageId: null, accessToken: 'tok' };

test('conta com 1 cliente so: atribui tudo direto, sem checar prefixo nem pagina', async () => {
  const rows = [baseRow({ campaignName: 'Qualquer Nome Aqui' })];
  const members = [{ clientId: 5, campaignPrefix: null, pageId: null, accessToken: 'tok' }];
  const result = await classifyAndPrepareRows(rows, members, 'tok', {
    fetchCampaignPageId: async () => { throw new Error('não deveria ser chamado'); }
  });
  assert.equal(result[0].resolvedClientId, 5);
  assert.equal(result[0].classification, 'ok');
});

test('conta compartilhada: cada campanha vai pro cliente do prefixo certo', async () => {
  const rows = [
    baseRow({ campaignId: 'c1', campaignName: 'RECREIO - Happy Hour' }),
    baseRow({ campaignId: 'c2', campaignName: 'MALIBU - Sushi Night' })
  ];
  const members = [
    { clientId: 5, campaignPrefix: 'RECREIO -', pageId: null, accessToken: 'tok' },
    { clientId: 6, campaignPrefix: 'MALIBU -', pageId: null, accessToken: 'tok' }
  ];
  const result = await classifyAndPrepareRows(rows, members, 'tok', { fetchCampaignPageId: async () => null });
  assert.equal(result.find((r) => r.campaignId === 'c1').resolvedClientId, 5);
  assert.equal(result.find((r) => r.campaignId === 'c2').resolvedClientId, 6);
});

test('prefixo no meio do nome, nao no inicio, fica unclassified', async () => {
  const rows = [baseRow({ campaignName: 'Promo RECREIO - Teste' })];
  const members = [{ clientId: 5, campaignPrefix: 'RECREIO -', pageId: null, accessToken: 'tok' }, distractorMember];
  const result = await classifyAndPrepareRows(rows, members, 'tok', { fetchCampaignPageId: async () => null });
  assert.equal(result[0].resolvedClientId, null);
  assert.equal(result[0].classification, 'unclassified');
});

test('campanha sem prefixo reconhecido fica unclassified', async () => {
  const rows = [baseRow({ campaignName: 'Campanha Sem Prefixo' })];
  const members = [{ clientId: 5, campaignPrefix: 'RECREIO -', pageId: null, accessToken: 'tok' }, distractorMember];
  const result = await classifyAndPrepareRows(rows, members, 'tok', { fetchCampaignPageId: async () => null });
  assert.equal(result[0].classification, 'unclassified');
  assert.equal(result[0].resolvedClientId, null);
});

test('cliente sem campaign_prefix cadastrado nunca absorve campanha de outro', async () => {
  const rows = [baseRow({ campaignName: 'RECREIO - Happy Hour' })];
  const members = [
    { clientId: 5, campaignPrefix: 'RECREIO -', pageId: null, accessToken: 'tok' },
    { clientId: 6, campaignPrefix: null, pageId: null, accessToken: 'tok' }
  ];
  const result = await classifyAndPrepareRows(rows, members, 'tok', { fetchCampaignPageId: async () => null });
  assert.equal(result[0].resolvedClientId, 5);
});

test('page_id configurado e bate: classificacao fica ok', async () => {
  const rows = [baseRow({ campaignName: 'RECREIO - Happy Hour' })];
  const members = [{ clientId: 5, campaignPrefix: 'RECREIO -', pageId: 'PAGE_123', accessToken: 'tok' }, distractorMember];
  const result = await classifyAndPrepareRows(rows, members, 'tok', { fetchCampaignPageId: async () => 'PAGE_123' });
  assert.equal(result[0].classification, 'ok');
  assert.equal(result[0].resolvedClientId, 5);
});

test('page_id configurado e nao bate: fica inconsistente e sem dono', async () => {
  const rows = [baseRow({ campaignName: 'RECREIO - Happy Hour' })];
  const members = [{ clientId: 5, campaignPrefix: 'RECREIO -', pageId: 'PAGE_123', accessToken: 'tok' }, distractorMember];
  const result = await classifyAndPrepareRows(rows, members, 'tok', { fetchCampaignPageId: async () => 'PAGE_999' });
  assert.equal(result[0].classification, 'inconsistent');
  assert.equal(result[0].resolvedClientId, null);
});

test('falha ao buscar a pagina trata como inconsistente, nunca libera por seguranca', async () => {
  const rows = [baseRow({ campaignName: 'RECREIO - Happy Hour' })];
  const members = [{ clientId: 5, campaignPrefix: 'RECREIO -', pageId: 'PAGE_123', accessToken: 'tok' }, distractorMember];
  const result = await classifyAndPrepareRows(rows, members, 'tok', {
    fetchCampaignPageId: async () => { throw new Error('Meta API fora do ar'); }
  });
  assert.equal(result[0].classification, 'inconsistent');
  assert.equal(result[0].resolvedClientId, null);
});

test('mesma campanha em datas diferentes so busca a pagina uma vez (cache)', async () => {
  const rows = [
    baseRow({ campaignId: 'c1', campaignName: 'RECREIO - Happy Hour', date: '2026-10-01' }),
    baseRow({ campaignId: 'c1', campaignName: 'RECREIO - Happy Hour', date: '2026-10-02' })
  ];
  const members = [{ clientId: 5, campaignPrefix: 'RECREIO -', pageId: 'PAGE_123', accessToken: 'tok' }, distractorMember];
  let callCount = 0;
  const result = await classifyAndPrepareRows(rows, members, 'tok', {
    fetchCampaignPageId: async () => { callCount += 1; return 'PAGE_123'; }
  });
  assert.equal(callCount, 1);
  assert.equal(result.length, 2);
  assert.ok(result.every((r) => r.classification === 'ok'));
});
