// ATENCAO - LEIA ANTES DE USAR EM PRODUCAO:
// Este adaptador foi escrito com base no conhecimento geral sobre o padrao da Shopee Open
// Platform v2 (mesmo esquema de assinatura e resposta das outras APIs de loja), MAS os
// nomes exatos dos endpoints de "Oferta Relampago" (Shop Flash Sale) e da estrutura dos
// campos de resposta NAO puderam ser confirmados na documentacao oficial ao vivo - o acesso
// a open.shopee.com foi bloqueado durante o desenvolvimento deste projeto. Antes de usar
// com uma loja real, confirme com a documentacao oficial (assim que o acesso de parceiro
// for liberado) os pontos marcados "CONFIRMAR" abaixo e ajuste se necessario.
//
// Endpoints esperados (nomenclatura tipica da familia "shop_flash_sale" da API v2):
//   GET /api/v2/shop_flash_sale/get_shop_flash_sale_list       -> lista ofertas relampago da loja num periodo
//   GET /api/v2/shop_flash_sale/get_shop_flash_sale_item_list  -> itens/variacoes de uma oferta (preco, estoque)
const { callShopApi } = require('./shopeeSign');

// CONFIRMAR: nome do endpoint e dos parametros de tempo/paginacao.
async function listShopFlashSales(shopId, accessToken, startTime, endTime) {
  const data = await callShopApi('/api/v2/shop_flash_sale/get_shop_flash_sale_list', shopId, accessToken, {
    start_time: startTime,
    end_time: endTime,
  });
  return (data && data.response && data.response.flash_sale_list) || [];
}

// CONFIRMAR: nome do endpoint e a estrutura exata de "item_info" / "models" na resposta.
async function getShopFlashSaleItems(shopId, accessToken, flashSaleId) {
  const data = await callShopApi('/api/v2/shop_flash_sale/get_shop_flash_sale_item_list', shopId, accessToken, {
    flash_sale_id: flashSaleId,
  });
  const itemList = (data && data.response && data.response.item_info) || [];

  // Normaliza para uma linha por variacao (model), com preco e estoque, para facilitar a comparacao.
  const linhas = [];
  itemList.forEach((item) => {
    (item.models || []).forEach((model) => {
      linhas.push({
        item_id: item.item_id,
        item_name: item.item_name || '',
        model_id: model.model_id,
        model_name: model.model_name || '',
        // CONFIRMAR: nome exato do campo de preco promocional e de estoque da campanha.
        promotion_price: model.promotion_price ?? model.input_promo_price ?? null,
        stock: model.stock ?? model.campaign_stock ?? null,
      });
    });
  });
  return linhas;
}

// Retorna os itens de todas as ofertas relampago da loja que COMECAM dentro da janela
// [startTime, endTime). Usado para achar "a oferta relampago de amanha" a partir de hoje.
async function getFlashSaleItemsInWindow(shopId, accessToken, startTime, endTime) {
  const flashSales = await listShopFlashSales(shopId, accessToken, startTime, endTime);
  const doPeriodo = flashSales.filter((fs) => fs.start_time >= startTime && fs.start_time < endTime);
  if (doPeriodo.length === 0) return { flashSale: null, items: [] };

  const todosItens = [];
  for (const fs of doPeriodo) {
    const itens = await getShopFlashSaleItems(shopId, accessToken, fs.flash_sale_id);
    todosItens.push(...itens);
  }
  return { flashSale: doPeriodo[0], items: todosItens };
}

module.exports = { listShopFlashSales, getShopFlashSaleItems, getFlashSaleItemsInWindow };
