// GET /api/admin/mudancas-metricas - lista as mudancas de preco de anuncio / meta de
// ROAS detectadas pela checagem automatica diaria, com o analista responsavel e a data
// em que cada uma foi detectada (mesmos dados que alimentam o e-mail semanal, mas
// disponivel na tela a qualquer momento, sem esperar a segunda-feira).
//   - owner: ve as mudancas de qualquer equipe.
//   - admin: ve so as mudancas de analistas da PROPRIA equipe.
const { requireUser } = require('../../lib/session');
const { getTeamByAdmin, getTeamGestorIds } = require('../../lib/teams');
const { listChangesSince, listAllChanges } = require('../../lib/marketplaceChanges');

const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

module.exports = async (req, res) => {
  const user = await requireUser(req, res, { roles: ['admin', 'owner'] });
  if (!user) return;

  const sinceTs = Date.now() - TRINTA_DIAS_MS;

  let mudancas;
  if (user.role === 'owner') {
    mudancas = (await listAllChanges(1000)).filter((m) => m.detectadoEm >= sinceTs);
  } else {
    const team = await getTeamByAdmin(user.id);
    const analystIds = team ? await getTeamGestorIds(team.id) : [];
    mudancas = await listChangesSince({ sinceTs, analystIds });
  }

  mudancas.sort((a, b) => b.detectadoEm - a.detectadoEm);
  res.status(200).json({ mudancas });
};
