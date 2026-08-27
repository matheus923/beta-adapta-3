// GET /api/admin/tasks-overview - lista as tarefas dos clientes, com o nome do cliente e
// do gestor responsavel, para fiscalizacao do que foi resolvido e do que ficou pendente.
// Tarefas pendentes ha mais de 7 dias vem marcadas como "atrasada".
//   - owner: ve as tarefas de TODOS os clientes, de qualquer equipe.
//   - admin: ve so as tarefas de clientes cujo gestor responsavel faz parte da PROPRIA
//     equipe (inclusive tarefas sem gestor atribuido ficam de fora, so o owner ve essas).
const { requireUser } = require('../../lib/session');
const { listAllTasks } = require('../../lib/tasks');
const { getAllAssignments } = require('../../lib/assignments');
const { getShopNames } = require('../../lib/tokenStore');
const { getUserById } = require('../../lib/userStore');
const { getTeamByAdmin, getTeamGestorIds } = require('../../lib/teams');

module.exports = async (req, res) => {
  const user = await requireUser(req, res, { roles: ['admin', 'owner'] });
  if (!user) return;

  const tasks = await listAllTasks(); // ja vem com "dias_pendente" calculado
  const assignments = await getAllAssignments();
  const names = await getShopNames();

  let idsDaEquipe = null; // null = sem restricao (owner)
  if (user.role === 'admin') {
    const team = await getTeamByAdmin(user.id);
    idsDaEquipe = new Set(team ? await getTeamGestorIds(team.id) : []);
  }

  const tarefasBrutas = await Promise.all(
    tasks.map(async (t) => {
      const gestorId = assignments[t.shop_id];

      if (idsDaEquipe && (!gestorId || !idsDaEquipe.has(gestorId))) {
        return null; // fora da equipe do admin - nao mostra
      }

      const gestor = gestorId ? await getUserById(gestorId) : null;
      return {
        id: t.id,
        shop_id: t.shop_id,
        cliente: names[t.shop_id] || t.shop_id,
        gestor: gestor ? (gestor.name || gestor.email) : '— sem gestor —',
        description: t.description,
        status: t.status,
        dias_pendente: t.dias_pendente,
        atrasada: t.status === 'pending' && t.dias_pendente > 7,
        created_at: t.created_at,
        completed_at: t.completed_at,
        completed_by: t.completed_by,
      };
    })
  );

  res.status(200).json({ tarefas: tarefasBrutas.filter(Boolean) });
};
