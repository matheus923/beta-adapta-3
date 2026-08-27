// GET /api/admin/tutorial/respostas?analyst_id=... - respostas do tutorial de UM
// analista especifico, para o gestor dele (admin da equipe) ou o owner acompanharem -
// de forma silenciosa: o analista nunca ve nem e avisado que isso e consultado.
// Admin so pode ver analistas da propria equipe; owner ve qualquer um.
const { requireUser } = require('../../lib/session');
const { getUserById } = require('../../lib/userStore');
const { gestorPertenceAEquipeDoAdmin } = require('../../lib/teamAccess');
const { respostasDoAnalista, getProgresso } = require('../../lib/tutorial');
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

  const [respostas, progresso] = await Promise.all([
    respostasDoAnalista(analystId),
    getProgresso(analystId),
  ]);

  // Consulta e silenciosa PARA O ANALISTA (ele nunca fica sabendo) - mas fica
  // registrada no log de auditoria, para saber quem consultou os dados de quem.
  await logAction({
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'consultou_respostas_tutorial_analista',
    target: analystId,
    metadata: { analista_email: analista.email },
  }).catch(() => {});

  res.status(200).json({
    analista: { id: analista.id, nome: analista.name, email: analista.email },
    concluido: progresso.concluido,
    ferramentas_liberadas: progresso.ferramentas_liberadas,
    respostas,
  });
};
