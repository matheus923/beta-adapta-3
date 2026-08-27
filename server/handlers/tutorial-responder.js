// POST /api/tutorial/responder - o analista logado envia as respostas da etapa atual
// do tutorial e avanca para a proxima. So o proprio analista pode responder pelo seu
// tutorial (nao existe "responder por outro").
const { requireUser } = require('../../lib/session');
const { responderEtapaAtual } = require('../../lib/tutorial');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ erro: 'Metodo nao permitido.' });
    return;
  }
  const user = await requireUser(req, res, { roles: ['analyst'] });
  if (!user) return;

  const { respostas } = req.body || {};

  try {
    const progresso = await responderEtapaAtual(user.id, Array.isArray(respostas) ? respostas : []);
    res.status(200).json({
      ok: true,
      concluido: progresso.concluido,
      etapa_atual_indice: progresso.etapa_atual_indice,
      ferramentas_liberadas: progresso.ferramentas_liberadas,
    });
  } catch (err) {
    if (err.code === 'RESPOSTA_FALTANDO') {
      res.status(400).json({ erro: err.message });
      return;
    }
    if (err.code === 'TUTORIAL_CONCLUIDO' || err.code === 'SEM_ETAPA') {
      res.status(409).json({ erro: err.message });
      return;
    }
    res.status(500).json({ erro: 'Erro ao registrar resposta.' });
  }
};
