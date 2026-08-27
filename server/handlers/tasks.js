// GET /api/tasks?shop_id=... - lista as tarefas de um cliente (com dias_pendente
// calculado). Gestor so consegue ver as do proprio cliente atribuido; admin/owner podem
// ver de qualquer cliente.
//
// POST /api/tasks { shop_id, description, issue_key? } - pensada para ser chamada pela
// AUTOMACAO DIARIA (via chave de servico) quando o relatorio aponta um problema - nao
// para criacao manual no dia a dia. "issue_key" identifica o TIPO do problema (ex:
// "acos_alto"); se nao vier, e gerado a partir da descricao. Se ja existir uma tarefa
// PENDENTE do mesmo issue_key nesse cliente, nao cria outra - devolve a existente, cujo
// "dias_pendente" ja reflete havia quantos dias o problema persiste (calculado a partir
// da data em que foi detectado pela primeira vez). So cria uma tarefa nova se nao houver
// nenhuma pendente para aquele problema (ou se a anterior ja foi resolvida).
// Tambem aceita ser chamada por admin/owner manualmente, como excecao (por exemplo,
// enquanto a automacao diaria ainda nao esta no ar).
const { requireUser } = require('../../lib/session');
const { getAssignedAnalyst } = require('../../lib/assignments');
const { createTask, findPendingTaskByIssueKey, listTasksForShop, slugify } = require('../../lib/tasks');
const { logAction } = require('../../lib/auditLog');
const { safeCompare } = require('../../lib/safeCompare');
const { adminPodeAcessarLoja } = require('../../lib/teamAccess');

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const chaveServico = req.headers['x-service-key'];
    const viaServico = Boolean(chaveServico) && safeCompare(chaveServico, process.env.SERVICE_KEY);

    let actor = null;
    if (!viaServico) {
      actor = await requireUser(req, res, { roles: ['admin', 'owner'] });
      if (!actor) return;
    }

    const { shop_id, description } = req.body || {};
    let { issue_key } = req.body || {};
    if (!shop_id || !description) {
      res.status(400).json({ erro: 'Informe shop_id e description.' });
      return;
    }

    // Um admin so pode criar tarefa manual para um cliente sem gestor ainda, ou de um
    // gestor da PROPRIA equipe - nunca de um cliente de outra equipe (owner e a chamada
    // via chave de servico nao tem essa restricao).
    if (actor && actor.role === 'admin') {
      const podeAcessar = await adminPodeAcessarLoja(actor, shop_id);
      if (!podeAcessar) {
        res.status(403).json({ erro: 'Esse cliente e cuidado por um gestor de outra equipe.' });
        return;
      }
    }

    issue_key = issue_key || slugify(description);

    // Nao deixa criar a mesma tarefa de novo enquanto a anterior (mesmo problema, mesmo
    // cliente) ainda estiver pendente - so atualiza o quadro com o "dias_pendente" novo.
    const existente = await findPendingTaskByIssueKey(shop_id, issue_key);
    if (existente) {
      res.status(200).json({
        ok: true,
        ja_existia: true,
        mensagem: `Ja existe uma tarefa pendente para esse problema ha ${existente.dias_pendente} dia(s) - nao foi criada uma nova.`,
        task: existente,
      });
      return;
    }

    const task = await createTask({
      shop_id,
      description,
      issue_key,
      created_by: actor ? actor.email : 'automacao',
    });

    await logAction({
      actorId: actor ? actor.id : null,
      actorEmail: actor ? actor.email : 'automacao (relatorio diario)',
      actorRole: actor ? actor.role : 'sistema',
      action: 'task_created',
      target: shop_id,
      metadata: { task_id: task.id, description, issue_key },
    });

    res.status(201).json({ ok: true, ja_existia: false, task });
    return;
  }

  // GET
  const user = await requireUser(req, res);
  if (!user) return;

  const { shop_id } = req.query;
  if (!shop_id) {
    res.status(400).json({ erro: 'Informe ?shop_id=' });
    return;
  }

  if (user.role === 'analyst') {
    const responsavel = await getAssignedAnalyst(shop_id);
    if (responsavel !== user.id) {
      res.status(403).json({ erro: 'Voce nao tem acesso a essa loja.' });
      return;
    }
  } else if (user.role === 'admin') {
    const podeAcessar = await adminPodeAcessarLoja(user, shop_id);
    if (!podeAcessar) {
      res.status(403).json({ erro: 'Esse cliente e cuidado por um gestor de outra equipe.' });
      return;
    }
  }

  const tasks = await listTasksForShop(shop_id);
  res.status(200).json({ tasks });
};
