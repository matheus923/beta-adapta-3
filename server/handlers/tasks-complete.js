// POST /api/tasks/complete { task_id } - marca uma tarefa como concluida. O gestor so
// consegue concluir tarefas do proprio cliente; admin/owner podem concluir qualquer uma
// (por exemplo, se o gestor avisar por fora e o admin quiser registrar).
const { requireUser } = require('../../lib/session');
const { getAssignedAnalyst } = require('../../lib/assignments');
const { getTask, completeTask } = require('../../lib/tasks');
const { logAction } = require('../../lib/auditLog');
const { adminPodeAcessarLoja } = require('../../lib/teamAccess');

module.exports = async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method !== 'POST') {
    res.status(405).json({ erro: 'Metodo nao permitido' });
    return;
  }

  const { task_id } = req.body || {};
  if (!task_id) {
    res.status(400).json({ erro: 'Informe task_id.' });
    return;
  }

  const task = await getTask(task_id);
  if (!task) {
    res.status(404).json({ erro: 'Tarefa nao encontrada.' });
    return;
  }

  if (user.role === 'analyst') {
    const responsavel = await getAssignedAnalyst(task.shop_id);
    if (responsavel !== user.id) {
      res.status(403).json({ erro: 'Voce nao tem acesso a essa tarefa.' });
      return;
    }
  } else if (user.role === 'admin') {
    const podeAcessar = await adminPodeAcessarLoja(user, task.shop_id);
    if (!podeAcessar) {
      res.status(403).json({ erro: 'Essa tarefa e de um cliente cuidado por outra equipe.' });
      return;
    }
  }

  const atualizado = await completeTask(task_id, user.email);

  await logAction({
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'task_completed',
    target: task.shop_id,
    metadata: { task_id, description: task.description },
  });

  res.status(200).json({ ok: true, task: atualizado });
};
