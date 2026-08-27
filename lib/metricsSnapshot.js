// Guarda a "foto do dia" de preco de anuncios e meta de ROAS de cada loja, para o cron
// diario poder comparar com a foto do dia anterior e descobrir o que mudou (ver
// lib/metricsChangeAnalysis.js). So guarda o valor mais recente e o do dia anterior -
// nao acumula historico infinito (isso fica no log de mudancas, lib/marketplaceChanges.js).
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function keyFor(shopId, dateStr) {
  return `metrics:snapshot:${shopId}:${dateStr}`;
}

async function saveSnapshot(shopId, dateStr, { precos, campanhas }) {
  const registro = { precos, campanhas, salvo_em: Date.now() };
  await redis.set(keyFor(shopId, dateStr), registro);
  return registro;
}

async function getSnapshot(shopId, dateStr) {
  return redis.get(keyFor(shopId, dateStr));
}

module.exports = { saveSnapshot, getSnapshot };
