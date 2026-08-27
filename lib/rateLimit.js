// Limitador de tentativas simples (sem dependencia nova) usando o proprio Redis:
// conta tentativas numa janela de tempo e bloqueia quando passa do limite.
// Usado hoje para travar forca-bruta no login.
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Retorna { permitido: boolean, restante: number }. Cada chamada conta como uma
// tentativa - so incremente quando a tentativa de fato acontecer.
async function checkAndIncrement(key, limite, janelaSegundos) {
  const redisKey = `ratelimit:${key}`;
  const contagem = await redis.incr(redisKey);
  if (contagem === 1) {
    await redis.expire(redisKey, janelaSegundos);
  }
  return { permitido: contagem <= limite, restante: Math.max(0, limite - contagem) };
}

module.exports = { checkAndIncrement };
