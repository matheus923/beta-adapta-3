// Cron diario (1x/dia - limite do plano Hobby da Vercel, ver README) que tira uma "foto"
// do preco de cada anuncio e da meta de ROAS de cada campanha de cada loja, compara com a
// foto de ontem, e registra toda mudanca encontrada (lib/marketplaceChanges.js),
// atribuida ao analista responsavel pela loja no momento da deteccao. Essas mudancas
// alimentam o relatorio semanal do gestor (ver cron-weekly-report.js).
const { safeCompare } = require('../../lib/safeCompare');
const { processInBatches } = require('../../lib/concurrency');
const { listAuthorizedShops, getShopNames } = require('../../lib/tokenStore');
const { getValidAccessToken } = require('../../lib/shopeeAuth');
const { listShopItemPrices, listShopAdCampaignsRoas } = require('../../lib/shopeeMetrics');
const { analyzeChanges } = require('../../lib/metricsChangeAnalysis');
const { saveSnapshot, getSnapshot } = require('../../lib/metricsSnapshot');
const { logChange } = require('../../lib/marketplaceChanges');
const { brazilDateString } = require('../../lib/timezone');
const { getAssignedAnalyst } = require('../../lib/assignments');
const { getUserById } = require('../../lib/userStore');

module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET) {
    res.status(500).json({ erro: 'CRON_SECRET nao configurado' });
    return;
  }
  const auth = req.headers['authorization'] || '';
  if (!safeCompare(auth, `Bearer ${process.env.CRON_SECRET}`)) {
    res.status(401).json({ erro: 'Nao autorizado' });
    return;
  }

  const shopIds = await listAuthorizedShops();
  const names = await getShopNames();
  const hoje = brazilDateString(0);
  const ontem = brazilDateString(-1);
  const CONCORRENCIA = Number(process.env.FLASH_SALE_CONCURRENCY || 8);

  const resultados = await processInBatches(shopIds, CONCORRENCIA, async (shopId) => {
    try {
      const accessToken = await getValidAccessToken(shopId);
      if (!accessToken) {
        return { shop_id: shopId, erro: 'token invalido ou loja nao autorizada' };
      }

      const [precos, campanhas] = await Promise.all([
        listShopItemPrices(shopId, accessToken),
        listShopAdCampaignsRoas(shopId, accessToken),
      ]);

      const snapshotOntem = await getSnapshot(shopId, ontem);
      await saveSnapshot(shopId, hoje, { precos, campanhas });

      if (!snapshotOntem) {
        // Primeira vez que essa loja e checada (ou nao houve checagem ontem) - nao tem
        // com o que comparar ainda, entao so guarda a foto de hoje como ponto de partida.
        return { shop_id: shopId, mudancas: 0, primeira_checagem: true };
      }

      const mudancas = analyzeChanges({
        ontemPrecos: snapshotOntem.precos,
        hojePrecos: precos,
        ontemCampanhas: snapshotOntem.campanhas,
        hojeCampanhas: campanhas,
      });

      if (mudancas.length > 0) {
        const analystId = await getAssignedAnalyst(shopId);
        const analista = analystId ? await getUserById(analystId) : null;
        const clientName = names[shopId] || shopId;

        await Promise.all(
          mudancas.map((m) =>
            logChange({
              shopId,
              clientName,
              analystId,
              analystEmail: analista ? analista.email : null,
              tipo: m.tipo,
              rotulo: m.rotulo,
              valorAntes: m.valor_antes,
              valorDepois: m.valor_depois,
              detectadoEm: Date.now(),
            })
          )
        );
      }

      return { shop_id: shopId, mudancas: mudancas.length };
    } catch (err) {
      return { shop_id: shopId, erro: String(err) };
    }
  });

  res.status(200).json({ ok: true, checados: resultados.length, resultados });
};
