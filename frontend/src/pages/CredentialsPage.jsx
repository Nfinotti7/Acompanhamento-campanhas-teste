import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { KeyRound, CheckCircle2, AlertCircle, Save, ShieldAlert, Info, MessageCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import GoogleCsvImport from '../components/GoogleCsvImport';

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
    customer_id: '',
    login_customer_id: ''
  });

  const [metaForm, setMetaForm] = useState({
    access_token: '',
    ad_account_id: '',
    pixel_id: '',
    webhook_secret: ''
  });

  const [whatsappForm, setWhatsappForm] = useState({
    phoneNumberId: '',
    wabaId: '',
    accessToken: '',
    displayPhoneNumber: '',
    pin: '',
    connectionType: 'cloud_api'
  });
  const [hasWhatsappSettings, setHasWhatsappSettings] = useState(false);
  const [baileysStatus, setBaileysStatus] = useState(null);

  const targetClientId = user?.role === 'admin' ? selectedClient : user?.clientId;

  useEffect(() => {
    if (targetClientId) {
      fetchCredentials();
      fetchWhatsappSettings();
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

  const fetchWhatsappSettings = async () => {
    try {
      const res = await axios.get(`/api/whatsapp/settings/${targetClientId}`);
      const settings = res.data.settings;
      setHasWhatsappSettings(!!settings);
      if (settings) {
        setWhatsappForm(prev => ({
          ...prev,
          phoneNumberId: settings.connection_type === 'baileys' ? '' : (settings.phone_number_id || ''),
          wabaId: settings.connection_type === 'baileys' ? '' : (settings.waba_id || ''),
          displayPhoneNumber: settings.display_phone_number || '',
          accessToken: '',
          pin: '',
          connectionType: settings.connection_type || 'cloud_api'
        }));
      }
    } catch (err) {
      console.error('Error fetching WhatsApp settings:', err);
    }
  };

  const fetchBaileysStatus = async () => {
    try {
      const res = await axios.get('/api/whatsapp/baileys/status', { params: { clientId: targetClientId } });
      setBaileysStatus(res.data);
    } catch (err) {
      setBaileysStatus({ status: 'error', error: err.response?.data?.error || 'Erro ao conectar.' });
    }
  };

  useEffect(() => {
    if (activePlatform !== 'whatsapp' || whatsappForm.connectionType !== 'baileys' || !targetClientId) return;
    fetchBaileysStatus();
    const interval = setInterval(fetchBaileysStatus, 4000);
    return () => clearInterval(interval);
  }, [activePlatform, whatsappForm.connectionType, targetClientId]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      if (activePlatform === 'whatsapp') {
        const res = await axios.post('/api/whatsapp/settings', {
          clientId: targetClientId,
          ...whatsappForm
        });
        setMessage({ type: 'success', text: res.data.message });
        setWhatsappForm(prev => ({ ...prev, accessToken: '', pin: '' }));
        setHasWhatsappSettings(true);
      } else {
        const config = activePlatform === 'google' ? googleForm : metaForm;
        const res = await axios.post('/api/credentials', {
          clientId: targetClientId,
          platform: activePlatform,
          config
        });
        setMessage({ type: 'success', text: res.data.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Erro ao salvar credenciais.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '900px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
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
          backgroundColor: message.type === 'success' ? 'color-mix(in srgb, var(--accent-success) 15%, transparent)' : 'color-mix(in srgb, var(--accent-danger) 15%, transparent)',
          border: message.type === 'success' ? '1px solid color-mix(in srgb, var(--accent-success) 30%, transparent)' : '1px solid color-mix(in srgb, var(--accent-danger) 30%, transparent)',
          color: message.type === 'success' ? 'var(--accent-success)' : 'var(--accent-danger)'
        }}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{message.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap',
        marginBottom: '24px',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '12px'
      }}>
        <button
          onClick={() => setActivePlatform('google')}
          className="btn"
          style={{
            backgroundColor: activePlatform === 'google' ? 'var(--accent-google)' : 'var(--surface-subtle)',
            color: activePlatform === 'google' ? 'var(--on-accent)' : 'var(--text-secondary)',
            fontWeight: 600
          }}
        >
          Google Ads API
        </button>
        <button
          onClick={() => setActivePlatform('meta')}
          className="btn"
          style={{
            backgroundColor: activePlatform === 'meta' ? 'var(--accent-meta)' : 'var(--surface-subtle)',
            color: activePlatform === 'meta' ? 'var(--on-accent)' : 'var(--text-secondary)',
            fontWeight: 600
          }}
        >
          Meta Ads (Facebook/Instagram Graph API)
        </button>
        <button
          onClick={() => setActivePlatform('whatsapp')}
          className="btn"
          style={{
            backgroundColor: activePlatform === 'whatsapp' ? 'var(--accent-success)' : 'var(--surface-subtle)',
            color: activePlatform === 'whatsapp' ? 'var(--on-accent)' : 'var(--text-secondary)',
            fontWeight: 600
          }}
        >
          WhatsApp Business (Cloud API)
        </button>
      </div>

      {/* Form Container */}
      <form onSubmit={handleSave} className="glass-card" style={{ padding: '32px' }}>
        {activePlatform === 'google' ? (
          <div>
            <div style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'color-mix(in srgb, var(--accent-google) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-google) 20%, transparent)',
              marginBottom: '24px',
              fontSize: '0.85rem',
              color: 'var(--accent-link)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <Info size={18} />
              <span>
                Insira abaixo as credenciais geradas no <strong>Google Cloud Console</strong> e <strong>Google Ads API Center</strong>.
                Desde set/2026 o Google gerencia o nível de acesso pelo projeto do Cloud vinculado ao Client ID/Secret — o Developer Token não é mais obrigatório.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Developer Token (opcional — não é mais exigido pelo Google desde set/2026)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: GADS_DEV_TOK_xxxxxxxxxx (opcional)"
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

            <div className="form-grid-2col">
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

            <div className="form-group">
              <label className="form-label">Manager Customer ID / MCC (obrigatório se a conta do cliente for gerenciada por uma conta gerente)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: 123-456-7890 (ID da sua conta gerenciadora)"
                value={googleForm.login_customer_id}
                onChange={(e) => setGoogleForm({ ...googleForm, login_customer_id: e.target.value })}
              />
            </div>
          </div>
        ) : activePlatform === 'meta' ? (
          <div>
            <div style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'color-mix(in srgb, var(--accent-meta) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-meta) 20%, transparent)',
              marginBottom: '24px',
              fontSize: '0.85rem',
              color: 'var(--accent-link)',
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
                placeholder="Ex: act_1092837465 (ou várias, separadas por vírgula, se o cliente rodar em mais de uma conta)"
                value={metaForm.ad_account_id}
                onChange={(e) => setMetaForm({ ...metaForm, ad_account_id: e.target.value })}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '-8px', marginBottom: '12px' }}>
                Cliente roda campanhas em mais de uma conta Meta? Separe os IDs por vírgula (ex: act_111,act_222).
              </p>
            </div>

            <div className="form-grid-2col">
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
        ) : (
          <div>
            <div style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'color-mix(in srgb, var(--accent-success) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-success) 20%, transparent)',
              marginBottom: '24px',
              fontSize: '0.85rem',
              color: 'var(--accent-success)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <MessageCircle size={18} />
              <span>
                Dados da <strong>WhatsApp Business Cloud API</strong> (número dedicado, separado do WhatsApp comum do cliente).
                {hasWhatsappSettings
                  ? ' Já configurado — deixe Access Token e PIN em branco para manter os valores atuais, ou preencha para trocar.'
                  : ' No primeiro cadastro, Access Token e PIN são obrigatórios.'}
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Tipo de conexão</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setWhatsappForm({ ...whatsappForm, connectionType: 'cloud_api' })}
                  className="btn"
                  style={{
                    backgroundColor: whatsappForm.connectionType === 'cloud_api' ? 'var(--accent-success)' : 'var(--surface-subtle)',
                    color: whatsappForm.connectionType === 'cloud_api' ? 'var(--on-accent)' : 'var(--text-secondary)'
                  }}
                >
                  Oficial (Cloud API)
                </button>
                <button
                  type="button"
                  onClick={() => setWhatsappForm({ ...whatsappForm, connectionType: 'baileys' })}
                  className="btn"
                  style={{
                    backgroundColor: whatsappForm.connectionType === 'baileys' ? 'var(--accent-warning)' : 'var(--surface-subtle)',
                    color: whatsappForm.connectionType === 'baileys' ? 'var(--on-accent)' : 'var(--text-secondary)'
                  }}
                >
                  Não-oficial (WhatsApp Web)
                </button>
              </div>
              {whatsappForm.connectionType === 'baileys' && (
                <p style={{ fontSize: '0.78rem', color: 'var(--accent-warning)', marginTop: '8px' }}>
                  Modo temporário: conecta direto pelo celular (QR code), sem exigir verificação de pagamento da Meta.
                  Não identifica "veio de anúncio" automaticamente, e o número corre risco de bloqueio pelo WhatsApp.
                </p>
              )}
            </div>

            {whatsappForm.connectionType === 'cloud_api' ? (
              <>
                <div className="form-grid-2col">
                  <div className="form-group">
                    <label className="form-label">Phone Number ID (Meta)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Ex: 123456789012345"
                      value={whatsappForm.phoneNumberId}
                      onChange={(e) => setWhatsappForm({ ...whatsappForm, phoneNumberId: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">WhatsApp Business Account ID (WABA ID)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Ex: 987654321098765"
                      value={whatsappForm.wabaId}
                      onChange={(e) => setWhatsappForm({ ...whatsappForm, wabaId: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Access Token {hasWhatsappSettings ? '(deixe em branco para manter o atual)' : ''}
                  </label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder={hasWhatsappSettings ? '••••••••••••••••' : 'Ex: EAAXX_whatsapp_access_token_...'}
                    value={whatsappForm.accessToken}
                    onChange={(e) => setWhatsappForm({ ...whatsappForm, accessToken: e.target.value })}
                    required={!hasWhatsappSettings}
                  />
                </div>
              </>
            ) : (
              <div className="form-group" style={{ textAlign: 'center', padding: '20px' }}>
                {!hasWhatsappSettings ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Salve essas configurações primeiro (com um PIN) pra liberar o QR code de conexão.
                  </p>
                ) : baileysStatus?.status === 'qr' && baileysStatus.qrDataUrl ? (
                  <>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '12px' }}>
                      Abra o WhatsApp no celular do cliente → Configurações → Aparelhos conectados → Conectar um aparelho, e escaneie:
                    </p>
                    <img src={baileysStatus.qrDataUrl} alt="QR code do WhatsApp" style={{ width: '220px', height: '220px' }} />
                  </>
                ) : baileysStatus?.status === 'connected' ? (
                  <p style={{ color: 'var(--accent-success)', fontWeight: 600 }}>✓ Conectado</p>
                ) : baileysStatus?.status === 'connecting' ? (
                  <p style={{ color: 'var(--text-muted)' }}>Conectando...</p>
                ) : baileysStatus?.status === 'standby' ? (
                  <p style={{ color: 'var(--text-muted)' }}>Outro processo do servidor está com a conexão (normal logo após um deploy).</p>
                ) : baileysStatus?.status === 'error' ? (
                  <p style={{ color: 'var(--accent-danger)' }}>{baileysStatus.error}</p>
                ) : baileysStatus?.status === 'disconnected' ? (
                  <p style={{ color: 'var(--text-muted)' }}>Desconectado, tentando de novo...</p>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>Carregando...</p>
                )}
                {baileysStatus?.lastDisconnectReason && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '8px' }}>
                    Última queda: {new Date(baileysStatus.lastDisconnectReason.at).toLocaleString('pt-BR')}
                    {' · '}código {baileysStatus.lastDisconnectReason.statusCode ?? '?'}
                    {baileysStatus.lastDisconnectReason.statusCode === 440 && ' (sessão aberta em outro lugar ao mesmo tempo)'}
                    {baileysStatus.lastDisconnectReason.message ? ` · ${baileysStatus.lastDisconnectReason.message}` : ''}
                  </p>
                )}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Número de Exibição (opcional, só pra referência na tela)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: +55 21 99999-8888"
                value={whatsappForm.displayPhoneNumber}
                onChange={(e) => setWhatsappForm({ ...whatsappForm, displayPhoneNumber: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                PIN do Balcão e do Na Mesa (4 a 8 dígitos) {hasWhatsappSettings ? '(deixe em branco para manter o atual)' : ''}
              </label>
              <input
                type="password"
                inputMode="numeric"
                className="form-input"
                placeholder={hasWhatsappSettings ? '••••' : 'Ex: 1234'}
                value={whatsappForm.pin}
                onChange={(e) => setWhatsappForm({ ...whatsappForm, pin: e.target.value })}
                required={!hasWhatsappSettings}
              />
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

      {activePlatform === 'google' && user?.role === 'admin' && <GoogleCsvImport clientId={targetClientId} />}
    </div>
  );
}
