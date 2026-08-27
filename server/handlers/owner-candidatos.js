// GET /api/owner/candidatos - lista todas as inscricoes do processo seletivo (com as
// respostas do teste). SO O OWNER tem acesso a essa tela - a avaliacao de candidatos
// nao e uma decisao de admin de equipe.
const { requireUser } = require('../../lib/session');
const { listarCandidatos } = require('../../lib/candidates');
const { listTeams } = require('../../lib/teams');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ erro: 'Metodo nao permitido.' });
    return;
  }
  const user = await requireUser(req, res, { roles: ['owner'] });
  if (!user) return;

  const [candidatos, teams] = await Promise.all([listarCandidatos(), listTeams()]);
  res.status(200).json({ candidatos, teams: teams.map((t) => ({ id: t.id, name: t.name })) });
};
