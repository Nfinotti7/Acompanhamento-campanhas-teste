import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_further_ads_key_2026';

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  // EventSource (usado pelas conexões de Server-Sent Events) não consegue mandar
  // cabeçalhos customizados, então essa rota autentica via query string em vez
  // do header -- os demais endpoints continuam usando o header normalmente.
  const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'Acesso não autorizado. Token não fornecido.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido ou expirado.' });
    }
    req.user = scopeGroupClient(user, req);
    next();
  });
}

// Login de grupo (um dono com vários restaurantes): o token traz `clientIds` e cada
// requisição escolhe o restaurante por clientId (query/corpo) ou pelo cabeçalho
// X-Client-Id. Só vale um restaurante da lista; senão fica o padrão do usuário.
// Daí pra frente o resto do código só enxerga `req.user.clientId`, como um cliente comum.
export function scopeGroupClient(user, req) {
  if (user?.role !== 'client' || !Array.isArray(user.clientIds)) return user;
  const raw = req.query?.clientId ?? req.body?.clientId ?? req.headers?.['x-client-id'];
  const requested = Number(raw);
  if (!raw || !user.clientIds.includes(requested)) return user;
  return { ...user, clientId: requested };
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito para administradores da agência.' });
  }
  next();
}

export { JWT_SECRET };
