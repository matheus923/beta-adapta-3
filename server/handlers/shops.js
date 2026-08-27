// GET /api/shops -> lista as lojas: admin ve todas (com o analista responsavel de cada
// uma); analista ve so as lojas atribuidas a ele.
// POST /api/shops { shop_id, name } -> salva um apelido para a loja. Somente admin.
const { listAuthorizedShops, getShopTokens, getShopNames, saveShopName } = require('../../lib/tokenStore');
const { requireUser } = require('../../lib/session');
const { getAllAssignments } = require('../../lib/assignments');
const { getUserById } = require('../../lib/userStore');
const { logAction } = require('../../lib/auditLog');

module.exports = async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const isAdmin = user.role === 'admin' || user.role === 'owner';

  if (req.method === 'POST') {
    if (!isAdmin) {
      res.status(403).json({ erro: 'Acesso restrito ao administrador.' });
      return;
    }
    const { shop_id, name } = req.body || {};
    if (!shop_id || !name) {
      res.status(400).json({ erro: 'Envie shop_id e name.' });
      return;
    }
    await saveShopName(shop_id, name);

    await logAction({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'shop_renamed',
      target: shop_id,
      metadata: { name },
    });

    res.status(200).json({ ok: true });
    return;
  }

  const allShopIds = await listAuthorizedShops();
  const names = await getShopNames();
  const assignments = await getAllAssignments(); // { shopId: analystUserId }

  // analista so enxerga os clientes atribuidos a ele; admin/owner enxergam tudo
  const visibleIds = isAdmin
    ? allShopIds
    : allShopIds.filter((id) => assignments[id] === user.id);

  const shops = await Promise.all(
    visibleIds.map(async (shopId) => {
      const tokens = await getShopTokens(shopId);
      const expiraEm = tokens ? tokens.expires_at - Date.now() : null;

      let analistaResponsavel = null;
      if (isAdmin && assignments[shopId]) {
        const analista = await getUserById(assignments[shopId]);
        analistaResponsavel = analista ? { id: analista.id, email: analista.email, name: analista.name } : null;
      }

      return {
        shop_id: shopId,
        nome: names[shopId] || null,
        status: expiraEm && expiraEm > 0 ? 'conectada' : 'token vencido (aguardando renovacao)',
        atualizado_em: tokens ? new Date(tokens.updated_at).toISOString() : null,
        analista: analistaResponsavel,
      };
    })
  );

  res.status(200).json({ shops });
};
