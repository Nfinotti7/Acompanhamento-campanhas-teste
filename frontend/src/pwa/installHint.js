export function installHintFor({ userAgent, standalone, hasPrompt, dismissed }) {
  if (standalone || dismissed) return null;
  if (hasPrompt) return 'android';
  const ua = userAgent || '';
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIOS && isSafari ? 'ios' : null;
}
