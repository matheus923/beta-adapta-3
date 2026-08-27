// GET /api/reports/analista?period=diario|semanal (padrao: diario)
// So o proprio analista ve o proprio relatorio.
const { requireUser } = require('../../lib/session');
const { buildAnalistaDiario, buildAnalistaSemanal } = require('../../lib/reportEngine');

module.exports = async (req, res) => {
  const user = await requireUser(req, res, { roles: ['analyst'] });
  if (!user) return;

  const period = req.query.period === 'semanal' ? 'semanal' : 'diario';
  const relatorio = period === 'semanal'
    ? await buildAnalistaSemanal(user.id)
    : await buildAnalistaDiario(user.id);

  res.status(200).json(relatorio);
};
