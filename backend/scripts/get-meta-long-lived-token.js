// Script local para trocar um Access Token de curta duração do Meta (Graph API)
// por um Access Token de Longa Duração (~60 dias).
//
// Uso:
//   META_APP_ID=xxx META_APP_SECRET=yyy META_SHORT_TOKEN=zzz node scripts/get-meta-long-lived-token.js
// Ou, sem variáveis de ambiente, o script pergunta interativamente.
//
// Onde pegar cada valor:
//   - META_APP_ID / META_APP_SECRET: developers.facebook.com -> seu App -> Configurações do App -> Básico
//   - META_SHORT_TOKEN: developers.facebook.com/tools/explorer -> selecione o App e o usuário,
//     marque as permissões (ads_read, ads_management, business_management) e clique em "Gerar Token de Acesso"

import readline from 'node:readline/promises';

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

async function main() {
  const appId = process.env.META_APP_ID || (await ask('App ID do Meta: '));
  const appSecret = process.env.META_APP_SECRET || (await ask('App Secret do Meta: '));
  const shortToken = process.env.META_SHORT_TOKEN || (await ask('Access Token de curta duração (do Graph API Explorer): '));

  if (!appId || !appSecret || !shortToken) {
    console.error('App ID, App Secret e o token de curta duração são obrigatórios.');
    process.exit(1);
  }

  const url = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('fb_exchange_token', shortToken);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (!res.ok) {
    console.error('\nErro ao trocar o token:', data.error?.message || data);
    process.exit(1);
  }

  console.log('\n=== Sucesso! ===');
  console.log('Access Token de Longa Duração:', data.access_token);
  console.log('Expira em (segundos):', data.expires_in, `(~${Math.round(data.expires_in / 86400)} dias)`);
  console.log('\nCole esse valor no campo "Access Token Meta" da tela de Chaves & Integrações do app.');
}

main().catch((err) => {
  console.error('\nErro:', err.message);
  process.exit(1);
});
