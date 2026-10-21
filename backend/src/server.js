import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './config/db.js';

import { login, getMe } from './controllers/authController.js';
import { listClients, createClient, updateClient, deleteClient } from './controllers/clientController.js';
import { getCredentials, saveCredentials } from './controllers/credentialsController.js';
import { getMetricsSummary, getCampaigns, getCampaignDaily, syncCampaigns } from './controllers/campaignController.js';
import { captureLead, listLeads, exportRemarketingCSV } from './controllers/leadsController.js';
import { trackEvent, getAttributionReport } from './controllers/attributionController.js';
import { getWhatsappSettings, saveWhatsappSettings } from './controllers/whatsappSettingsController.js';
import { listRestaurants, staffLogin } from './controllers/staffAuthController.js';
import { verifyWebhook, receiveWebhook } from './controllers/whatsappWebhookController.js';
import { listConversations, getMessages, replyToConversation, markConversationRead } from './controllers/whatsappConversationsController.js';
import { searchContacts, createConversion, updateConversion, deleteConversion, getRoi } from './controllers/realConversionsController.js';
import { getKanban, getAgenda, setAppointment } from './controllers/whatsappKanbanController.js';
import { getBaileysStatus, resetBaileys, pairingCodeBaileys } from './controllers/whatsappBaileysController.js';
import { reconnectAllBaileysClients } from './services/baileysClient.js';
import { setContactNotes, getContactTimeline, deleteContact, getContactAttribution } from './controllers/whatsappContactController.js';
import { streamWhatsAppEvents } from './controllers/whatsappEventsController.js';
import { getMedia } from './controllers/whatsappMediaController.js';
import { resolveMissingAds } from './services/metaAdResolver.js';
import { getWhatsappDashboard } from './controllers/whatsappDashboardController.js';
import { redirectTrackingLink, listLinks, createLink, updateLink, deleteLink, getCapiSettings, saveCapiSettings, sendCapiTest, listConversionEvents } from './controllers/trackingController.js';
import { getCrmConfig, createStage, updateStage, reorderStages, deleteStage, tagsCrud, teamCrud, getContactCrm, updateContactCrm } from './controllers/crmController.js';
import { getQueue, addEntry, editEntry, callEntry, seatEntry, noShowEntry, removeEntry, requeueEntry, requeueEndEntry, restoreEntry, getSettings as getWaitlistSettings, saveSettings as saveWaitlistSettings, getQr as getWaitlistQr, getReport as getWaitlistReport } from './controllers/waitlistController.js';
import { purgeOldEntries as purgeOldWaitlistEntries } from './services/waitlistReport.js';
import { reservationHandlers } from './controllers/reservationController.js';
import db from './config/db.js';
import { authenticateToken, requireAdmin } from './middleware/authMiddleware.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
// Guarda o corpo cru: o webhook da Meta é assinado sobre os bytes exatos recebidos,
// não sobre o JSON re-serializado.
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

// Serve static tracker.js script
app.use(express.static(path.join(__dirname, 'public')));

// Serve the built React frontend (backend/frontend-dist)
const frontendDistPath = path.join(__dirname, '../frontend-dist');
app.use(express.static(frontendDistPath));

// Public Endpoints
app.post('/api/auth/login', login);
app.post('/api/v1/capture', captureLead);
app.post('/api/v1/track', trackEvent);
app.get('/api/staff/restaurants', listRestaurants);
app.post('/api/staff/login', staffLogin);
app.get('/api/v1/whatsapp/webhook', verifyWebhook);
app.post('/api/v1/whatsapp/webhook', receiveWebhook);

// Link Rastreável (público): grava o clique e redireciona pro WhatsApp.
app.get('/r/:slug', redirectTrackingLink);

// Protected Endpoints
app.use('/api', authenticateToken);

app.get('/api/auth/me', getMe);

// Clients
app.get('/api/clients', listClients);
app.post('/api/clients', requireAdmin, createClient);
app.put('/api/clients/:id', requireAdmin, updateClient);
app.delete('/api/clients/:id', requireAdmin, deleteClient);

// Credentials
app.get('/api/credentials', getCredentials);
app.get('/api/credentials/:clientId', requireAdmin, getCredentials);
app.post('/api/credentials', requireAdmin, saveCredentials);

// WhatsApp Settings
app.get('/api/whatsapp/settings', getWhatsappSettings);
app.get('/api/whatsapp/settings/:clientId', requireAdmin, getWhatsappSettings);
app.post('/api/whatsapp/settings', requireAdmin, saveWhatsappSettings);

// WhatsApp Conversations
app.get('/api/whatsapp/conversations', listConversations);
app.get('/api/whatsapp/conversations/:contactId/messages', getMessages);
app.post('/api/whatsapp/conversations/:contactId/reply', replyToConversation);
app.post('/api/whatsapp/conversations/:contactId/read', markConversationRead);

// Real Conversions & ROI
app.get('/api/whatsapp/contacts/search', searchContacts);
app.post('/api/whatsapp/conversions', createConversion);
app.patch('/api/whatsapp/conversions/:conversionId', updateConversion);
app.delete('/api/whatsapp/conversions/:conversionId', deleteConversion);
app.get('/api/whatsapp/roi', getRoi);

// WhatsApp Kanban & Agenda
app.get('/api/whatsapp/kanban', getKanban);
app.get('/api/whatsapp/agenda', getAgenda);
app.post('/api/whatsapp/contacts/:contactId/appointment', setAppointment);

// WhatsApp Baileys (nao-oficial, WhatsApp Web)
app.get('/api/whatsapp/baileys/status', getBaileysStatus);
app.post('/api/whatsapp/baileys/reset', resetBaileys);
app.post('/api/whatsapp/baileys/pairing-code', pairingCodeBaileys);

// WhatsApp Contact (CRM: etapa manual, anotacoes, historico)
app.get('/api/whatsapp/contacts/:contactId/crm', getContactCrm);
app.patch('/api/whatsapp/contacts/:contactId/crm', updateContactCrm);

// CRM: etapas do funil, tags e equipe (por cliente)
app.get('/api/crm/config', getCrmConfig);
app.post('/api/crm/stages', createStage);
app.put('/api/crm/stages/order', reorderStages);
app.patch('/api/crm/stages/:stageId', updateStage);
app.delete('/api/crm/stages/:stageId', deleteStage);
app.post('/api/crm/tags', tagsCrud.create);
app.patch('/api/crm/tags/:id', tagsCrud.update);
app.delete('/api/crm/tags/:id', tagsCrud.remove);
app.post('/api/crm/team', teamCrud.create);
app.patch('/api/crm/team/:id', teamCrud.update);
app.delete('/api/crm/team/:id', teamCrud.remove);
app.patch('/api/whatsapp/contacts/:contactId/notes', setContactNotes);
app.get('/api/whatsapp/contacts/:contactId/timeline', getContactTimeline);
app.delete('/api/whatsapp/contacts/:contactId', deleteContact);
app.get('/api/whatsapp/contacts/:contactId/attribution', getContactAttribution);
app.get('/api/whatsapp/events', streamWhatsAppEvents);
app.get('/api/whatsapp/media/:mediaId', getMedia);
app.get('/api/whatsapp/dashboard', getWhatsappDashboard);

// Links rastreáveis e Meta Conversions API -- só painel (admin/cliente), não o /caixa.
const denyStaff = (req, res, next) => (req.user.role === 'staff' ? res.status(403).json({ error: 'Sem acesso.' }) : next());
app.get('/api/tracking/links', denyStaff, listLinks);
app.post('/api/tracking/links', denyStaff, createLink);
app.patch('/api/tracking/links/:id', denyStaff, updateLink);
app.delete('/api/tracking/links/:id', denyStaff, deleteLink);
app.get('/api/tracking/capi', denyStaff, getCapiSettings);
app.put('/api/tracking/capi', denyStaff, saveCapiSettings);
app.post('/api/tracking/capi/test', denyStaff, sendCapiTest);
app.get('/api/tracking/events', denyStaff, listConversionEvents);

// Na Mesa (fila de espera) -- recepcionista (staff) e admin.
app.get('/api/waitlist', getQueue);
app.post('/api/waitlist', addEntry);
app.get('/api/waitlist/settings', getWaitlistSettings);
app.put('/api/waitlist/settings', saveWaitlistSettings);
app.get('/api/waitlist/qr', getWaitlistQr);
app.get('/api/waitlist/report', getWaitlistReport);
app.patch('/api/waitlist/:id', editEntry);
app.post('/api/waitlist/:id/call', callEntry);
app.post('/api/waitlist/:id/seat', seatEntry);
app.post('/api/waitlist/:id/no-show', noShowEntry);
app.post('/api/waitlist/:id/remove', removeEntry);
app.post('/api/waitlist/:id/requeue', requeueEntry);
app.post('/api/waitlist/:id/requeue-end', requeueEndEntry);
app.post('/api/waitlist/:id/restore', restoreEntry);

// Reservas pelo WhatsApp -- equipe do restaurante (staff, no Caixa) e admin.
app.get('/api/reservations/settings', reservationHandlers.getSettings);
app.put('/api/reservations/settings', reservationHandlers.saveSettings);
app.get('/api/reservations/availability', reservationHandlers.availability);
app.get('/api/reservations', reservationHandlers.getDay);
app.post('/api/reservations', reservationHandlers.create);
app.patch('/api/reservations/:id', reservationHandlers.update);
app.post('/api/reservations/:id/arrived', reservationHandlers.arrived);
app.post('/api/reservations/:id/no-show', reservationHandlers.noShow);
app.post('/api/reservations/:id/confirm', reservationHandlers.confirm);
app.post('/api/reservations/:id/cancel', reservationHandlers.cancel);
app.post('/api/whatsapp/contacts/:id/bot/pause', reservationHandlers.pauseContactBot);
app.post('/api/whatsapp/contacts/:id/bot/resume', reservationHandlers.resumeContactBot);

// Campaigns & Metrics
app.get('/api/metrics/summary', getMetricsSummary);
app.get('/api/campaigns', getCampaigns);
app.get('/api/campaigns/:id/daily', getCampaignDaily);
app.post('/api/campaigns/sync', syncCampaigns);

// Leads & Remarketing
app.get('/api/leads', listLeads);
app.get('/api/leads/export', exportRemarketingCSV);

// Attribution Tracking
app.get('/api/attribution', getAttributionReport);

// SPA fallback: any non-API route serves the React app
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Backend Ad Campaign Tracker rodando na porta ${PORT}`);
    });
    // Reconecta sozinho as sessoes Baileys existentes -- sem isso, depois de um
    // restart (deploy, crash) a conexao fica parada ate alguem abrir a pagina
    // de Credenciais e disparar getBaileysStatus manualmente.
    // BAILEYS_AUTOCONNECT=false desliga isso pra rodar o backend local contra o banco de
    // produção sem abrir uma sessão de WhatsApp paralela à do servidor.
    resolveMissingAds()
      .then((count) => { if (count > 0) console.log(`Anúncios resolvidos na subida: ${count}`); })
      .catch((err) => console.error('Erro ao resolver anúncios pendentes:', err));

    // Na Mesa: o relatório guarda 7 dias de serviço; o que for mais antigo é apagado.
    const purgeWaitlist = () => purgeOldWaitlistEntries(db)
      .then((count) => { if (count > 0) console.log(`Na Mesa: ${count} entradas antigas apagadas`); })
      .catch((err) => console.error('Erro ao apagar entradas antigas da fila:', err));
    purgeWaitlist();
    setInterval(purgeWaitlist, 6 * 60 * 60 * 1000).unref();

    if (process.env.BAILEYS_AUTOCONNECT !== 'false') {
      reconnectAllBaileysClients().catch((err) => {
        console.error('Erro ao reconectar clientes Baileys na subida:', err);
      });
    }
  })
  .catch((err) => {
    console.error('Falha ao inicializar o banco de dados:', err);
    process.exit(1);
  });
