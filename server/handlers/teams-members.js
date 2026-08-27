// POST /api/teams/members { gestor_id, action: 'add' | 'remove', team_id? }
// Adiciona ou remove um gestor de uma equipe.
//   - admin: so mexe na PROPRIA equipe (team_id e ignorado/forcado para a equipe dele -
//     se informar outro team_id, e barrado).
//   - owner: pode informar qualquer team_id (inclusive para mover um gestor que ja esta
//     em outra equipe).
const { requireUser } = require('../../lib/session');
const { getTeamByAdmin, getTeam, addGestorToTeam, removeGestorFromTeam } = require('../../lib/teams');
const { getUserById } = require('../../lib/userStore');
const { logAction } = require('../../lib/auditLog');

module.exports = async (req, res) => {
  const user = await requireUser(req, res, { adminOnly: true });
  if (!user) return;

  if (req.method !== 'POST') {
    res.status(405).json({ erro: 'Metodo nao permitido' });
    return;
  }

  const { gestor_id, action } = req.body || {};
  let { team_id } = req.body || {};

  if (!gestor_id || !['add', 'remove'].includes(action)) {
    res.status(400).json({ erro: 'Informe gestor_id e action ("add" ou "remove").' });
    return;
  }

  let actorTeamId = null;
  if (user.role === 'admin') {
    const propriaEquipe = await getTeamByAdmin(user.id);
    if (!propriaEquipe) {
      res.status(403).json({ erro: 'Voce ainda nao coordena nenhuma equipe. Peca ao owner para criar uma.' });
      return;
    }
    actorTeamId = propriaEquipe.id;
    team_id = propriaEquipe.id; // admin so mexe na propria, ignora qualquer team_id enviado
  } else if (!team_id) {
    res.status(400).json({ erro: 'Informe team_id (owner precisa dizer qual equipe).' });
    return;
  }

  const team = await getTeam(team_id);
  if (!team) {
    res.status(404).json({ erro: 'Equipe nao encontrada.' });
    return;
  }

  const gestor = await getUserById(gestor_id);
  if (!gestor || gestor.role !== 'analyst') {
    res.status(400).json({ erro: 'gestor_id precisa ser de uma conta com papel gestor.' });
    return;
  }

  try {
    if (action === 'add') {
      await addGestorToTeam({ teamId: team_id, gestorId: gestor_id, actorRole: user.role, actorTeamId });
    } else {
      await removeGestorFromTeam({ teamId: team_id, gestorId: gestor_id, actorRole: user.role, actorTeamId });
    }

    await logAction({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: action === 'add' ? 'team_member_added' : 'team_member_removed',
      target: team.name,
      metadata: { gestor_email: gestor.email },
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    if (err.code === 'FORA_DA_EQUIPE' || err.code === 'GESTOR_EM_OUTRA_EQUIPE') {
      res.status(403).json({ erro: err.message });
      return;
    }
    res.status(500).json({ erro: 'Falha ao atualizar equipe', detalhe: String(err.message || err) });
  }
};
