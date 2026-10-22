import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setBadge, badgeSupported, pushSupported, urlBase64ToUint8Array } from './push.js';

function fakeNavigator() {
  const calls = [];
  return {
    calls,
    nav: {
      setAppBadge: async (n) => calls.push(['set', n]),
      clearAppBadge: async () => calls.push(['clear'])
    }
  };
}

test('bolinha: número positivo mostra, zero limpa', () => {
  const { calls, nav } = fakeNavigator();
  setBadge(3, nav);
  setBadge(0, nav);
  setBadge('2', nav);
  assert.deepEqual(calls, [['set', 3], ['clear'], ['set', 2]]);
});

test('bolinha: navegador sem suporte não quebra', () => {
  assert.equal(badgeSupported({}), false);
  assert.doesNotThrow(() => setBadge(5, {}));
});

test('push: sem PushManager (ex: iPhone fora do app instalado) não oferece notificação', () => {
  assert.equal(pushSupported({ navigator: { serviceWorker: {} }, Notification: {} }), false);
  assert.equal(pushSupported({ navigator: { serviceWorker: {} }, Notification: {}, PushManager: {} }), true);
});

test('chave pública em base64url vira bytes', () => {
  assert.deepEqual([...urlBase64ToUint8Array('AQID_-8')], [1, 2, 3, 255, 239]);
});
