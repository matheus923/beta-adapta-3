// GET /api/reports/lider - relatorio mensal de auditoria (so o lider/owner ve).
const { requireUser } = require('../../lib/session');
const { buildLiderMensal } = require('../../lib/reportEngine');

module.exports = async (req, res) => {
  const user = await requireUser(req, res, { roles: ['owner'] });
  if (!user) return;

  const relatorio = await buildLiderMensal();
  res.status(200).json(relatorio);
};
