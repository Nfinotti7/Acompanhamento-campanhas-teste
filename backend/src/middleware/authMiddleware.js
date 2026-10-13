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
    req.user = user;
    next();
  });
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito para administradores da agência.' });
  }
  next();
}

export { JWT_SECRET };
