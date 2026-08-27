// Cron das 20h (horario de Brasilia) - roda 1x/dia (necessario pelo limite do plano Hobby
// da Vercel: cron so pode rodar 1x/dia por job, com margem de ate 59 min de imprecisao no
// horario - ver README, secao "Plano Hobby vs Pro").
//
// Confirma que a oferta relampago de AMANHA foi criada e compara com a de HOJE, procurando:
//  - anuncio que estava na oferta de hoje e sumiu na de amanha
//  - estoque adicionado por variacao abaixo do minimo (FLASH_SALE_MIN_STOCK, padrao 30)
//  - preco muito diferente (para cima ou para baixo) do praticado hoje (FLASH_SALE_PRICE_DEVIATION_PERCENT, padrao 20%)
// Se achar problema, avisa por e-mail o gestor responsavel pela loja e cria/reaproveita uma
// tarefa (nao duplica se ja existir uma pendente para a oferta desse dia).
const { safeCompare } = require('../../lib/safeCompare');
const { processInBatches } = require('../../lib/concurrency');
const { listAuthorizedShops, getShopNames } = require('../../lib/tokenStore');
const { getValidAccessToken } = require('../../lib/shopeeAuth');
const { getFlashSaleItemsInWindow } = require('../../lib/shopeeFlashSale');
const { analyze } = require('../../lib/flashSaleAnalysis');
const { saveAnalysis } = require('../../lib/flashSaleSnapshot');
const { brazilDateString, dayWindowUnix } = require('../../lib/timezone');
const { getAssignedAnalyst } = require('../../lib/assignments');
const { getUserById } = require('../../lib/userStore');
const { sendFlashSaleAlertEmail } = require('../../lib/mailer');
const { createTask, findPendingTaskByIssueKey } = require('../../lib/tasks');

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
  const amanha = brazilDateString(1);
  const janelaHoje = dayWindowUnix(hoje);
  const janelaAmanha = dayWindowUnix(amanha);

  // Processa varias lojas ao mesmo tempo (em lotes) em vez de uma atras da outra - isso e
  // o que mantem o tempo total dessa checagem baixo mesmo com a carteira de clientes
  // crescendo (ver README, secao 7.1/7.2, sobre tempo de execucao x numero de clientes).
  const CONCORRENCIA = Number(process.env.FLASH_SALE_CONCURRENCY || 8);

  const resultados = await processInBatches(shopIds, CONCORRENCIA, async (shopId) => {
    try {
      const accessToken = await getValidAccessToken(shopId);
      if (!accessToken) {
        return { shop_id: shopId, erro: 'token invalido ou loja nao autorizada' };
      }

      const [baseline, next] = await Promise.all([
        getFlashSaleItemsInWindow(shopId, accessToken, janelaHoje.start, janelaHoje.end),
        getFlashSaleItemsInWindow(shopId, accessToken, janelaAmanha.start, janelaAmanha.end),
      ]);

      const semOfertaAmanha = !next.flashSale;
      const problemas = semOfertaAmanha
        ? [{ tipo: 'oferta_nao_criada', detalhe: `Nenhuma oferta relampago encontrada para amanha (${amanha}). Confirme se ela foi criada.` }]
        : analyze({ baselineItems: baseline.items, nextItems: next.items });

      await saveAnalysis(shopId, amanha, { problemas, checked_at: Date.now(), etapa: '20h' });

      if (problemas.length > 0) {
        const gestorId = await getAssignedAnalyst(shopId);
        const gestor = gestorId ? await getUserById(gestorId) : null;
        const clientName = names[shopId] || shopId;

        // Cria/reaproveita a tarefa do gestor para essa oferta - nao duplica se ja existir
        // uma pendente com o mesmo issue_key (mesma oferta, mesmo dia).
        const issueKey = `oferta_relampago_${amanha}`;
        const existente = await findPendingTaskByIssueKey(shopId, issueKey);
        if (!existente) {
          await createTask({
            shop_id: shopId,
            description: `Oferta relampago de ${amanha} com pendencias: ${problemas.map((p) => p.tipo).join(', ')}.`,
            issue_key: issueKey,
            created_by: 'automacao_oferta_relampago',
          });
        }

        if (gestor && gestor.email) {
          await sendFlashSaleAlertEmail(gestor.email, clientName, problemas, amanha);
        }

        return { shop_id: shopId, problemas: problemas.length, gestor_avisado: Boolean(gestor && gestor.email) };
      }
      return { shop_id: shopId, problemas: 0 };
    } catch (err) {
      return { shop_id: shopId, erro: String(err) };
    }
  });

  res.status(200).json({ ok: true, checados: resultados.length, resultados });
};
