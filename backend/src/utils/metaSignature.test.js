import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { isValidMetaSignature } from './metaSignature.js';

const SECRET = 'app-secret-de-teste';
const body = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
const sign = (buf, secret = SECRET) => 'sha256=' + crypto.createHmac('sha256', secret).update(buf).digest('hex');

test('aceita assinatura correta', () => {
  assert.equal(isValidMetaSignature(body, sign(body), SECRET), true);
});

test('recusa assinatura feita com outro segredo', () => {
  assert.equal(isValidMetaSignature(body, sign(body, 'outro'), SECRET), false);
});

test('recusa corpo alterado depois de assinado', () => {
  const tampered = Buffer.from('{"object":"whatsapp_business_account","entry":[{}]}');
  assert.equal(isValidMetaSignature(tampered, sign(body), SECRET), false);
});

test('recusa cabecalho ausente, malformado ou sem segredo configurado', () => {
  assert.equal(isValidMetaSignature(body, undefined, SECRET), false);
  assert.equal(isValidMetaSignature(body, 'sha1=abc', SECRET), false);
  assert.equal(isValidMetaSignature(body, 'sha256=nao-e-hex', SECRET), false);
  assert.equal(isValidMetaSignature(body, sign(body), ''), false);
  assert.equal(isValidMetaSignature(undefined, sign(body), SECRET), false);
});
