// ATENCAO - LEIA ANTES DE USAR EM PRODUCAO (mesmo aviso do lib/shopeeFlashSale.js):
// Os nomes exatos dos endpoints abaixo NAO puderam ser confirmados ao vivo na
// documentacao oficial (acesso a open.shopee.com ficou bloqueado durante o
// desenvolvimento). Foram escritos com base no padrao geral da Shopee Open Platform v2.
// Antes de usar com uma loja real, confirme os pontos marcados "CONFIRMAR" - em
// especial, a API de Ads (Shopee Ads / Product Ads) costuma exigir uma aprovacao de
// escopo separada da API basica de produtos/pedidos, entao pode ser que a Adaptaecom
// precise pedir esse escopo adicional a parte no cadastro de parceiro.
//
// Duas metricas sao lidas aqui, uma vez por dia (ver server/handlers/cron-metrics-daily-check.js):
//   - preco atual de cada anuncio/variacao (Product API)
//   - meta de ROAS (roas_target) de cada campanha de anuncio ativa (Shopee Ads API)
// So o VALOR ATUAL e exposto pela Shopee - nao existe um "historico de quem mudou e
// quando" (ver README, secao "Mudancas de metricas detectadas automaticamente").
const { callShopApi } = require('./shopeeSign');

// CONFIRMAR: nome do endpoint de listagem de itens e paginacao (offset/page_size/cursor).
async function listShopItemIds(shopId, accessToken) {
  const ids = [];
  let offset = 0;
  const pageSize = 100;
  for (;;) {
    const data = await callShopApi('/api/v2/product/get_item_list', shopId, accessToken, {
      offset,
      page_size: pageSize,
      item_status: 'NORMAL',
    });
    const items = (data && data.response && data.response.item) || [];
    ids.push(...items.map((i) => i.item_id));
    if (!data?.response?.has_next_page || items.length === 0) break;
    offset += pageSize;
  }
  return ids;
}

// CONFIRMAR: nome do endpoint e estrutura de "price_info" por modelo/variacao.
// Retorna uma linha por variacao (model), com o preco atual - mesmo formato usado em
// lib/shopeeFlashSale.js, para os dois conjuntos serem comparaveis pelo mesmo motor de diff.
async function listShopItemPrices(shopId, accessToken) {
  const itemIds = await listShopItemIds(shopId, accessToken);
  if (itemIds.length === 0) return [];

  const linhas = [];
  // Busca em lotes de 50 (limite tipico de item_id_list por chamada nesta familia de API).
  for (let i = 0; i < itemIds.length; i += 50) {
    const lote = itemIds.slice(i, i + 50);
    const data = await callShopApi('/api/v2/product/get_item_base_info', shopId, accessToken, {
      item_id_list: lote.join(','),
    });
    const itemList = (data && data.response && data.response.item_list) || [];
    itemList.forEach((item) => {
      const modelos = item.model || [{ model_id: 0, model_name: null, price_info: item.price_info }];
      modelos.forEach((model) => {
        const precoAtual = model.price_info?.[0]?.current_price ?? null;
        linhas.push({
          item_id: item.item_id,
          item_name: item.item_name || '',
          model_id: model.model_id || 0,
          model_name: model.model_name || '',
          preco_atual: precoAtual,
        });
      });
    });
  }
  return linhas;
}

// CONFIRMAR: familia de endpoints da Shopee Ads (nomes variam bastante entre versoes da
// documentacao) - o esperado e algo como "get_all_cids" (lista campanhas) seguido de
// "get_campaign_setting_info" (detalhe, incluindo roas_target) por campanha.
async function listShopAdCampaignsRoas(shopId, accessToken) {
  const listaData = await callShopApi('/api/v2/ads/get_all_cids', shopId, accessToken, {});
  const campaignIds = (listaData && listaData.response && listaData.response.campaign_id_list) || [];
  if (campaignIds.length === 0) return [];

  const linhas = [];
  for (const campaignId of campaignIds) {
    const detalhe = await callShopApi('/api/v2/ads/get_campaign_setting_info', shopId, accessToken, {
      campaign_id_list: String(campaignId),
    });
    const info = detalhe?.response?.campaign_list?.[0];
    if (!info) continue;
    linhas.push({
      campaign_id: campaignId,
      campaign_name: info.ad_name || info.campaign_name || `Campanha ${campaignId}`,
      meta_roas: info.common_info?.roas_target ?? info.roas_target ?? null,
    });
  }
  return linhas;
}

module.exports = { listShopItemPrices, listShopAdCampaignsRoas };
