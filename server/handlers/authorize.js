// GET /api/authorize
// Gera o link que o CLIENTE (dono da loja Shopee) precisa abrir e clicar em "Autorizar".
// Envie esse link para o cliente sempre que for conectar uma nova loja.
// Rota protegida: so o admin logado no painel pode gerar links de autorizacao.
const { buildAuthUrl } = require('../../lib/shopeeSign');
const { createState } = require('../../lib/oauthState');
const { requireUser } = require('../../lib/session');
const { logAction } = require('../../lib/auditLog');

module.exports = async (req, res) => {
  const user = await requireUser(req, res, { adminOnly: true });
  if (!user) return;

  const redirectUrl = process.env.SHOPEE_REDIRECT_URL; // ex: https://seu-app.vercel.app/api/callback
  const state = await createState(); // protecao contra CSRF, conferida no /api/callback
  const authUrl = buildAuthUrl(redirectUrl, state);

  await logAction({
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'auth_link_generated',
  });

  res.status(200).json({
    mensagem: 'Envie este link para o cliente abrir e autorizar a loja dele:',
    auth_url: authUrl,
  });
};
