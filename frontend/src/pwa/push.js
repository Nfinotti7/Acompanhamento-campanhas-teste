// Bolinha com número no ícone do app instalado + notificações push (Caixa e Na Mesa).
//
// Com o app aberto, setAppBadge atualiza a bolinha direto (PC/Mac; no iPhone só com
// notificação permitida). Com o app fechado, quem atualiza é o service worker ao receber
// o push (public/sw.js). No Android a bolinha vem das notificações.

export function badgeSupported(nav = globalThis.navigator) {
  return Boolean(nav && 'setAppBadge' in nav);
}

export function setBadge(count, nav = globalThis.navigator) {
  if (!badgeSupported(nav)) return;
  const n = Math.max(0, Number(count) || 0);
  (n > 0 ? nav.setAppBadge(n) : nav.clearAppBadge()).catch(() => {});
}

// iPhone só tem PushManager no app instalado na Tela de Início.
export function pushSupported(win = globalThis.window) {
  return Boolean(win && 'serviceWorker' in win.navigator && 'PushManager' in win && 'Notification' in win);
}

export function permissionState(win = globalThis.window) {
  return pushSupported(win) ? win.Notification.permission : 'unsupported';
}

// A chave pública vem em base64url; o PushManager quer os bytes.
export function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription(createIfMissing, api) {
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription && createIfMissing) {
    const { data } = await api.get('/api/push/public-key');
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey)
    });
  }
  return subscription;
}

// Pede a permissão (precisa ser dentro de um clique, por causa do iPhone) e liga o
// aparelho ao restaurante logado.
export async function enablePush(api, app) {
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  const subscription = await currentSubscription(true, api);
  await api.post('/api/push/subscribe', { app, subscription: subscription.toJSON() });
  return 'granted';
}

// Na entrada do app: se já tem permissão, garante que o servidor conhece este aparelho
// (a inscrição pode ter mudado, ou o login agora é de outro restaurante).
export async function syncPush(api, app) {
  if (permissionState() !== 'granted') return;
  try {
    const subscription = await currentSubscription(true, api);
    await api.post('/api/push/subscribe', { app, subscription: subscription.toJSON() });
  } catch (error) {
    console.error('Notificações:', error);
  }
}

// Sair: o aparelho para de receber avisos deste restaurante neste app.
// authorization: o cabeçalho do login, capturado antes de o app apagar a sessão.
export async function disablePush(api, app, authorization) {
  setBadge(0);
  if (permissionState() !== 'granted') return;
  try {
    const subscription = await currentSubscription(false, api);
    if (subscription) {
      await api.post('/api/push/unsubscribe', { app, endpoint: subscription.endpoint },
        authorization ? { headers: { Authorization: authorization } } : undefined);
    }
  } catch (error) {
    console.error('Notificações:', error);
  }
}
