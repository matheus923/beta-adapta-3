// Sessao de login individual por usuario (voce e cada analista tem a propria conta).
// O cookie guarda so o ID do usuario + validade, assinado - o papel (gestor/analista,
// 'admin'/'analyst' no codigo) e sempre conferido de novo no banco a cada request,
// nunca confiamos so no cookie para isso.
const crypto = require('crypto');
const { getUserById } = require('./userStore');
const { safeCompare } = require('./safeCompare');

const COOKIE_NAME = 'adaptaecom_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET nao configurada nas variaveis de ambiente.');
  return secret;
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('hex');
}

function createSessionCookie(userId) {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${expires}`;
  const signature = sign(payload);
  const token = `${payload}.${signature}`;
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; SameSite=Lax${isProd ? '; Secure' : ''}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header.split(';').filter(Boolean).map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    })
  );
}

function getSessionUserId(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expiresStr, signature] = parts;
  const payload = `${userId}.${expiresStr}`;

  if (!safeCompare(sign(payload), signature)) return null;
  if (Date.now() > Number(expiresStr)) return null;
  return userId;
}

// Use no topo de qualquer rota que precise de login. Retorna o usuario (com role e
// active atualizados, sempre lidos do banco - nunca confiamos so no cookie para isso)
// se autenticado e autorizado; ja responde com o erro certo (401/403) e retorna null
// caso contrario.
//
// options.roles: lista de papeis permitidos, ex: ['owner'] ou ['admin', 'owner'].
// Omita para so exigir estar logado, sem restricao de papel.
// options.adminOnly: atalho antigo, equivalente a roles: ['admin', 'owner'].
async function requireUser(req, res, { roles, adminOnly = false } = {}) {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ erro: 'Nao autenticado. Faca login.' });
    return null;
  }

  const user = await getUserById(userId);
  if (!user) {
    res.status(401).json({ erro: 'Sessao invalida.' });
    return null;
  }

  if (user.active === false) {
    res.status(403).json({ erro: 'Esta conta foi desativada. Fale com o administrador.' });
    return null;
  }

  const papeisPermitidos = roles || (adminOnly ? ['admin', 'owner'] : null);
  if (papeisPermitidos && !papeisPermitidos.includes(user.role)) {
    res.status(403).json({ erro: 'Acesso restrito.' });
    return null;
  }

  return user;
}

module.exports = {
  createSessionCookie,
  clearSessionCookie,
  getSessionUserId,
  requireUser,
};
