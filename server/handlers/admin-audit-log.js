// GET /api/admin/audit-log - log de auditoria das acoes dos gestores (role 'analyst').
//   - owner (acessando por aqui): ve as acoes de TODOS os gestores (o log 100% completo,
//     incluindo acoes de admins, fica em /api/owner/audit-log).
//   - admin: ve so as acoes dos gestores que fazem parte da PROPRIA equipe - nao ve
//     acoes de gestores de outra equipe, nem de outros admins ou do owner.
const { requireUser } = require('../../lib/session');
const { listActionsByRole } = require('../../lib/auditLog');
const { getTeamByAdmin, getTeamGestorIds } = require('../../lib/teams');

module.exports = async (req, res) => {
  const user = await requireUser(req, res, { roles: ['admin', 'owner'] });
  if (!user) return;

  const acoesDeGestores = await listActionsByRole('analyst', 5000);

  if (user.role === 'owner') {
    res.status(200).json({ acoes: acoesDeGestores.slice(0, 300) });
    return;
  }

  const team = await getTeamByAdmin(user.id);
  if (!team) {
    res.status(200).json({ acoes: [] });
    return;
  }

  const gestorIds = new Set(await getTeamGestorIds(team.id));
  const acoesDaEquipe = acoesDeGestores.filter((a) => gestorIds.has(a.actorId)).slice(0, 300);
  res.status(200).json({ acoes: acoesDaEquipe });
};
