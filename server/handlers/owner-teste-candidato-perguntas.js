// GET/POST /api/owner/teste-candidato/perguntas - configura as perguntas do teste de
// aptidao mostrado na tela de inscricao (aberta no tablet, presencial). SO O OWNER pode
// mudar as perguntas - nao e uma decisao de admin de equipe.
const { requireUser } = require('../../lib/session');
const { listarPerguntasTeste, salvarPerguntasTeste } = require('../../lib/candidates');
const { logAction } = require('../../lib/auditLog');
const crypto = require('crypto');

module.exports = async (req, res) => {
  const user = await requireUser(req, res, { roles: ['owner'] });
  if (!user) return;

  if (req.method === 'GET') {
    const perguntas = await listarPerguntasTeste();
    res.status(200).json({ perguntas });
    return;
  }

  if (req.method === 'POST') {
    const { perguntas } = req.body || {};
    if (!Array.isArray(perguntas)) {
      res.status(400).json({ erro: 'perguntas deve ser uma lista.' });
      return;
    }
    for (const p of perguntas) {
      if (!p.texto || String(p.texto).trim().length === 0) {
        res.status(400).json({ erro: 'Toda pergunta precisa ter um texto.' });
        return;
      }
    }
    const normalizadas = perguntas.map((p) => ({
      id: p.id || crypto.randomBytes(6).toString('hex'),
      texto: String(p.texto).trim(),
    }));
    await salvarPerguntasTeste(normalizadas);
    await logAction({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'atualizou_perguntas_teste_candidato',
    });
    res.status(200).json({ ok: true, perguntas: normalizadas });
    return;
  }

  res.status(405).json({ erro: 'Metodo nao permitido.' });
};
