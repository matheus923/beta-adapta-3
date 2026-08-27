// Checklist real da rotina semanal do analista, conforme a secao 9 do Manual do Gestor:
// segunda (alinhamento), terca (revisao de anuncios), quarta (analise profunda), quinta
// (revisao de promocoes), sexta (relatorio). O analista marca cada item como feito na
// propria tela - isso e o que alimenta a "aderencia a rotina" no relatorio do gestor e
// no relatorio mensal do lider (nao e um numero inventado: e o proprio analista
// confirmando, com timestamp real de quando marcou).
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const DIAS = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];
const LABEL = {
  segunda: 'Alinhamento da semana',
  terca: 'Revisao de anuncios',
  quarta: 'Analise profunda',
  quinta: 'Revisao de promocoes',
  sexta: 'Relatorio (reputacao, curva ABC, expedicao)',
};

function keyFor(analystId, weekStr) {
  return `rotina:${analystId}:${weekStr}`;
}

// weekStr no formato "YYYY-Www" (ISO week), ex: "2026-W34" - usar isoWeekString() abaixo
// a partir de uma data qualquer daquela semana.
function isoWeekString(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // 0 = segunda
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // quinta-feira da mesma semana
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function marcarItem(analystId, weekStr, dia, { atraso = false } = {}) {
  if (!DIAS.includes(dia)) {
    const err = new Error(`Dia de rotina invalido: ${dia}`);
    err.code = 'DIA_INVALIDO';
    throw err;
  }
  const atual = (await redis.get(keyFor(analystId, weekStr))) || {};
  atual[dia] = { feito: true, atraso: Boolean(atraso), marcado_em: Date.now() };
  await redis.set(keyFor(analystId, weekStr), atual);
  return atual;
}

async function getSemana(analystId, weekStr) {
  const registro = (await redis.get(keyFor(analystId, weekStr))) || {};
  return DIAS.map((dia) => ({
    dia,
    label: LABEL[dia],
    feito: Boolean(registro[dia]?.feito),
    atraso: Boolean(registro[dia]?.atraso),
    marcado_em: registro[dia]?.marcado_em || null,
  }));
}

async function getAdesaoResumo(analystId, weekStr) {
  const semana = await getSemana(analystId, weekStr);
  const feitos = semana.filter((d) => d.feito).length;
  return { total: DIAS.length, feitos, semana };
}

module.exports = { DIAS, LABEL, isoWeekString, marcarItem, getSemana, getAdesaoResumo };
