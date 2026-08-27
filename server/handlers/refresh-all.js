// GET /api/refresh-all
// Renova o access_token de TODAS as lojas autorizadas cujo token esta perto de expirar.
// Configure um Vercel Cron Job (vercel.json ou dashboard) para chamar esta rota a cada 3 horas,
// assim os tokens nunca ficam vencidos quando a rotina diaria for buscar os dados.
// A Vercel assina automaticamente as chamadas do proprio Cron com o header "authorization:
// Bearer <CRON_SECRET>" quando CRON_SECRET esta configurado - por isso validamos aqui,
// para que ninguem mais consiga chamar essa rota de fora.
const { refreshToken } = require('../../lib/shopeeSign');
const { listAuthorizedShops, getShopTokens, saveShopTokens } = require('../../lib/tokenStore');
const { safeCompare } = require('../../lib/safeCompare');
const { processInBatches } = require('../../lib/concurrency');

module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET) {
    res.status(500).json({ erro: 'CRON_SECRET nao configurado' });
    return;
  }
  const authHeader = req.headers['authorization'] || '';
  if (!safeCompare(authHeader, `Bearer ${process.env.CRON_SECRET}`)) {
    res.status(401).json({ erro: 'Nao autorizado.' });
    return;
  }

  const shops = await listAuthorizedShops();

  // Processa varias lojas ao mesmo tempo (em lotes), para o tempo total nao crescer
  // linearmente com o numero de clientes - ver README, secao 7.1/7.2.
  const CONCORRENCIA = Number(process.env.FLASH_SALE_CONCURRENCY || 8);

  const results = await processInBatches(shops, CONCORRENCIA, async (shopId) => {
    const current = await getShopTokens(shopId);
    if (!current) return { shopId, status: 'nao autorizada' };

    // renova um pouco antes de expirar (30 min de folga)
    const prestesAVencer = current.expires_at - Date.now() < 30 * 60 * 1000;
    if (!prestesAVencer) {
      return { shopId, status: 'ainda valido' };
    }

    try {
      const renewed = await refreshToken(current.refresh_token, shopId);
      if (renewed.error) {
        return { shopId, status: 'erro', detalhe: renewed.message };
      }
      await saveShopTokens(shopId, renewed);
      return { shopId, status: 'renovado' };
    } catch (err) {
      return { shopId, status: 'erro', detalhe: String(err) };
    }
  });

  res.status(200).json({ lojas_processadas: results });
};
