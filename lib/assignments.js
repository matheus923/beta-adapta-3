// Vinculo entre loja de cliente (shop_id) e o analista responsavel por ela.
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function assignAnalyst(shopId, analystId) {
  await redis.hset('shop:analyst', { [shopId]: analystId });
}

async function unassignAnalyst(shopId) {
  await redis.hdel('shop:analyst', shopId);
}

async function getAssignedAnalyst(shopId) {
  return redis.hget('shop:analyst', shopId);
}

async function getAllAssignments() {
  const all = await redis.hgetall('shop:analyst');
  return all || {};
}

module.exports = { assignAnalyst, unassignAnalyst, getAssignedAnalyst, getAllAssignments };
