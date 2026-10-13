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
import { getBaileysStatus } from './controllers/whatsappBaileysController.js';
import { reconnectAllBaileysClients } from './services/baileysClient.js';
import { setContactStage, setContactNotes, getContactTimeline, deleteContact, getContactAttribution } from './controllers/whatsappContactController.js';
import { streamWhatsAppEvents } from './controllers/whatsappEventsController.js';
import { getMedia } from './controllers/whatsappMediaController.js';
import { resolveMissingAds } from './services/metaAdResolver.js';
import { getWhatsappDashboard } from './controllers/whatsappDashboardController.js';
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

// WhatsApp Contact (CRM: etapa manual, anotacoes, historico)
app.patch('/api/whatsapp/contacts/:contactId/stage', setContactStage);
app.patch('/api/whatsapp/contacts/:contactId/notes', setContactNotes);
app.get('/api/whatsapp/contacts/:contactId/timeline', getContactTimeline);
app.delete('/api/whatsapp/contacts/:contactId', deleteContact);
app.get('/api/whatsapp/contacts/:contactId/attribution', getContactAttribution);
app.get('/api/whatsapp/events', streamWhatsAppEvents);
app.get('/api/whatsapp/media/:mediaId', getMedia);
app.get('/api/whatsapp/dashboard', getWhatsappDashboard);

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
