// Tarefas ligadas a um cliente (shop_id) - a ideia e serem geradas automaticamente pelo
// relatorio diario quando ele aponta um problema (ex: "ACOS acima do limite"), nao
// criadas manualmente. Cada problema tem um "issue_key" (um identificador estavel do
// TIPO de problema, ex: "acos_alto") - enquanto a mesma tarefa continuar pendente, o
// relatorio diario NAO cria uma nova, so reconhece que o mesmo problema persiste. O
// numero de dias pendente e sempre calculado a partir de created_at, entao cresce
// sozinho a cada dia sem precisar de nenhuma acao extra.
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function taskKey(id) {
  return `task:${id}`;
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function comDiasPendente(task) {
  const dias = Math.floor((Date.now() - task.created_at) / (24 * 60 * 60 * 1000));
  return { ...task, dias_pendente: task.status === 'pending' ? dias : 0 };
}

async function createTask({ shop_id, description, issue_key, created_by }) {
  const id = crypto.randomBytes(8).toString('hex');
  const task = {
    id,
    shop_id,
    description,
    issue_key: issue_key || slugify(description),
    status: 'pending', // 'pending' | 'done'
    created_by, // e-mail de quem criou, ou 'automacao' quando vier do relatorio diario
    created_at: Date.now(),
    completed_at: null,
    completed_by: null,
  };
  await redis.set(taskKey(id), task);
  await redis.sadd(`tasks:shop:${shop_id}`, id);
  await redis.sadd('tasks:all', id);
  return task;
}

// Usado antes de criar uma tarefa nova: se o mesmo problema (issue_key) desse cliente
// ja tem uma tarefa pendente, reaproveita ela em vez de criar duplicada.
async function findPendingTaskByIssueKey(shop_id, issue_key) {
  const tasks = await listTasksForShop(shop_id);
  return tasks.find((t) => t.status === 'pending' && t.issue_key === issue_key) || null;
}

async function getTask(id) {
  const task = await redis.get(taskKey(id));
  return task ? comDiasPendente(task) : null;
}

async function listTasksForShop(shop_id) {
  const ids = await redis.smembers(`tasks:shop:${shop_id}`);
  const tasks = await Promise.all(ids.map((id) => redis.get(taskKey(id))));
  return tasks.filter(Boolean).sort((a, b) => b.created_at - a.created_at).map(comDiasPendente);
}

async function listAllTasks() {
  const ids = await redis.smembers('tasks:all');
  const tasks = await Promise.all(ids.map((id) => redis.get(taskKey(id))));
  return tasks.filter(Boolean).sort((a, b) => b.created_at - a.created_at).map(comDiasPendente);
}

async function completeTask(id, completedBy) {
  const task = await redis.get(taskKey(id));
  if (!task) return null;
  task.status = 'done';
  task.completed_at = Date.now();
  task.completed_by = completedBy;
  await redis.set(taskKey(id), task);
  return comDiasPendente(task);
}

module.exports = {
  createTask,
  findPendingTaskByIssueKey,
  getTask,
  listTasksForShop,
  listAllTasks,
  completeTask,
  slugify,
};
