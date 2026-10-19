import React, { useState } from 'react';
import { ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import BrandLogo from '../brand/BrandLogo';
import ThemeToggle from '../theme/ThemeToggle';

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

  return (
    <div style={{
      minHeight: '100dvh',
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg-dark)',
      backgroundImage: 'radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--accent-primary) 15%, transparent) 0%, transparent 60%)',
      padding: '20px 16px'
    }}>
      <div style={{ position: 'absolute', top: 'calc(12px + env(safe-area-inset-top))', right: '12px' }}><ThemeToggle /></div>
      <div className="glass-card animate-fade-in" style={{ width: 'min(440px, 100%)', padding: 'clamp(24px, 6vw, 40px)' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '28px' }}>
          <BrandLogo variant="vertical" height={130} />
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '14px' }}>
            Painel de campanhas
          </p>
        </div>

        {error && (
          <div style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'color-mix(in srgb, var(--accent-danger) 15%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent-danger) 30%, transparent)',
            color: 'var(--accent-danger)',
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
            <label className="form-label">E-mail ou usuário</label>
            <input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
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

        <a href="/namesa" style={{ display: 'block', textAlign: 'center', marginTop: '20px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Acessar o Na Mesa (fila de espera) →
        </a>

      </div>
    </div>
  );
}
