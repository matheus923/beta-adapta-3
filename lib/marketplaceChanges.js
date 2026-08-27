// Log das mudancas de metrica (preco de anuncio, meta de ROAS) detectadas automaticamente
// pela checagem diaria, atribuidas ao analista responsavel pela loja no momento da
// deteccao. Cada registro guarda a DATA em que foi detectado (nao o segundo exato em que
// o analista mexeu - ver lib/metricsChangeAnalysis.js sobre essa limitacao).
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = 'metrics:mudancas';
const MAX_ENTRIES = 5000;

async function logChange({ shopId, clientName, analystId, analystEmail, tipo, rotulo, valorAntes, valorDepois, detectadoEm }) {
  const entry = {
    id: crypto.randomBytes(8).toString('hex'),
    shopId,
    clientName: clientName || shopId,
    analystId: analystId || null,
    analystEmail: analystEmail || null,
    tipo,
    rotulo,
    valorAntes,
    valorDepois,
    detectadoEm: detectadoEm || Date.now(),
  };
  await redis.lpush(KEY, entry);
  await redis.ltrim(KEY, 0, MAX_ENTRIES - 1);
  return entry;
}

async function listAllChanges(limit = 1000) {
  return redis.lrange(KEY, 0, limit - 1);
}

// Mudancas dos ultimos N dias, de uma lista especifica de analistas (usado para montar o
// relatorio semanal do gestor, so com a propria equipe) - o log inteiro (ate o teto de
// 5000) e varrido e filtrado, simples e suficiente para o volume esperado aqui (mesma
// abordagem do lib/auditLog.js).
async function listChangesSince({ sinceTs, analystIds } = {}) {
  const todas = await redis.lrange(KEY, 0, MAX_ENTRIES - 1);
  const idsPermitidos = analystIds ? new Set(analystIds) : null;
  return todas.filter((m) => {
    if (sinceTs && m.detectadoEm < sinceTs) return false;
    if (idsPermitidos && !idsPermitidos.has(m.analystId)) return false;
    return true;
  });
}

module.exports = { logChange, listAllChanges, listChangesSince };
