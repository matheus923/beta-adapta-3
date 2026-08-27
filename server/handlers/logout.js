// POST /api/logout - encerra a sessao do painel administrativo
const { clearSessionCookie } = require('../../lib/session');

module.exports = async (req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.status(200).json({ ok: true });
};
