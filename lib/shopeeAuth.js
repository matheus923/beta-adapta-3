// Garante que o access_token de uma loja esta valido ANTES de usar - renova sozinho se
// estiver perto de expirar. Isso substitui a dependencia de um cron frequente para
// manter os tokens vivos (importante porque o plano gratuito da Vercel so permite cron
// job uma vez por dia - ver README). Toda chamada a API da Shopee em nome de uma loja
// deve passar por aqui antes.
const { refreshToken } = require('./shopeeSign');
const { getShopTokens, saveShopTokens } = require('./tokenStore');

const MARGEM_MS = 5 * 60 * 1000; // renova se faltar menos de 5 minutos para expirar

async function getValidAccessToken(shopId) {
  const tokens = await getShopTokens(shopId);
  if (!tokens) return null;

  const prestesAVencer = tokens.expires_at - Date.now() < MARGEM_MS;
  if (!prestesAVencer) {
    return tokens.access_token;
  }

  const renewed = await refreshToken(tokens.refresh_token, shopId);
  if (renewed.error) {
    // token de atualizacao tambem invalido/expirado - a loja precisa autorizar de novo
    return null;
  }

  const saved = await saveShopTokens(shopId, renewed);
  return saved.access_token;
}

module.exports = { getValidAccessToken };
