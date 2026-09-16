import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import DashboardPage from './pages/DashboardPage';
import CredentialsPage from './pages/CredentialsPage';
import RemarketingPage from './pages/RemarketingPage';
import TrackingPage from './pages/TrackingPage';
import ClientsPage from './pages/ClientsPage';
import LoginPage from './pages/LoginPage';
import CampaignsTable from './components/CampaignsTable';

function MainApp() {
  const { user, loading: authLoading, selectedClientId, setSelectedClientId } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  // Filters
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [selectedRange, setSelectedRange] = useState('30d');

  // Data states
  const [clients, setClients] = useState([]);
  const [summary, setSummary] = useState(null);
  const [dailyData, setDailyData] = useState([]);
  const [platformBreakdown, setPlatformBreakdown] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  // Single-campaign drill-down mode
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [campaignSummary, setCampaignSummary] = useState(null);
  const [campaignDaily, setCampaignDaily] = useState([]);

  useEffect(() => {
    if (user && user.role === 'admin') {
      fetchClients();
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, selectedClientId, selectedPlatform, selectedRange]);

  // A campaign belongs to one client — drop the selection when the client filter changes
  useEffect(() => {
    setSelectedCampaignId(null);
  }, [selectedClientId]);

  useEffect(() => {
    if (selectedCampaignId) {
      fetchCampaignDaily(selectedCampaignId);
    }
  }, [selectedCampaignId, selectedRange]);

  const fetchCampaignDaily = async (campaignId) => {
    setDataLoading(true);
    try {
      const res = await axios.get(`/api/campaigns/${campaignId}/daily`, {
        params: { range: selectedRange }
      });
      setCampaignSummary(res.data.summary);
      setCampaignDaily(res.data.dailyData || []);
    } catch (err) {
      console.error('Error fetching campaign daily metrics:', err);
    } finally {
      setDataLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const res = await axios.get('/api/clients');
      setClients(res.data.clients || []);
    } catch (err) {
      console.error('Error fetching clients:', err);
    }
  };

  const fetchData = async () => {
    setDataLoading(true);
    try {
      const [metricsRes, campaignsRes] = await Promise.all([
        axios.get('/api/metrics/summary', {
          params: {
            clientId: selectedClientId,
            platform: selectedPlatform,
            range: selectedRange
          }
        }),
        axios.get('/api/campaigns', {
          params: {
            clientId: selectedClientId,
            platform: selectedPlatform
          }
        })
      ]);

      setSummary(metricsRes.data.summary);
      setDailyData(metricsRes.data.dailyData || []);
      setPlatformBreakdown(metricsRes.data.platformBreakdown || []);
      setCampaigns(campaignsRes.data.campaigns || []);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setDataLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await axios.post('/api/campaigns/sync', { clientId: selectedClientId });
      setSyncResult({ type: 'success', message: res.data.message, details: res.data.results });
      await fetchData();
    } catch (err) {
      setSyncResult({
        type: 'error',
        message: err.response?.data?.error || 'Erro ao sincronizar campanhas.',
        details: null
      });
    } finally {
      setIsSyncing(false);
    }
  };

  if (authLoading) {
    return (
      <div style={{
        height: '100vh',
        backgroundColor: 'var(--bg-dark)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)'
      }}>
        Inicializando Further Ads...
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-dark)' }}>
      {/* Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Navbar
          clients={clients}
          selectedClient={selectedClientId}
          setSelectedClient={setSelectedClientId}
          selectedPlatform={selectedPlatform}
          setSelectedPlatform={setSelectedPlatform}
          selectedRange={selectedRange}
          setSelectedRange={setSelectedRange}
          onSync={handleSync}
          isSyncing={isSyncing}
        />

        <main style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
          {syncResult && (
            <div
              className="glass-card"
              style={{
                padding: '16px 20px',
                marginBottom: '20px',
                border: syncResult.type === 'error' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <strong style={{ color: syncResult.type === 'error' ? '#f87171' : '#34d399' }}>
                  {syncResult.message}
                </strong>
                <button onClick={() => setSyncResult(null)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                  Fechar
                </button>
              </div>

              {syncResult.details && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
                  {syncResult.details.map((r) => (
                    <div key={r.clientId} style={{ color: 'var(--text-secondary)' }}>
                      <strong style={{ color: '#fff' }}>{r.clientName}:</strong>{' '}
                      Google {r.google.status === 'ok' ? `✔ (${r.google.campaigns} campanhas)` : r.google.status === 'skipped' ? '— sem credenciais' : `✖ ${r.google.error}`}
                      {' · '}
                      Meta {r.meta.status === 'ok' ? `✔ (${r.meta.campaigns} campanhas)` : r.meta.status === 'skipped' ? '— sem credenciais' : `✖ ${r.meta.error}`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'dashboard' && (
            <DashboardPage
              summary={selectedCampaignId ? campaignSummary : summary}
              dailyData={selectedCampaignId ? campaignDaily : dailyData}
              platformBreakdown={platformBreakdown}
              campaigns={campaigns}
              loading={dataLoading}
              selectedCampaignId={selectedCampaignId}
              setSelectedCampaignId={setSelectedCampaignId}
            />
          )}

          {activeTab === 'campaigns' && (
            <div className="animate-fade-in">
              <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginBottom: '24px' }}>
                Gerenciador Completo de Campanhas
              </h1>
              <CampaignsTable campaigns={campaigns} />
            </div>
          )}

          {activeTab === 'credentials' && (
            <CredentialsPage selectedClient={selectedClientId} />
          )}

          {activeTab === 'remarketing' && (
            <RemarketingPage selectedClient={selectedClientId} />
          )}

          {activeTab === 'tracking' && (
            <TrackingPage selectedClient={selectedClientId} />
          )}

          {activeTab === 'clients' && user.role === 'admin' && (
            <ClientsPage />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
