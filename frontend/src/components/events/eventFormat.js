export const EVENT_TYPE_OPTIONS = [
  { value: 'empresa', label: 'Empresa' },
  { value: 'aniversario', label: 'Aniversário / comemoração' },
  { value: 'a_definir', label: 'Evento (a definir)' }
];

const SHORT = { empresa: 'Empresa', aniversario: 'Aniversário', a_definir: 'Evento' };
const STATUS = { orcamento: 'orçamento', fechado: 'fechado' };

export function eventLabel(type, status) {
  if (!SHORT[type]) return null;
  return STATUS[status] ? `${SHORT[type]} · ${STATUS[status]}` : SHORT[type];
}

// Linhas do quadro de eventos; "before" = quantos chegaram nos 30 dias anteriores.
export function summaryRows({ current, previous }) {
  return [['empresa', 'Empresa'], ['aniversario', 'Aniversário'], ['a_definir', 'A definir'], ['total', 'Total']]
    .filter(([key]) => key !== 'a_definir' || current[key].arrived > 0 || previous[key].arrived > 0)
    .map(([key, label]) => ({ key, label, ...current[key], before: previous[key].arrived }));
}
