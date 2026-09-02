import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { KeyRound, CheckCircle2, AlertCircle, Save, ShieldAlert, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function CredentialsPage({ selectedClient }) {
  const { user } = useAuth();
  const [activePlatform, setActivePlatform] = useState('google');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Form states
  const [googleForm, setGoogleForm] = useState({
    developer_token: '',
    client_id: '',
    client_secret: '',
    refresh_token: '',
    customer_id: ''
  });

  const [metaForm, setMetaForm] = useState({
    access_token: '',
    ad_account_id: '',
    pixel_id: '',
    webhook_secret: ''
  });

  const targetClientId = user?.role === 'admin' ? selectedClient : user?.clientId;

  useEffect(() => {
    if (targetClientId) {
      fetchCredentials();
    }
  }, [targetClientId]);

  const fetchCredentials = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/credentials/${targetClientId}`);
      if (res.data.credentials) {
        if (res.data.credentials.google) {
          setGoogleForm(prev => ({ ...prev, ...res.data.credentials.google }));
        }
        if (res.data.credentials.meta) {
          setMetaForm(prev => ({ ...prev, ...res.data.credentials.meta }));
        }
      }
    } catch (err) {
      console.error('Error fetching credentials:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const config = activePlatform === 'google' ? googleForm : metaForm;

    try {
      const res = await axios.post('/api/credentials', {
        clientId: targetClientId,
        platform: activePlatform,
        config
      });
      setMessage({ type: 'success', text: res.data.message });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Erro ao salvar credenciais.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '900px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <KeyRound size={28} color="var(--accent-primary)" />
          Chaves & Integrações de API
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Insira suas credenciais oficiais do Google Ads e Meta Ads para sincronização direta das métricas.
        </p>
      </div>

      {message && (
        <div style={{
          padding: '14px 18px',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          backgroundColor: message.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: message.type === 'success' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
          color: message.type === 'success' ? '#34d399' : '#f87171'
        }}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{message.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '12px'
      }}>
        <button
          onClick={() => setActivePlatform('google')}
          className="btn"
          style={{
            backgroundColor: activePlatform === 'google' ? '#4285f4' : 'rgba(255,255,255,0.05)',
            color: activePlatform === 'google' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 600
          }}
        >
          Google Ads API
        </button>
        <button
          onClick={() => setActivePlatform('meta')}
          className="btn"
          style={{
            backgroundColor: activePlatform === 'meta' ? '#0084ff' : 'rgba(255,255,255,0.05)',
            color: activePlatform === 'meta' ? '#fff' : 'var(--text-secondary)',
            fontWeight: 600
          }}
        >
          Meta Ads (Facebook/Instagram Graph API)
        </button>
      </div>

      {/* Form Container */}
      <form onSubmit={handleSave} className="glass-card" style={{ padding: '32px' }}>
        {activePlatform === 'google' ? (
          <div>
            <div style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(66, 133, 244, 0.1)',
              border: '1px solid rgba(66, 133, 244, 0.2)',
              marginBottom: '24px',
              fontSize: '0.85rem',
              color: '#93c5fd',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <Info size={18} />
              <span>
                Insira abaixo as credenciais geradas no <strong>Google Cloud Console</strong> e <strong>Google Ads API Center</strong>.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Developer Token (Token de Desenvolvedor Google Ads)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: GADS_DEV_TOK_xxxxxxxxxx"
                value={googleForm.developer_token}
                onChange={(e) => setGoogleForm({ ...googleForm, developer_token: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Customer ID (ID da Conta do Cliente)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: 123-456-7890"
                value={googleForm.customer_id}
                onChange={(e) => setGoogleForm({ ...googleForm, customer_id: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">OAuth 2.0 Client ID</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ex: 88723612-gads.apps.googleusercontent.com"
                  value={googleForm.client_id}
                  onChange={(e) => setGoogleForm({ ...googleForm, client_id: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">OAuth 2.0 Client Secret</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Ex: GOCSPX-secret_key_xxxx"
                  value={googleForm.client_secret}
                  onChange={(e) => setGoogleForm({ ...googleForm, client_secret: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">OAuth Refresh Token</label>
              <input
                type="password"
                className="form-input"
                placeholder="Ex: 1//0g_refresh_token_xxxxxxxx"
                value={googleForm.refresh_token}
                onChange={(e) => setGoogleForm({ ...googleForm, refresh_token: e.target.value })}
              />
            </div>
          </div>
        ) : (
          <div>
            <div style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(0, 132, 255, 0.1)',
              border: '1px solid rgba(0, 132, 255, 0.2)',
              marginBottom: '24px',
              fontSize: '0.85rem',
              color: '#7dd3fc',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <Info size={18} />
              <span>
                Obtenha seu <strong>User Access Token de Longa Duração</strong> e <strong>Ad Account ID</strong> no Meta for Developers.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Access Token Meta (Long-Lived Graph API Token)</label>
              <input
                type="password"
                className="form-input"
                placeholder="Ex: EAAXX_meta_access_token_..."
                value={metaForm.access_token}
                onChange={(e) => setMetaForm({ ...metaForm, access_token: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Ad Account ID (ID da Conta de Anúncios Meta)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: act_1092837465"
                value={metaForm.ad_account_id}
                onChange={(e) => setMetaForm({ ...metaForm, ad_account_id: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Pixel ID (Meta Conversions API)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ex: 9928374615243"
                  value={metaForm.pixel_id}
                  onChange={(e) => setMetaForm({ ...metaForm, pixel_id: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Webhook Secret (CAPI/Webhooks)</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Ex: whsec_meta_secret_9981"
                  value={metaForm.webhook_secret}
                  onChange={(e) => setMetaForm({ ...metaForm, webhook_secret: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button type="submit" disabled={saving} className="btn btn-primary">
            <Save size={16} />
            <span>{saving ? 'Salvando Chaves...' : 'Salvar Chaves de API'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
