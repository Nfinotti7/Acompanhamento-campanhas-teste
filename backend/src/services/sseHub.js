// Hub de pub/sub em memoria pra Server-Sent Events, escopado por client_id.
// Desacoplado do Express de proposito: "writer" e so uma funcao que recebe o
// texto bruto no formato SSE -- em producao e `(payload) => res.write(payload)`,
// em teste pode ser qualquer função fake.

const subscribersByClientId = new Map();

// clientId chega como number quando vem do banco (ex: client_id de uma linha) e
// como string quando vem de query string (ex: EventSource não manda header, só
// query param). Normaliza pra chave sempre ser a mesma, senão "5" e 5 viram
// canais diferentes nesse Map e o broadcast nunca alcança o inscrito.
function normalize(clientId) {
  return String(clientId);
}

export function subscribe(clientId, writer) {
  const key = normalize(clientId);
  if (!subscribersByClientId.has(key)) {
    subscribersByClientId.set(key, new Set());
  }
  subscribersByClientId.get(key).add(writer);

  return function unsubscribe() {
    const set = subscribersByClientId.get(key);
    if (!set) return;
    set.delete(writer);
    if (set.size === 0) subscribersByClientId.delete(key);
  };
}

// Com mais de um processo do servidor, o Caixa pode estar ligado num processo diferente
// do que gerou o evento. O relay (server.js -> processRelay.js) leva o evento pros outros.
let relay = null;
export function setBroadcastRelay(fn) {
  relay = fn;
}

export function broadcast(clientId, eventName, data) {
  deliverLocal(clientId, eventName, data);
  if (relay) {
    try {
      relay(clientId, eventName, data);
    } catch {
      // relay é fire-and-forget; a entrega local já aconteceu
    }
  }
}

// Entrega só pros inscritos deste processo (usado também pro evento vindo de outro processo).
export function deliverLocal(clientId, eventName, data) {
  const set = subscribersByClientId.get(normalize(clientId));
  if (!set || set.size === 0) return;

  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const writer of set) {
    try {
      writer(payload);
    } catch {
      // Conexao já fechada/inválida -- o handler de 'close' do controller
      // é quem remove esse writer via unsubscribe(); aqui só evita que um
      // writer com problema impeça o broadcast pros demais inscritos.
    }
  }
}

export function listenerCount(clientId) {
  return subscribersByClientId.get(normalize(clientId))?.size || 0;
}
