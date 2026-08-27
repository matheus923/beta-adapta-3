// POST /api/admin/assign { shop_id, analyst_id } - define qual gestor cuida de qual
// cliente. Passe analyst_id vazio/"" para remover a atribuicao.
//   - owner: pode atribuir qualquer gestor a qualquer cliente.
//   - admin: so pode mexer em clientes que ainda nao tem gestor OU que ja pertencem a
//     PROPRIA equipe dele, e so pode atribuir gestores que fazem parte da propria
//     equipe - nunca "rouba" um cliente ou um gestor de outra equipe.
const { requireUser } = require('../../lib/session');
const { assignAnalyst, unassignAnalyst } = require('../../lib/assignments');
const { getUserById } = require('../../lib/userStore');
const { logAction } = require('../../lib/auditLog');
const { adminPodeAcessarLoja, gestorPertenceAEquipeDoAdmin } = require('../../lib/teamAccess');

module.exports = async (req, res) => {
  const user = await requireUser(req, res, { adminOnly: true });
  if (!user) return;

  if (req.method !== 'POST') {
    res.status(405).json({ erro: 'Metodo nao permitido' });
    return;
  }

  const { shop_id, analyst_id } = req.body || {};
  if (!shop_id) {
    res.status(400).json({ erro: 'Informe shop_id.' });
    return;
  }

  // Bloqueia mexer num cliente cujo gestor atual e de outra equipe (admin comum).
  const podeMexerNesseCliente = await adminPodeAcessarLoja(user, shop_id);
  if (!podeMexerNesseCliente) {
    res.status(403).json({ erro: 'Esse cliente ja e cuidado por um gestor de outra equipe.' });
    return;
  }

  if (!analyst_id) {
    await unassignAnalyst(shop_id);
  } else {
    const gestor = await getUserById(analyst_id);
    if (!gestor || gestor.role !== 'analyst') {
      res.status(400).json({ erro: 'analyst_id precisa ser de uma conta com papel gestor.' });
      return;
    }
    if (gestor.active === false) {
      res.status(400).json({ erro: 'Esse gestor esta desativado.' });
      return;
    }

    // Admin comum so pode atribuir gestor da PROPRIA equipe - nunca de outra.
    if (user.role === 'admin') {
      const pertenceAEquipe = await gestorPertenceAEquipeDoAdmin(user.id, analyst_id);
      if (!pertenceAEquipe) {
        res.status(403).json({ erro: 'Voce so pode atribuir gestores da sua propria equipe.' });
        return;
      }
    }

    await assignAnalyst(shop_id, analyst_id);
  }

  await logAction({
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: analyst_id ? 'shop_assigned' : 'shop_unassigned',
    target: shop_id,
    metadata: { analyst_id: analyst_id || null },
  });

  res.status(200).json({ ok: true });
};
