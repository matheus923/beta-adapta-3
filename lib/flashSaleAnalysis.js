// Compara os itens da oferta relampago de "amanha" com os da oferta de "hoje" (o dia
// anterior), procurando os 3 tipos de erro que um gestor pode cometer ao montar a oferta:
//  1) anuncio_faltando   - anuncio/variacao que estava na oferta de hoje e sumiu na de amanha
//  2) estoque_baixo      - estoque adicionado por variacao abaixo do minimo (padrao 30 un.)
//  3) preco_descrepante  - preco muito diferente (acima ou abaixo) do praticado no dia anterior
const MIN_STOCK_PADRAO = Number(process.env.FLASH_SALE_MIN_STOCK || 30);
const DESVIO_PRECO_PADRAO_PCT = Number(process.env.FLASH_SALE_PRICE_DEVIATION_PERCENT || 20);

function chaveVariacao(linha) {
  return `${linha.item_id}:${linha.model_id}`;
}

function analyze({
  baselineItems = [],
  nextItems = [],
  minStock = MIN_STOCK_PADRAO,
  priceDeviationPercent = DESVIO_PRECO_PADRAO_PCT,
} = {}) {
  const problemas = [];

  const baselinePorChave = new Map(baselineItems.map((i) => [chaveVariacao(i), i]));
  const nextPorChave = new Map(nextItems.map((i) => [chaveVariacao(i), i]));

  // 1) Anuncios que estavam na oferta de hoje e sumiram na de amanha
  for (const [chave, itemHoje] of baselinePorChave) {
    if (!nextPorChave.has(chave)) {
      problemas.push({
        tipo: 'anuncio_faltando',
        item_id: itemHoje.item_id,
        item_name: itemHoje.item_name,
        model_id: itemHoje.model_id,
        model_name: itemHoje.model_name,
        detalhe: `O anuncio "${itemHoje.item_name}"${itemHoje.model_name ? ` (${itemHoje.model_name})` : ''} estava na oferta relampago de hoje e nao foi encontrado na oferta de amanha.`,
      });
    }
  }

  // 2) Estoque abaixo do minimo e 3) preco descrepante, para cada item da oferta de amanha
  for (const [chave, itemAmanha] of nextPorChave) {
    if (typeof itemAmanha.stock === 'number' && itemAmanha.stock < minStock) {
      problemas.push({
        tipo: 'estoque_baixo',
        item_id: itemAmanha.item_id,
        item_name: itemAmanha.item_name,
        model_id: itemAmanha.model_id,
        model_name: itemAmanha.model_name,
        detalhe: `Estoque adicionado (${itemAmanha.stock} unidades) esta abaixo do minimo de ${minStock} para "${itemAmanha.item_name}"${itemAmanha.model_name ? ` (${itemAmanha.model_name})` : ''}.`,
      });
    }

    const itemHoje = baselinePorChave.get(chave);
    if (
      itemHoje &&
      typeof itemHoje.promotion_price === 'number' &&
      typeof itemAmanha.promotion_price === 'number' &&
      itemHoje.promotion_price > 0
    ) {
      const variacaoPct = ((itemAmanha.promotion_price - itemHoje.promotion_price) / itemHoje.promotion_price) * 100;
      if (Math.abs(variacaoPct) >= priceDeviationPercent) {
        problemas.push({
          tipo: 'preco_descrepante',
          item_id: itemAmanha.item_id,
          item_name: itemAmanha.item_name,
          model_id: itemAmanha.model_id,
          model_name: itemAmanha.model_name,
          detalhe: `Preco de amanha (${itemAmanha.promotion_price}) esta ${variacaoPct > 0 ? 'acima' : 'abaixo'} do preco de hoje (${itemHoje.promotion_price}) em ${Math.abs(variacaoPct).toFixed(1)}% (limite configurado: ${priceDeviationPercent}%) para "${itemAmanha.item_name}"${itemAmanha.model_name ? ` (${itemAmanha.model_name})` : ''}.`,
        });
      }
    }
  }

  return problemas;
}

module.exports = { analyze };
