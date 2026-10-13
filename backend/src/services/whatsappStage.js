const DAY_MS = 24 * 60 * 60 * 1000;

export function computeStage({ hasConversion, appointmentAt, hasOutbound, lastActivityAt, remarketingDays = 3, now = new Date() }) {
  if (hasConversion) return 'compareceu';

  if (appointmentAt) {
    return new Date(appointmentAt) > now ? 'agendado' : 'nao_compareceu';
  }

  if (!lastActivityAt) return 'remarketing';

  const withinWindow = (now - new Date(lastActivityAt)) <= remarketingDays * DAY_MS;
  if (!withinWindow) return 'remarketing';

  return hasOutbound ? 'em_atendimento' : 'novo_lead';
}

export const STAGE_KEYS = ['novo_lead', 'em_atendimento', 'agendado', 'nao_compareceu', 'compareceu', 'remarketing'];

export function isValidManualStage(value) {
  if (value === null || value === undefined) return true;
  return STAGE_KEYS.includes(value);
}
