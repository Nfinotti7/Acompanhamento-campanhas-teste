import React, { useState } from 'react';
import { BarChart3, ShieldCheck, Building2, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao realizar login.');
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (eMail, pass) => {
    setEmail(eMail);
    setPassword(pass);
    setError(null);
    setLoading(true);
    try {
      await login(eMail, pass);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao realizar login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg-dark)',
      backgroundImage: 'radial-gradient(circle at 50% 30%, rgba(99, 102, 241, 0.15) 0%, transparent 60%)',
      padding: '20px'
    }}>
      <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '440px', padding: '40px' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            boxShadow: '0 8px 25px rgba(99, 102, 241, 0.4)'
          }}>
            <BarChart3 size={30} color="#fff" />
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff' }}>Further Ads</h1>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Painel de Campanhas Google Ads & Meta Ads
          </p>
        </div>

        {error && (
          <div style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            fontSize: '0.85rem',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">E-mail de Acesso</label>
            <input
              type="email"
              required
              className="form-input"
              placeholder="seuemail@agencia.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label">Senha</label>
            <input
              type="password"
              required
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', padding: '12px' }}>
            <span>{loading ? 'Entrando...' : 'Entrar no Painel'}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        {/* Quick Login Section for instant testing */}
        <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border-color)' }}>
          <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '12px', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Acesso Rápido para Teste
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={() => quickLogin('admin@agenciafurther.com.br', 'admin123')}
              className="btn btn-secondary"
              style={{ fontSize: '0.82rem', justifyContent: 'flex-start' }}
            >
              <ShieldCheck size={16} color="#6366f1" />
              <span>Entrar como <strong>Agência (Admin)</strong></span>
            </button>

            <button
              onClick={() => quickLogin('cliente@techstore.com.br', 'cliente123')}
              className="btn btn-secondary"
              style={{ fontSize: '0.82rem', justifyContent: 'flex-start' }}
            >
              <Building2 size={16} color="#10b981" />
              <span>Entrar como <strong>Cliente TechStore</strong></span>
            </button>

            <button
              onClick={() => quickLogin('cliente@odontoprime.com.br', 'cliente123')}
              className="btn btn-secondary"
              style={{ fontSize: '0.82rem', justifyContent: 'flex-start' }}
            >
              <Building2 size={16} color="#3b82f6" />
              <span>Entrar como <strong>Cliente Odonto Prime</strong></span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
