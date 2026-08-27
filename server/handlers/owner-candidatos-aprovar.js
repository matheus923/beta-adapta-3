// POST /api/owner/candidatos/aprovar - SO O OWNER. Aprova um candidato: cria a conta de
// analista dele (e-mail informado + senha aleatoria, ja travada no tutorial), e no mesmo
// passo ja destina ele a uma equipe (team_id obrigatorio) - avisando por e-mail o admin
// coordenador daquela equipe, com as respostas do teste de aptidao anexadas.
const { requireUser } = require('../../lib/session');
const { aprovarCandidato } = require('../../lib/candidates');
const { getUserById } = require('../../lib/userStore');
const { logAction } = require('../../lib/auditLog');
const { sendCandidatoAprovadoEmail, sendNovoAnalistaParaEquipeEmail } = require('../../lib/mailer');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ erro: 'Metodo nao permitido.' });
    return;
  }
  const user = await requireUser(req, res, { roles: ['owner'] });
  if (!user) return;

  const { candidato_id, team_id } = req.body || {};
  if (!candidato_id || !team_id) {
    res.status(400).json({ erro: 'candidato_id e team_id sao obrigatorios.' });
    return;
  }

  try {
    const { candidato, senhaGerada, team } = await aprovarCandidato(candidato_id, {
      decididoPor: user.email,
      teamId: team_id,
    });

    await logAction({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'aprovou_candidato_criou_analista',
      target: candidato.email,
      metadata: { equipe: team.name },
    });

    let emailCandidatoEnviado = false;
    try {
      await sendCandidatoAprovadoEmail(candidato.email, candidato.nome, senhaGerada);
      emailCandidatoEnviado = true;
    } catch (e) {
      emailCandidatoEnviado = false;
    }

    // Avisa o admin coordenador da equipe, com o teste de aptidao anexado - se a equipe
    // ainda nao tiver um admin coordenador definido, so pula esse aviso (nao trava a
    // aprovacao por causa disso).
    if (team.admin_id) {
      try {
        const adminDaEquipe = await getUserById(team.admin_id);
        if (adminDaEquipe) {
          await sendNovoAnalistaParaEquipeEmail(adminDaEquipe.email, candidato.nome, team.name, candidato.respostas);
        }
      } catch (e) {
        // nao trava a aprovacao se o e-mail de aviso falhar (ex: Resend nao configurado)
      }
    }

    res.status(200).json({
      ok: true,
      email: candidato.email,
      senha_gerada: senhaGerada,
      email_enviado: emailCandidatoEnviado,
      equipe: team.name,
    });
  } catch (err) {
    if (err.code === 'NAO_ENCONTRADO' || err.code === 'EQUIPE_NAO_ENCONTRADA') {
      res.status(404).json({ erro: err.message });
      return;
    }
    if (err.code === 'JA_AVALIADO') {
      res.status(409).json({ erro: err.message });
      return;
    }
    res.status(500).json({ erro: 'Erro ao aprovar candidato.' });
  }
};
