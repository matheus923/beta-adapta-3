// Protecao contra CSRF no fluxo de autorizacao Shopee: geramos um codigo aleatorio
// de uso unico ("state"), guardamos por 10 minutos, e conferimos no callback antes
// de aceitar o "code" - assim ninguem consegue forjar um retorno de autorizacao falso.
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function createState() {
  const state = crypto.randomBytes(24).toString('hex');
  await redis.set(`shopee:state:${state}`, '1', { ex: 600 }); // expira em 10 min
  return state;
}

async function consumeState(state) {
  if (!state) return false;
  const key = `shopee:state:${state}`;
  const exists = await redis.get(key);
  if (!exists) return false;
  await redis.del(key); // uso unico
  return true;
}

module.exports = { createState, consumeState };
