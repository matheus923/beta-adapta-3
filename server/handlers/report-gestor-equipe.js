// GET /api/reports/gestor-equipe - relatorio semanal do gestor sobre a PROPRIA equipe de
// analistas (tarefas, mudancas feitas, aderencia a rotina). Owner pode passar
// ?admin_id=... para inspecionar a equipe de um gestor especifico (auditoria).
const { requireUser } = require('../../lib/session');
const { buildGestorEquipe } = require('../../lib/reportEngine');

module.exports = async (req, res) => {
  const user = await requireUser(req, res, { roles: ['admin', 'owner'] });
  if (!user) return;

  let adminId = user.id;
  if (user.role === 'owner' && req.query.admin_id) {
    adminId = req.query.admin_id;
  }

  const relatorio = await buildGestorEquipe(adminId);
  res.status(200).json(relatorio);
};
