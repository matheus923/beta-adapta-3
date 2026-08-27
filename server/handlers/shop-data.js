// GET /api/shop-data?shop_id=123456
// Endpoint de exemplo: busca informacoes basicas da loja + pedidos recentes.
// E este tipo de rota que a tarefa agendada diaria vai chamar para pegar os numeros
// e depois alimentar a analise do Manual do Gestor.
// Acesso permitido para: (a) a chave de servico da automacao diaria (x-service-key),
// (b) o admin logado, ou (c) o analista logado, mas so para lojas atribuidas a ele.
const { callShopApi } = require('../../lib/shopeeSign');
const { getValidAccessToken } = require('../../lib/shopeeAuth');
const { requireUser } = require('../../lib/session');
const { getAssignedAnalyst } = require('../../lib/assignments');
const { safeCompare } = require('../../lib/safeCompare');
const { adminPodeAcessarLoja } = require('../../lib/teamAccess');

module.exports = async (req, res) => {
  const { shop_id } = req.query;
  if (!shop_id) {
    res.status(400).json({ erro: 'Informe ?shop_id=' });
    return;
  }

  const chaveServico = req.headers['x-service-key'];
  const viaServico = Boolean(chaveServico) && safeCompare(chaveServico, process.env.SERVICE_KEY);

  if (!viaServico) {
    const user = await requireUser(req, res);
    if (!user) return; // requireUser ja respondeu 401

    if (user.role === 'analyst') {
      const responsavel = await getAssignedAnalyst(shop_id);
      if (responsavel !== user.id) {
        res.status(403).json({ erro: 'Voce nao tem acesso a essa loja.' });
        return;
      }
    } else if (user.role === 'admin') {
      const podeAcessar = await adminPodeAcessarLoja(user, shop_id);
      if (!podeAcessar) {
        res.status(403).json({ erro: 'Esse cliente e cuidado por um gestor de outra equipe.' });
        return;
      }
    }
  }

  const accessToken = await getValidAccessToken(shop_id);
  if (!accessToken) {
    res.status(404).json({ erro: 'Loja nao autorizada ou token invalido. Use /api/authorize primeiro.' });
    return;
  }

  try {
    // Informacoes gerais da loja (nome, status, regiao)
    const shopInfo = await callShopApi('/api/v2/shop/get_shop_info', shop_id, accessToken);

    // Pedidos dos ultimos 7 dias (ajuste time_from/time_to conforme a necessidade)
    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - 7 * 24 * 60 * 60;
    const orderList = await callShopApi('/api/v2/order/get_order_list', shop_id, accessToken, {
      time_range_field: 'create_time',
      time_from: sevenDaysAgo,
      time_to: now,
      page_size: 100,
    });

    res.status(200).json({ shop_id, shopInfo, orderList });
  } catch (err) {
    res.status(500).json({ erro: 'Falha ao consultar a API da Shopee', detalhe: String(err) });
  }
};
