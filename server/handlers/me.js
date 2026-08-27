// GET /api/me - retorna quem esta logado (usado pela tela para saber se mostra o painel
// de admin ou so a lista de clientes do analista).
const { requireUser } = require('../../lib/session');

module.exports = async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  res.status(200).json({ id: user.id, email: user.email, name: user.name, role: user.role });
};
