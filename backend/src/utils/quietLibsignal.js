// A libsignal (usada por dentro do Baileys) imprime no console o objeto inteiro da sessão
// criptográfica do WhatsApp ("Closing session: {... privKey, rootKey ...}"). Isso ia parar
// no log do Hostinger, onde qualquer um com acesso ao painel via as chaves. Aqui essas
// linhas continuam saindo, mas só com o texto, sem o objeto.
const LIBSIGNAL_PREFIXES = [
  'Closing session',
  'Opening session',
  'Removing old closed session',
  'Session already closed',
  'Session already open',
  'Migrating session to',
  'Closing open session in favor of incoming prekey bundle',
  'Closing stale open session'
];

export function isLibsignalLine(first) {
  return typeof first === 'string' && LIBSIGNAL_PREFIXES.some((prefix) => first.startsWith(prefix));
}

export function quietLibsignal(target = console) {
  for (const method of ['log', 'info', 'warn']) {
    const original = target[method].bind(target);
    target[method] = (first, ...rest) => (isLibsignalLine(first) ? original(first) : original(first, ...rest));
  }
}
