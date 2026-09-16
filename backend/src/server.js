import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './config/db.js';

import { login, getMe } from './controllers/authController.js';
import { listClients, createClient, deleteClient } from './controllers/clientController.js';
import { getCredentials, saveCredentials } from './controllers/credentialsController.js';
import { getMetricsSummary, getCampaigns, getCampaignDaily, syncCampaigns } from './controllers/campaignController.js';
import { captureLead, listLeads, exportRemarketingCSV } from './controllers/leadsController.js';
import { trackEvent, getAttributionReport } from './controllers/attributionController.js';
import { authenticateToken, requireAdmin } from './middleware/authMiddleware.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve static tracker.js script
app.use(express.static(path.join(__dirname, 'public')));

// Serve the built React frontend (backend/frontend-dist)
const frontendDistPath = path.join(__dirname, '../frontend-dist');
app.use(express.static(frontendDistPath));

// Public Endpoints
app.post('/api/auth/login', login);
app.post('/api/v1/capture', captureLead);
app.post('/api/v1/track', trackEvent);

// Protected Endpoints
app.use('/api', authenticateToken);

app.get('/api/auth/me', getMe);

// Clients
app.get('/api/clients', listClients);
app.post('/api/clients', requireAdmin, createClient);
app.delete('/api/clients/:id', requireAdmin, deleteClient);

// Credentials
app.get('/api/credentials', getCredentials);
app.get('/api/credentials/:clientId', requireAdmin, getCredentials);
app.post('/api/credentials', requireAdmin, saveCredentials);

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
  })
  .catch((err) => {
    console.error('Falha ao inicializar o banco de dados:', err);
    process.exit(1);
  });
