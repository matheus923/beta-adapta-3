// GET /api/callback?code=...&shop_id=...&state=...
// A Shopee redireciona o CLIENTE (nao o admin) para ca depois que ele autoriza a loja.
// Por isso esta rota nao exige login - mas exige um "state" valido, gerado minutos antes
// em /api/authorize, para garantir que essa autorizacao veio de um link que a Adaptaecom
// gerou de verdade (protecao contra CSRF / links forjados).
const { exchangeCodeForToken } = require('../../lib/shopeeSign');
const { saveShopTokens } = require('../../lib/tokenStore');
const { consumeState } = require('../../lib/oauthState');

module.exports = async (req, res) => {
  const { code, shop_id, state } = req.query;

  if (!code || !shop_id) {
    res.status(400).send('Faltou "code" ou "shop_id" no retorno da Shopee.');
    return;
  }

  const stateValido = await consumeState(state);
  if (!stateValido) {
    res.status(400).send('Link de autorizacao invalido ou expirado. Gere um novo em /api/authorize.');
    return;
  }

  try {
    const result = await exchangeCodeForToken(code, shop_id);

    if (result.error) {
      res.status(400).json({ erro: result.error, detalhe: result.message });
      return;
    }

    await saveShopTokens(shop_id, result);

    res.status(200).send(
      `Loja ${shop_id} autorizada e conectada com sucesso! Voce ja pode fechar esta pagina.`
    );
  } catch (err) {
    res.status(500).json({ erro: 'Falha ao trocar code por token', detalhe: String(err) });
  }
};
