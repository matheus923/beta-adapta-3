// POST /api/admin/toggle-user { user_id, active }
// Ativa/desativa uma conta (usado quando alguem sai da equipe). Regras:
//   - Ninguem consegue desativar a conta owner por aqui (protegida sempre).
//   - Ninguem consegue desativar a propria conta (evita se trancar pra fora sem querer).
//   - So o owner pode desativar/ativar uma conta admin.
//   - Admin ou owner podem desativar/ativar uma conta analyst (gestor).
const { requireUser } = require('../../lib/session');
const { getUserById, setUserActive } = require('../../lib/userStore');
const { logAction } = require('../../lib/auditLog');
const { getTeamByAdmin, getTeamGestorIds } = require('../../lib/teams');

module.exports = async (req, res) => {
  const actor = await requireUser(req, res, { roles: ['admin', 'owner'] });
  if (!actor) return;

  if (req.method !== 'POST') {
    res.status(405).json({ erro: 'Metodo nao permitido' });
    return;
  }

  const { user_id, active } = req.body || {};
  if (!user_id || typeof active !== 'boolean') {
    res.status(400).json({ erro: 'Informe user_id e active (true/false).' });
    return;
  }

  const alvo = await getUserById(user_id);
  if (!alvo) {
    res.status(404).json({ erro: 'Conta nao encontrada.' });
    return;
  }

  if (alvo.role === 'owner') {
    res.status(403).json({ erro: 'A conta owner nao pode ser desativada.' });
    return;
  }
  if (alvo.id === actor.id) {
    res.status(403).json({ erro: 'Voce nao pode desativar a propria conta.' });
    return;
  }
  if (alvo.role === 'admin' && actor.role !== 'owner') {
    res.status(403).json({ erro: 'So o owner pode desativar uma conta de administrador.' });
    return;
  }

  // Um admin so pode desativar/reativar gestores da PROPRIA equipe - nunca de outra.
  if (alvo.role === 'analyst' && actor.role === 'admin') {
    const team = await getTeamByAdmin(actor.id);
    const idsDaEquipe = new Set(team ? await getTeamGestorIds(team.id) : []);
    if (!idsDaEquipe.has(alvo.id)) {
      res.status(403).json({ erro: 'Voce so pode desativar/reativar gestores da sua propria equipe.' });
      return;
    }
  }

  const atualizado = await setUserActive(user_id, active);

  await logAction({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: active ? 'user_enabled' : 'user_disabled',
    target: alvo.email,
    metadata: { target_role: alvo.role },
  });

  res.status(200).json({ ok: true, user: { id: atualizado.id, email: atualizado.email, active: atualizado.active } });
};
