// GET /api/owner/audit-log - log de auditoria COMPLETO (admins e gestores). So o owner
// (voce) tem acesso a esta rota.
const { requireUser } = require('../../lib/session');
const { listAllActions } = require('../../lib/auditLog');

module.exports = async (req, res) => {
  const user = await requireUser(req, res, { roles: ['owner'] });
  if (!user) return;

  const acoes = await listAllActions(300);
  res.status(200).json({ acoes });
};
