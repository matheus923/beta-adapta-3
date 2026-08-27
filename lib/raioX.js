// "Raio-X" diario de cada loja: faturamento, ROAS/ACOS, conversao, margem, cobertura de
// estoque e curva ABC de produtos - os numeros que o Manual do Gestor usa para classificar
// uma conta (Escala/Otimizacao/Atencao/Protecao) e virar recomendacao.
//
// IMPORTANTE - o que e real e o que ainda nao e: hoje o app so tem, de fato, integracao
// com a Shopee para autenticacao, preco de anuncio e meta de ROAS (ver lib/shopeeMetrics.js).
// Faturamento consolidado, ACOS real (gasto/faturamento), conversao (visitas -> venda) e
// cobertura de estoque em dias exigiriam integrar mais chamadas da API (pedidos agregados
// por periodo, gasto de ads, saldo de estoque por SKU) que ainda nao foram implementadas -
// isso fica para uma proxima fase.
//
// Para o beta poder ser testado de ponta a ponta HOJE (login -> relatorio -> recomendacao
// -> tarefa criada de verdade), este modulo guarda um "raio-x" por loja/dia que pode vir de
// duas formas, as duas gravando exatamente no mesmo lugar e alimentando os mesmos
// relatorios reais:
//   1. Preenchido a mao pelo gestor/analista na tela (ou via scripts/seed-raiox-demo.js
//      para já ter dados de teste prontos).
//   2. No futuro, escrito automaticamente por um cron que agregue os numeros reais da
//      Shopee - quando isso existir, ninguem mais precisa preencher nada a mao, so trocar
//      QUEM escreve aqui (a leitura dos relatorios nao muda).
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function keyFor(shopId, dateStr) {
  return `raiox:shop:${shopId}:${dateStr}`;
}

// dados: { faturamento, roas, acos, conversao, margem, estoque_dias, produto_critico,
//          curva_abc: [{ nome, valor }] }
async function saveRaioX(shopId, dateStr, dados, { savedBy } = {}) {
  const registro = { ...dados, shop_id: shopId, data: dateStr, salvo_em: Date.now(), salvo_por: savedBy || null };
  await redis.set(keyFor(shopId, dateStr), registro);
  await redis.sadd(`raiox:datas:${shopId}`, dateStr);
  return registro;
}

async function getRaioX(shopId, dateStr) {
  return redis.get(keyFor(shopId, dateStr));
}

// Varre um intervalo de datas (inclusive) e devolve so os dias que tem raio-x salvo,
// em ordem cronologica. Usado para tendencias (7 dias, 6 meses, etc).
async function getRaioXRange(shopId, dateStrings) {
  const registros = await Promise.all(dateStrings.map((d) => getRaioX(shopId, d)));
  return dateStrings.map((d, i) => ({ data: d, raiox: registros[i] }));
}

async function getLatestRaioX(shopId) {
  const datas = await redis.smembers(`raiox:datas:${shopId}`);
  if (!datas || datas.length === 0) return null;
  const maisRecente = datas.sort().at(-1);
  return getRaioX(shopId, maisRecente);
}

module.exports = { saveRaioX, getRaioX, getRaioXRange, getLatestRaioX };
