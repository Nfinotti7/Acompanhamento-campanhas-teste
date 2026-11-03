// Agendador do lembrete de reserva, da avaliação pós-visita e do relatório do dono.
// Roda a cada 5 minutos. Cada envio é "reservado" no banco antes de sair (followupBot.js,
// ownerReport.js), então dois processos ao mesmo tempo (deploy) não mandam em dobro.
import { runReminders, runReviewRequests } from './followupBot.js';
import { runWeeklyReports } from './ownerReport.js';
import { runVacancySweep } from './vacancyWaitlist.js';
import { runCampaignAlerts } from './campaignInsights.js';

export const TICK_MS = 5 * 60e3;
const FIRST_TICK_MS = 60e3;

export async function followupTick(deps = {}) {
  const jobs = [
    ['lembretes', deps.runReminders || runReminders],
    ['avaliações', deps.runReviewRequests || runReviewRequests],
    ['relatório do dono', deps.runWeeklyReports || runWeeklyReports],
    ['avisos de vaga', deps.runVacancySweep || runVacancySweep],
    ['alertas de campanha', deps.runCampaignAlerts || runCampaignAlerts]
  ];
  for (const [name, job] of jobs) {
    try {
      const count = await job();
      if (count > 0) console.log(`Acompanhamento: ${count} ${name} enviado(s)`);
    } catch (error) {
      // Um job com erro não pode impedir os outros.
      console.error(`Acompanhamento (${name}): erro:`, error.message);
    }
  }
}

export function startFollowupScheduler(deps = {}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await followupTick(deps);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, FIRST_TICK_MS).unref();
  return setInterval(tick, TICK_MS).unref();
}
