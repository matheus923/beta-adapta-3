// POST /api/owner/candidatos/rejeitar - marca um candidato como rejeitado (nao cria
// nenhuma conta). SO O OWNER.
const { requireUser } = require('../../lib/session');
const { rejeitarCandidato } = require('../../lib/candidates');
const { logAction } = require('../../lib/auditLog');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ erro: 'Metodo nao permitido.' });
    return;
  }
  const user = await requireUser(req, res, { roles: ['owner'] });
  if (!user) return;

  const { candidato_id, motivo } = req.body || {};
  if (!candidato_id) {
    res.status(400).json({ erro: 'candidato_id e obrigatorio.' });
    return;
  }

  try {
    const candidato = await rejeitarCandidato(candidato_id, { decididoPor: user.email, motivo });
    await logAction({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'rejeitou_candidato',
      target: candidato.email,
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err.code === 'NAO_ENCONTRADO') {
      res.status(404).json({ erro: err.message });
      return;
    }
    if (err.code === 'JA_AVALIADO') {
      res.status(409).json({ erro: err.message });
      return;
    }
    res.status(500).json({ erro: 'Erro ao rejeitar candidato.' });
  }
};
