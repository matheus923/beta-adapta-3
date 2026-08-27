// GET /api/reports/gestor-clientes?period=diario|semanal (padrao: diario)
// Gestor ve o relatorio da PROPRIA equipe. Owner tambem pode chamar, informando
// ?admin_id=... para inspecionar a equipe de um gestor especifico (uso de auditoria).
const { requireUser } = require('../../lib/session');
const { buildGestorClientes } = require('../../lib/reportEngine');

module.exports = async (req, res) => {
  const user = await requireUser(req, res, { roles: ['admin', 'owner'] });
  if (!user) return;

  const periodo = req.query.period === 'semanal' ? 'semanal' : 'diario';

  let adminId = user.id;
  if (user.role === 'owner' && req.query.admin_id) {
    adminId = req.query.admin_id;
  }

  const relatorio = await buildGestorClientes(adminId, { periodo });
  res.status(200).json(relatorio);
};
