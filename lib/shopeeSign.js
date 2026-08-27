// Helpers para assinar requisicoes da Shopee Open Platform API v2
// Doc de referencia: https://open.shopee.com/documents (Authorization -> Public/Shop-level APIs)
const crypto = require('crypto');

const PARTNER_ID = process.env.SHOPEE_PARTNER_ID;
const PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY;

// Use 'https://partner.test-stable.shopeemobile.com' para SANDBOX (testes)
// Use 'https://partner.shopeemobile.com' para PRODUCAO (dados reais de clientes)
const BASE_URL = process.env.SHOPEE_BASE_URL || 'https://partner.test-stable.shopeemobile.com';

function nowTimestamp() {
  return Math.floor(Date.now() / 1000);
}

// Assinatura para endpoints publicos (ex: gerar link de autorizacao, trocar code por token)
// base string = partner_id + api_path + timestamp
function signPublic(apiPath, timestamp) {
  const baseString = `${PARTNER_ID}${apiPath}${timestamp}`;
  return crypto.createHmac('sha256', PARTNER_KEY).update(baseString).digest('hex');
}

// Assinatura para endpoints de loja (ex: pedidos, produtos, ads de uma loja especifica)
// base string = partner_id + api_path + timestamp + access_token + shop_id
function signShop(apiPath, timestamp, accessToken, shopId) {
  const baseString = `${PARTNER_ID}${apiPath}${timestamp}${accessToken}${shopId}`;
  return crypto.createHmac('sha256', PARTNER_KEY).update(baseString).digest('hex');
}

// Monta a URL que o cliente (dono da loja) precisa abrir para autorizar o app da Adaptaecom
// "state" e um codigo aleatorio de uso unico (protecao CSRF) - ver lib/oauthState.js
function buildAuthUrl(redirectUrl, state) {
  const apiPath = '/api/v2/shop/auth_partner';
  const timestamp = nowTimestamp();
  const sign = signPublic(apiPath, timestamp);
  const url = new URL(BASE_URL + apiPath);
  url.searchParams.set('partner_id', PARTNER_ID);
  url.searchParams.set('timestamp', timestamp);
  url.searchParams.set('sign', sign);
  // a Shopee devolve esse valor de volta no callback, sem alterar - usamos para validar
  url.searchParams.set('redirect', `${redirectUrl}?state=${encodeURIComponent(state)}`);
  return url.toString();
}

// Troca o "code" recebido no callback por access_token + refresh_token
async function exchangeCodeForToken(code, shopId) {
  const apiPath = '/api/v2/auth/token/get';
  const timestamp = nowTimestamp();
  const sign = signPublic(apiPath, timestamp);
  const url = new URL(BASE_URL + apiPath);
  url.searchParams.set('partner_id', PARTNER_ID);
  url.searchParams.set('timestamp', timestamp);
  url.searchParams.set('sign', sign);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, shop_id: Number(shopId), partner_id: Number(PARTNER_ID) }),
  });
  return res.json();
}

// Renova o access_token usando o refresh_token (access_token expira em ~4h)
async function refreshToken(refreshTokenValue, shopId) {
  const apiPath = '/api/v2/auth/access_token/get';
  const timestamp = nowTimestamp();
  const sign = signPublic(apiPath, timestamp);
  const url = new URL(BASE_URL + apiPath);
  url.searchParams.set('partner_id', PARTNER_ID);
  url.searchParams.set('timestamp', timestamp);
  url.searchParams.set('sign', sign);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: refreshTokenValue,
      shop_id: Number(shopId),
      partner_id: Number(PARTNER_ID),
    }),
  });
  return res.json();
}

// Chamada generica assinada para qualquer endpoint de loja (pedidos, produtos, ads, etc.)
async function callShopApi(apiPath, shopId, accessToken, params = {}, method = 'GET') {
  const timestamp = nowTimestamp();
  const sign = signShop(apiPath, timestamp, accessToken, shopId);
  const url = new URL(BASE_URL + apiPath);
  url.searchParams.set('partner_id', PARTNER_ID);
  url.searchParams.set('timestamp', timestamp);
  url.searchParams.set('sign', sign);
  url.searchParams.set('shop_id', shopId);
  url.searchParams.set('access_token', accessToken);

  if (method === 'GET') {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    return res.json();
  }

  const res = await fetch(url.toString(), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

module.exports = {
  buildAuthUrl,
  exchangeCodeForToken,
  refreshToken,
  callShopApi,
};
