// Guarda o resultado de cada analise de oferta relampago (por loja + data da oferta
// analisada), para ter historico e para a checagem das 22h saber o que foi encontrado
// as 20h. Nao guarda os itens crus - so a lista de problemas encontrados.
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function keyFor(shopId, dateStr) {
  return `flashsale:analise:${shopId}:${dateStr}`;
}

// etapa: '20h' ou '22h'
async function saveAnalysis(shopId, dateStr, { problemas, checked_at, etapa }) {
  const registro = { problemas, checked_at, etapa };
  await redis.set(keyFor(shopId, dateStr), registro);
  return registro;
}

async function getAnalysis(shopId, dateStr) {
  return redis.get(keyFor(shopId, dateStr));
}

module.exports = { saveAnalysis, getAnalysis };
