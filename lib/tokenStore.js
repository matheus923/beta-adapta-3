// Armazenamento dos tokens de cada loja autorizada, usando Upstash Redis (gratuito, serverless)
// Crie uma conta em https://upstash.com, crie um banco Redis e copie as duas variaveis
// UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN para o ambiente do projeto na Vercel.
const { Redis } = require('@upstash/redis');
const { encrypt, decrypt } = require('./crypto');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function keyFor(shopId) {
  return `shopee:shop:${shopId}`;
}

async function saveShopTokens(shopId, { access_token, refresh_token, expire_in }) {
  const record = {
    // tokens sao criptografados antes de ir para o banco - nunca ficam em texto puro no Redis
    access_token: encrypt(access_token),
    refresh_token: encrypt(refresh_token),
    // guarda quando o access_token expira, para sabermos quando renovar
    expires_at: Date.now() + (expire_in ? expire_in * 1000 : 4 * 60 * 60 * 1000),
    updated_at: Date.now(),
  };
  await redis.set(keyFor(shopId), record);
  // mantem uma lista de todas as lojas autorizadas, para a rotina diaria saber quais existem
  await redis.sadd('shopee:shops', String(shopId));
  return { ...record, access_token, refresh_token }; // retorna a versao decriptada para uso imediato
}

async function getShopTokens(shopId) {
  const record = await redis.get(keyFor(shopId));
  if (!record) return null;
  return {
    ...record,
    access_token: decrypt(record.access_token),
    refresh_token: decrypt(record.refresh_token),
  };
}

async function listAuthorizedShops() {
  return redis.smembers('shopee:shops');
}

// Nome amigavel para identificar a loja na telinha (ex: "Cliente X - Shopee")
async function saveShopName(shopId, name) {
  await redis.hset('shopee:shop:names', { [shopId]: name });
}

async function getShopNames() {
  const names = await redis.hgetall('shopee:shop:names');
  return names || {};
}

module.exports = {
  saveShopTokens,
  getShopTokens,
  listAuthorizedShops,
  saveShopName,
  getShopNames,
};
