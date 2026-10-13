import React from 'react';

// <img>/<audio>/<video> não mandam header de Authorization, então a URL carrega o token
// do próprio cliente HTTP (axios global no admin, caixaApi no /caixa).
export function mediaUrl(apiClient, mediaId, clientId) {
  const auth = apiClient?.defaults?.headers?.common?.Authorization || '';
  const params = new URLSearchParams({ token: auth.replace('Bearer ', '') });
  if (clientId) params.set('clientId', clientId);
  return `/api/whatsapp/media/${mediaId}?${params.toString()}`;
}

const AVATAR_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444'];

function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Avatar({ apiClient, clientId, mediaId, name, size = 36 }) {
  const [failed, setFailed] = React.useState(false);
  const color = AVATAR_COLORS[(name || '').length % AVATAR_COLORS.length];
  const base = { width: size, height: size, borderRadius: '50%', flexShrink: 0 };

  if (mediaId && !failed) {
    return (
      <img
        src={mediaUrl(apiClient, mediaId, clientId)}
        alt={name || ''}
        onError={() => setFailed(true)}
        style={{ ...base, objectFit: 'cover' }}
      />
    );
  }

  return (
    <div style={{ ...base, backgroundColor: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.38 }}>
      {initials(name)}
    </div>
  );
}

// Rótulos que o backend grava como corpo quando a mídia não tem legenda -- com a mídia
// em si aparecendo na conversa, o rótulo vira redundante.
const PLACEHOLDER_PREFIXES = ['📷', '🎞️', '🎤', '🎵', '😊', '📎'];

export function isPlaceholderBody(body) {
  return PLACEHOLDER_PREFIXES.some((prefix) => (body || '').startsWith(prefix));
}

// onLoad: a imagem só ganha altura quando carrega -- avisa quem rola a conversa pro fim.
export function MessageMedia({ message, apiClient, clientId, onOpenImage, onLoad }) {
  if (!message.media_type) return null;
  if (!message.media_id) {
    return <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>Mídia indisponível</div>;
  }

  const src = mediaUrl(apiClient, message.media_id, clientId);

  if (message.media_type === 'image' || message.media_type === 'sticker') {
    return (
      <img
        src={src}
        alt=""
        onClick={() => onOpenImage(src)}
        onLoad={onLoad}
        style={{ display: 'block', maxWidth: message.media_type === 'sticker' ? 140 : 260, maxHeight: 260, borderRadius: 8, cursor: 'zoom-in' }}
      />
    );
  }
  if (message.media_type === 'audio') {
    return <audio controls preload="none" src={src} style={{ maxWidth: 260 }} />;
  }
  if (message.media_type === 'video') {
    return <video controls preload="metadata" src={src} onLoadedMetadata={onLoad} style={{ display: 'block', maxWidth: 280, maxHeight: 280, borderRadius: 8 }} />;
  }
  return (
    <a href={src} download={message.media_filename || 'arquivo'} style={{ color: '#c7d2fe', textDecoration: 'underline' }}>
      📎 {message.media_filename || 'Baixar documento'}
    </a>
  );
}

export function ImageLightbox({ src, onClose }) {
  if (!src) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, cursor: 'zoom-out', padding: 20 }}
    >
      <img src={src} alt="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
    </div>
  );
}
