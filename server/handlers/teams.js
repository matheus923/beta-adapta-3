// GET /api/teams - lista as equipes.
//   - owner: ve TODAS as equipes, com o admin coordenador e os gestores de cada uma.
//   - admin: ve so a PROPRIA equipe (a que o owner atribuiu a ele), ou null se ainda nao
//     tem nenhuma.
// POST /api/teams { name, admin_id } - cria uma equipe nova. So o owner.
const { requireUser } = require('../../lib/session');
const {
  createTeam,
  getTeamByAdmin,
  listTeams,
  getTeamGestorIds,
  listGestoresSemEquipe,
  listAdminsSemEquipe,
} = require('../../lib/teams');
const { getUserById } = require('../../lib/userStore');
const { logAction } = require('../../lib/auditLog');

async function montarEquipeDetalhada(team) {
  const admin = await getUserById(team.admin_id);
  const gestorIds = await getTeamGestorIds(team.id);
  const gestores = (await Promise.all(gestorIds.map((id) => getUserById(id))))
    .filter(Boolean)
    .map((g) => ({ id: g.id, email: g.email, name: g.name, active: g.active !== false }));

  return {
    id: team.id,
    name: team.name,
    admin: admin ? { id: admin.id, email: admin.email, name: admin.name } : null,
    gestores,
  };
}

module.exports = async (req, res) => {
  const user = await requireUser(req, res, { adminOnly: true });
  if (!user) return;

  if (req.method === 'GET') {
    if (user.role === 'owner') {
      const teams = await listTeams();
      const detalhadas = await Promise.all(teams.map(montarEquipeDetalhada));
      const [gestoresSemEquipe, adminsSemEquipe] = await Promise.all([
        listGestoresSemEquipe(),
        listAdminsSemEquipe(),
      ]);
      res.status(200).json({ teams: detalhadas, gestoresSemEquipe, adminsSemEquipe });
      return;
    }

    // admin: so a propria equipe
    const team = await getTeamByAdmin(user.id);
    const gestoresSemEquipe = await listGestoresSemEquipe();
    if (!team) {
      res.status(200).json({ team: null, gestoresSemEquipe });
      return;
    }
    const detalhada = await montarEquipeDetalhada(team);
    res.status(200).json({ team: detalhada, gestoresSemEquipe });
    return;
  }

  if (req.method === 'POST') {
    if (user.role !== 'owner') {
      res.status(403).json({ erro: 'So o owner pode criar uma equipe.' });
      return;
    }

    const { name, admin_id } = req.body || {};
    if (!name || !admin_id) {
      res.status(400).json({ erro: 'Informe name e admin_id.' });
      return;
    }

    const admin = await getUserById(admin_id);
    if (!admin || admin.role !== 'admin') {
      res.status(400).json({ erro: 'admin_id precisa ser de uma conta com papel administrador.' });
      return;
    }

    try {
      const team = await createTeam({ name, adminId: admin_id, createdBy: user.email });

      await logAction({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'team_created',
        target: name,
        metadata: { admin_email: admin.email },
      });

      res.status(201).json({ ok: true, team });
    } catch (err) {
      if (err.code === 'ADMIN_JA_TEM_EQUIPE') {
        res.status(409).json({ erro: err.message });
        return;
      }
      res.status(500).json({ erro: 'Falha ao criar equipe', detalhe: String(err.message || err) });
    }
    return;
  }

  res.status(405).json({ erro: 'Metodo nao permitido' });
};
