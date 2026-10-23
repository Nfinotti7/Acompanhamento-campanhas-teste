import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, PlusCircle, Building2, ShieldCheck, Mail, Lock, CheckCircle2, Trash2, Pencil } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const EMPTY_FORM = {
  name: '',
  company: '',
  logo_url: '',
  campaign_prefix: '',
  page_id: '',
  dashboard_enabled: true,
  waitlist_enabled: false,
  reservations_enabled: false,
  whatsapp_ads_only: false,
  data_start_date: '',
  clientUserEmail: '',
  clientUserPassword: ''
};

export default function ClientsPage() {
  const { user, setSelectedClientId } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [message, setMessage] = useState(null);

  const [formData, setFormData] = useState(EMPTY_FORM);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/clients');
      setClients(res.data.clients || []);
    } catch (err) {
      console.error('Error fetching clients:', err);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingClient(null);
    setFormData(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = (client) => {
    setEditingClient(client);
    setFormData({
      name: client.name || '',
      company: client.company || '',
      logo_url: client.logo_url || '',
      campaign_prefix: client.campaign_prefix || '',
      page_id: client.page_id || '',
      dashboard_enabled: client.dashboard_enabled !== false,
      waitlist_enabled: Boolean(client.waitlist_enabled),
      reservations_enabled: Boolean(client.reservations_enabled),
      whatsapp_ads_only: Boolean(client.whatsapp_ads_only),
      data_start_date: client.data_start_date || '',
      clientUserEmail: '',
      clientUserPassword: ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingClient) {
        const res = await axios.put(`/api/clients/${editingClient.id}`, formData);
        setMessage(res.data.message);
      } else {
        const res = await axios.post('/api/clients', formData);
        setMessage(res.data.message);
      }
      setShowModal(false);
      setEditingClient(null);
      setFormData(EMPTY_FORM);
      fetchClients();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao salvar cliente.');
    }
  };

  const handleDelete = async (client) => {
    const confirmed = window.confirm(
      `Remover "${client.name}" (${client.company})? Isso apaga campanhas, métricas, leads e credenciais desse cliente. Essa ação não pode ser desfeita.`
    );
    if (!confirmed) return;

    try {
      const res = await axios.delete(`/api/clients/${client.id}`);
      setMessage(res.data.message);
      fetchClients();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao remover cliente.');
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={28} color="var(--accent-primary)" />
            Gestão de Clientes da Agência
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Cadastre novos clientes e forneça acessos de portal exclusivos
          </p>
        </div>

        <button onClick={openCreateModal} className="btn btn-primary">
          <PlusCircle size={16} />
          <span>Cadastrar Novo Cliente</span>
        </button>
      </div>

      {message && (
        <div style={{
          padding: '14px',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '20px',
          backgroundColor: 'color-mix(in srgb, var(--accent-success) 15%, transparent)',
          color: 'var(--accent-success)',
          border: '1px solid color-mix(in srgb, var(--accent-success) 30%, transparent)',
          fontWeight: 600
        }}>
          {message}
        </div>
      )}

      {/* Clients Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        {clients.map((c) => (
          <div key={c.id} className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '1.2rem',
                  color: 'var(--accent-primary)'
                }}>
                  {c.name.charAt(0)}
                </div>

                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {c.name}
                  </h3>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {c.company}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Campanhas</span>
                  <strong style={{ color: 'var(--text-primary)', fontSize: '1.1rem' }}>{c.total_campaigns || 0}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Investimento Total</span>
                  <strong style={{ color: 'var(--accent-success)', fontSize: '1.1rem' }}>
                    R$ {(c.total_spend || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>

              {c.campaign_prefix && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Prefixo de campanha: <strong style={{ color: 'var(--text-secondary)' }}>{c.campaign_prefix}</strong>
                </div>
              )}

              {c.data_start_date && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Dados a partir de: <strong style={{ color: 'var(--text-secondary)' }}>{c.data_start_date.split('-').reverse().join('/')}</strong>
                </div>
              )}

              {c.waitlist_enabled && (
                <span style={{ display: 'inline-block', marginBottom: '12px', padding: '2px 8px', borderRadius: '999px', background: 'color-mix(in srgb, var(--accent-warning) 15%, transparent)', color: 'var(--accent-warning)', fontSize: '0.75rem', fontWeight: 700 }}>
                  Na Mesa{c.dashboard_enabled === false ? ' (só fila)' : ''}
                </span>
              )}
              {c.reservations_enabled && (
                <span style={{ display: 'inline-block', marginBottom: '12px', marginLeft: '6px', padding: '2px 8px', borderRadius: '999px', background: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)', color: 'var(--accent-link)', fontSize: '0.75rem', fontWeight: 700 }}>
                  Reservas
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setSelectedClientId(c.id)}
                className="btn btn-secondary"
                style={{ flex: 1, fontSize: '0.85rem' }}
              >
                Visualizar Dashboard Deste Cliente
              </button>
              <button
                onClick={() => openEditModal(c)}
                className="btn btn-secondary"
                title="Editar cliente"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => handleDelete(c)}
                className="btn btn-secondary"
                title="Remover cliente"
                style={{ color: 'var(--accent-danger)', borderColor: 'color-mix(in srgb, var(--accent-danger) 30%, transparent)' }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Create/Edit Client */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'var(--overlay)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
          zIndex: 9000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', padding: '32px', backgroundColor: 'var(--bg-card)' }}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>
              {editingClient ? 'Editar Cliente' : 'Cadastrar Novo Cliente'}
            </h3>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nome do Contato / Responsável</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="Ex: Carlos Andrade"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Nome da Empresa / Marca</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="Ex: Acme Corp E-commerce"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                />
              </div>

              <hr style={{ borderColor: 'var(--border-color)', margin: '20px 0' }} />

              <h4 style={{ fontSize: '0.95rem', color: 'var(--accent-primary)', marginBottom: '12px' }}>
                Conta de Anúncios Compartilhada (opcional)
              </h4>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Só preencha se este cliente divide a mesma conta de anúncios Meta com outro
                cliente. O prefixo precisa bater exatamente com o início do nome das
                campanhas deste cliente, incluindo o traço.
              </p>

              <div className="form-group">
                <label className="form-label">Prefixo de Campanha</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ex: RECREIO -"
                  value={formData.campaign_prefix}
                  onChange={(e) => setFormData({ ...formData, campaign_prefix: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Page ID do Facebook (checagem extra, opcional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ex: 1282809294918568 (ou várias, separadas por vírgula)"
                  value={formData.page_id}
                  onChange={(e) => setFormData({ ...formData, page_id: e.target.value })}
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '-8px', marginBottom: '12px' }}>
                  Cliente anuncia por mais de uma Página do Facebook? Separe os IDs por vírgula (ex: 111,222).
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">Mostrar dados de anúncio a partir de (opcional)</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.data_start_date}
                  onChange={(e) => setFormData({ ...formData, data_start_date: e.target.value })}
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '-8px', marginBottom: '12px' }}>
                  Use quando a conta era de outro gestor antes. Ao salvar, as métricas anteriores a essa data são apagadas do painel.
                </p>
              </div>

              <div className="form-group" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="checkbox" checked={formData.dashboard_enabled}
                    onChange={(e) => setFormData({ ...formData, dashboard_enabled: e.target.checked })} />
                  Dashboard e CRM
                </label>
                <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="checkbox" checked={formData.waitlist_enabled}
                    onChange={(e) => setFormData({ ...formData, waitlist_enabled: e.target.checked })} />
                  Na Mesa (fila de espera)
                </label>
                <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="checkbox" checked={formData.reservations_enabled}
                    onChange={(e) => setFormData({ ...formData, reservations_enabled: e.target.checked })} />
                  Reservas pelo WhatsApp
                </label>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="checkbox" checked={formData.whatsapp_ads_only}
                    onChange={(e) => setFormData({ ...formData, whatsapp_ads_only: e.target.checked })} />
                  O WhatsApp deste cliente só roda em anúncio
                </label>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '12px' }}>
                  Contato novo que chegar sem o cartão do anúncio (o lead fechou a prévia, por exemplo) conta como Meta Ads, sem campanha. Não vale pra quem já conversou antes.
                </p>
              </div>

              {!editingClient && (
                <>
                  <hr style={{ borderColor: 'var(--border-color)', margin: '20px 0' }} />

                  <h4 style={{ fontSize: '0.95rem', color: 'var(--accent-primary)', marginBottom: '12px' }}>
                    Credenciais de Acesso do Cliente (Portal)
                  </h4>

                  <div className="form-group">
                    <label className="form-label">E-mail de Login do Cliente</label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="cliente@empresa.com"
                      value={formData.clientUserEmail}
                      onChange={(e) => setFormData({ ...formData, clientUserEmail: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Senha Inicial</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Defina uma senha segura"
                      value={formData.clientUserPassword}
                      onChange={(e) => setFormData({ ...formData, clientUserPassword: e.target.value })}
                    />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setEditingClient(null); }}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingClient ? 'Salvar Alterações' : 'Criar Cliente & Acesso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
