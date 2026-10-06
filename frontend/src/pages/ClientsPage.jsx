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
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
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
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          color: '#34d399',
          border: '1px solid rgba(16, 185, 129, 0.3)',
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
                  backgroundColor: 'rgba(99, 102, 241, 0.15)',
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
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>
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
                  <strong style={{ color: '#fff', fontSize: '1.1rem' }}>{c.total_campaigns || 0}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Investimento Total</span>
                  <strong style={{ color: '#10b981', fontSize: '1.1rem' }}>
                    R$ {(c.total_spend || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>

              {c.campaign_prefix && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Prefixo de campanha: <strong style={{ color: 'var(--text-secondary)' }}>{c.campaign_prefix}</strong>
                </div>
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
                style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' }}
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
          backgroundColor: 'rgba(0,0,0,0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
          zIndex: 9000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', padding: '32px', backgroundColor: 'var(--bg-card)' }}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff', marginBottom: '16px' }}>
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
                  placeholder="Ex: 1282809294918568"
                  value={formData.page_id}
                  onChange={(e) => setFormData({ ...formData, page_id: e.target.value })}
                />
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
