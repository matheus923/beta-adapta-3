// GET /api/admin/users - lista contas para a tela de gerenciamento.
//   - owner: ve TODAS as contas (admins e gestores, de qualquer equipe).
//   - admin: ve so as contas de gestor (analyst) que fazem parte da PROPRIA equipe -
//     nao enxerga gestores de outra equipe, nem outros admins, nem o owner por aqui.
const { requireUser } = require('../../lib/session');
const { listUsers } = require('../../lib/userStore');
const { getTeamByAdmin, getTeamGestorIds } = require('../../lib/teams');

module.exports = async (req, res) => {
  const actor = await requireUser(req, res, { adminOnly: true });
  if (!actor) return;

  const all = await listUsers();

  let visiveis;
  if (actor.role === 'owner') {
    visiveis = all;
  } else {
    const team = await getTeamByAdmin(actor.id);
    const idsDaEquipe = team ? new Set(await getTeamGestorIds(team.id)) : new Set();
    visiveis = all.filter((u) => u.role === 'analyst' && idsDaEquipe.has(u.id));
  }

  const users = visiveis.map((u) => ({
    id: u.id, email: u.email, name: u.name, role: u.role, active: u.active !== false,
  }));
  res.status(200).json({ users });
};
