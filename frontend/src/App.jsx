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
    try {
      await axios.post('/api/campaigns/sync', { clientId: selectedClientId });
      await fetchData();
    } catch (err) {
      console.error('Sync failed:', err);
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
          {activeTab === 'dashboard' && (
            <DashboardPage
              summary={summary}
              dailyData={dailyData}
              platformBreakdown={platformBreakdown}
              campaigns={campaigns}
              loading={dataLoading}
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
