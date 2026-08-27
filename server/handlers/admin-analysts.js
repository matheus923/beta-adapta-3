// GET /api/admin/analysts - lista os gestores para o admin montar o dropdown de "quem
// cuida desse cliente" (atribuicao de loja).
//   - owner: ve todos os gestores ativos da agencia.
//   - admin: ve so os gestores ativos da PROPRIA equipe (nao pode atribuir clientes a
//     gestores de outra equipe).
const { requireUser } = require('../../lib/session');
const { listUsers } = require('../../lib/userStore');
const { getTeamByAdmin, getTeamGestorIds } = require('../../lib/teams');

module.exports = async (req, res) => {
  const user = await requireUser(req, res, { adminOnly: true });
  if (!user) return;

  const all = await listUsers();
  const gestoresAtivos = all.filter((u) => u.role === 'analyst' && u.active !== false);

  if (user.role === 'owner') {
    res.status(200).json({ analysts: gestoresAtivos.map((u) => ({ id: u.id, email: u.email, name: u.name })) });
    return;
  }

  const team = await getTeamByAdmin(user.id);
  if (!team) {
    res.status(200).json({ analysts: [] });
    return;
  }

  const idsDaEquipe = new Set(await getTeamGestorIds(team.id));
  const daEquipe = gestoresAtivos.filter((u) => idsDaEquipe.has(u.id));
  res.status(200).json({ analysts: daEquipe.map((u) => ({ id: u.id, email: u.email, name: u.name })) });
};
