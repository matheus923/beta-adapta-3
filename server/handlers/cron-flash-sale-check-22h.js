// Cron das 22h (horario de Brasilia) - roda 1x/dia (mesma limitacao de plano Hobby citada
// no cron das 20h). Reanalisa a oferta relampago de amanha da mesma forma que a checagem
// das 20h. Se o gestor NAO corrigiu nada e o problema ainda existe, escala por e-mail para
// TODOS os admins + o owner (nao so para o gestor responsavel).
const { safeCompare } = require('../../lib/safeCompare');
const { processInBatches } = require('../../lib/concurrency');
const { listAuthorizedShops, getShopNames } = require('../../lib/tokenStore');
const { getValidAccessToken } = require('../../lib/shopeeAuth');
const { getFlashSaleItemsInWindow } = require('../../lib/shopeeFlashSale');
const { analyze } = require('../../lib/flashSaleAnalysis');
const { saveAnalysis } = require('../../lib/flashSaleSnapshot');
const { brazilDateString, dayWindowUnix } = require('../../lib/timezone');
const { getAssignedAnalyst } = require('../../lib/assignments');
const { getUserById, listAdminAndOwnerEmails } = require('../../lib/userStore');
const { sendFlashSaleEscalationEmail } = require('../../lib/mailer');
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

  const adminEmails = await listAdminAndOwnerEmails();

  // Processa varias lojas ao mesmo tempo (em lotes) em vez de uma atras da outra - ver
  // README, secao 7.1/7.2, sobre tempo de execucao x numero de clientes.
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
        ? [{ tipo: 'oferta_nao_criada', detalhe: `Nenhuma oferta relampago encontrada para amanha (${amanha}). Ainda nao foi criada.` }]
        : analyze({ baselineItems: baseline.items, nextItems: next.items });

      await saveAnalysis(shopId, amanha, { problemas, checked_at: Date.now(), etapa: '22h' });

      if (problemas.length > 0) {
        const gestorId = await getAssignedAnalyst(shopId);
        const gestor = gestorId ? await getUserById(gestorId) : null;
        const clientName = names[shopId] || shopId;

        // Garante que a tarefa do gestor continua existindo/pendente (nao cria duplicada).
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

        if (adminEmails.length > 0) {
          await sendFlashSaleEscalationEmail(
            adminEmails,
            clientName,
            gestor ? gestor.email : null,
            problemas,
            amanha
          );
        }

        return { shop_id: shopId, problemas: problemas.length, escalado: adminEmails.length > 0 };
      }
      return { shop_id: shopId, problemas: 0 };
    } catch (err) {
      return { shop_id: shopId, erro: String(err) };
    }
  });

  res.status(200).json({ ok: true, checados: resultados.length, resultados });
};
