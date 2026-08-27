// GET /api/admin/candidatos/por-analista?analyst_id=... - mostra o teste de aptidao que
// um analista da equipe respondeu quando ainda era candidato (antes de virar analista).
// Admin so consulta analistas da PROPRIA equipe; owner consulta qualquer um.
const { requireUser } = require('../../lib/session');
const { getUserById } = require('../../lib/userStore');
const { gestorPertenceAEquipeDoAdmin } = require('../../lib/teamAccess');
const { getCandidatoPorUserId } = require('../../lib/candidates');
const { logAction } = require('../../lib/auditLog');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ erro: 'Metodo nao permitido.' });
    return;
  }
  const user = await requireUser(req, res, { roles: ['admin', 'owner'] });
  if (!user) return;

  const analystId = req.query.analyst_id;
  if (!analystId) {
    res.status(400).json({ erro: 'analyst_id e obrigatorio.' });
    return;
  }

  const analista = await getUserById(analystId);
  if (!analista || analista.role !== 'analyst') {
    res.status(404).json({ erro: 'Analista nao encontrado.' });
    return;
  }

  if (user.role === 'admin') {
    const pertence = await gestorPertenceAEquipeDoAdmin(user.id, analystId);
    if (!pertence) {
      res.status(403).json({ erro: 'Esse analista nao pertence a sua equipe.' });
      return;
    }
  }

  const candidato = await getCandidatoPorUserId(analystId);
  if (!candidato) {
    res.status(404).json({ erro: 'Nenhum teste de aptidao encontrado para esse analista (conta pode ter sido criada manualmente).' });
    return;
  }

  await logAction({
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'consultou_teste_aptidao_analista',
    target: analystId,
    metadata: { analista_email: analista.email },
  }).catch(() => {});

  res.status(200).json({
    nome: candidato.nome,
    email: candidato.email,
    respostas: candidato.respostas,
    decidido_em: candidato.decidido_em,
  });
};
