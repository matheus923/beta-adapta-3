// Log de auditoria: registra acoes importantes (criar/desativar conta, atribuir gestor,
// gerar link de autorizacao, renomear cliente, concluir tarefa, etc.)
// Guardamos so as ultimas 5000 acoes (mais que suficiente para fiscalizacao) numa lista
// no Redis. Duas visoes diferentes sao servidas a partir do mesmo log:
//   - owner: ve tudo (admins e gestores)
//   - admin: ve so as acoes de quem tem role 'analyst' (gestor)
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = 'audit:all';
const MAX_ENTRIES = 5000;

async function logAction({ actorId, actorEmail, actorRole, action, target, metadata }) {
  const entry = {
    id: crypto.randomBytes(8).toString('hex'),
    ts: Date.now(),
    actorId,
    actorEmail,
    actorRole,
    action,
    target: target || null,
    metadata: metadata || null,
  };
  await redis.lpush(KEY, entry);
  await redis.ltrim(KEY, 0, MAX_ENTRIES - 1);
  return entry;
}

async function listAllActions(limit = 300) {
  return redis.lrange(KEY, 0, limit - 1);
}

async function listActionsByRole(role, limit = 300) {
  // varre o log inteiro (ate o teto de 5000) e filtra - simples e suficiente para o
  // volume esperado aqui. Se um dia o log crescer muito, isso pode ser otimizado com
  // listas separadas por papel.
  const all = await redis.lrange(KEY, 0, MAX_ENTRIES - 1);
  return all.filter((e) => e.actorRole === role).slice(0, limit);
}

module.exports = { logAction, listAllActions, listActionsByRole };
