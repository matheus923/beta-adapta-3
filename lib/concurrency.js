// Processa uma lista de itens em paralelo, mas com um limite de "quantos ao mesmo tempo"
// (para nao estourar o tempo maximo de execucao da funcao quando a carteira de clientes
// crescer, e para nao martelar a API da Shopee com centenas de chamadas simultaneas).
// Ex: 50 lojas com limite 8 -> ~7 rodadas de 8 em paralelo, em vez de 50 uma atras da outra.
async function processInBatches(items, limit, handler) {
  const resultados = [];
  for (let i = 0; i < items.length; i += limit) {
    const lote = items.slice(i, i + limit);
    const lotesResultados = await Promise.all(lote.map((item) => handler(item)));
    resultados.push(...lotesResultados);
  }
  return resultados;
}

module.exports = { processInBatches };
