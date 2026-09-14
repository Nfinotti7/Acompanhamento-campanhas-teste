// Script local para gerar o Refresh Token OAuth do Google Ads API.
// Uso:
//   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/get-google-refresh-token.js
// Ou, sem variáveis de ambiente, o script pergunta interativamente.
//
// Pré-requisito: no Google Cloud Console, o OAuth Client ID deve ser do tipo
// "App para computador" (Desktop app) — esse tipo aceita redirect para
// http://127.0.0.1:<qualquer porta> sem precisar cadastrar a URI antes.

import http from 'node:http';
import { URL } from 'node:url';
import { exec } from 'node:child_process';
import readline from 'node:readline/promises';

const PORT = 8085;
const REDIRECT_URI = `http://127.0.0.1:${PORT}`;
const SCOPE = 'https://www.googleapis.com/auth/adwords';

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

function openBrowser(url) {
  const platform = process.platform;
  const cmd =
    platform === 'win32' ? `start "" "${url}"` :
    platform === 'darwin' ? `open "${url}"` :
    `xdg-open "${url}"`;
  exec(cmd, () => {});
}

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID || (await ask('OAuth Client ID: '));
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || (await ask('OAuth Client Secret: '));

  if (!clientId || !clientSecret) {
    console.error('Client ID e Client Secret são obrigatórios.');
    process.exit(1);
  }

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  console.log('\nAbrindo o navegador para autorizar o acesso à sua conta Google Ads...');
  console.log('Se não abrir automaticamente, copie e cole esta URL no navegador:\n');
  console.log(authUrl.toString() + '\n');

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url, REDIRECT_URI);
      const code = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (error) {
        res.end(`<h2>Falha na autorização: ${error}</h2>Pode fechar esta aba.`);
        server.close();
        reject(new Error(error));
        return;
      }

      res.end('<h2>Autorização recebida!</h2>Pode fechar esta aba e voltar ao terminal.');
      server.close();
      resolve(code);
    });

    server.listen(PORT, () => openBrowser(authUrl.toString()));
  });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI
    })
  });

  const data = await tokenRes.json();

  if (!tokenRes.ok) {
    console.error('\nErro ao trocar o código por tokens:', data.error_description || data.error || data);
    process.exit(1);
  }

  if (!data.refresh_token) {
    console.error(
      '\nO Google não retornou um refresh_token. Isso costuma acontecer quando essa conta já ' +
      'autorizou esse mesmo app antes. Revogue o acesso em https://myaccount.google.com/permissions ' +
      'e rode o script de novo.'
    );
    process.exit(1);
  }

  console.log('\n=== Sucesso! ===');
  console.log('Refresh Token:', data.refresh_token);
  console.log('\nCole esse valor no campo "OAuth Refresh Token" da tela de Chaves & Integrações do app.');
}

main().catch((err) => {
  console.error('\nErro:', err.message);
  process.exit(1);
});
