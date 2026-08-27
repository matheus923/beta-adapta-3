// Equipes: a agencia tem varias equipes, cada uma coordenada por UM gestor (role 'admin'
// no codigo) e formada por varios analistas (role 'analyst' no codigo). Nomes exibidos
// na tela: Líder ('owner'), Gestor ('admin'), Analista ('analyst') - os valores 'owner'/
// 'admin'/'analyst' guardados no banco nao mudaram, so os rotulos.
// Regras (aplicadas aqui, nao so escondidas na tela):
//   - So o líder cria uma equipe (nome + qual gestor coordena) e pode mover um analista de
//     uma equipe para outra a qualquer momento.
//   - Um gestor so pode adicionar/remover analistas NA PROPRIA equipe (a que o líder
//     atribuiu a ele) - nunca na equipe de outro gestor.
//   - Cada gestor coordena no maximo UMA equipe. Cada analista pertence a no maximo UMA
//     equipe por vez (isso e o que barra um gestor de simplesmente "roubar" um analista de
//     outro gestor - se o analista ja esta em outra equipe, so o líder pode move-lo).
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function teamKey(id) {
  return `team:${id}`;
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

async function createTeam({ name, adminId, createdBy }) {
  const existente = await redis.hget('team:by-admin', adminId);
  if (existente) {
    const err = new Error('Esse administrador ja coordena uma equipe.');
    err.code = 'ADMIN_JA_TEM_EQUIPE';
    throw err;
  }

  const id = newId();
  const team = {
    id,
    name,
    admin_id: adminId,
    created_by: createdBy,
    created_at: Date.now(),
  };
  await redis.set(teamKey(id), team);
  await redis.sadd('teams:all', id);
  await redis.hset('team:by-admin', { [adminId]: id });
  return team;
}

async function getTeam(id) {
  return redis.get(teamKey(id));
}

async function getTeamByAdmin(adminId) {
  const teamId = await redis.hget('team:by-admin', adminId);
  if (!teamId) return null;
  return getTeam(teamId);
}

async function getTeamIdForGestor(gestorId) {
  return redis.hget('gestor:team', gestorId);
}

async function getTeamGestorIds(teamId) {
  return redis.smembers(`team:gestores:${teamId}`);
}

async function listTeams() {
  const ids = await redis.smembers('teams:all');
  const teams = await Promise.all(ids.map((id) => getTeam(id)));
  return teams.filter(Boolean);
}

// actorRole/actorTeamId: quem esta pedindo a adicao. Se for admin, so pode mexer na
// propria equipe (actorTeamId === teamId) - se for owner, pode mexer em qualquer equipe.
async function addGestorToTeam({ teamId, gestorId, actorRole, actorTeamId }) {
  if (actorRole === 'admin' && actorTeamId !== teamId) {
    const err = new Error('Voce so pode adicionar gestores na sua propria equipe.');
    err.code = 'FORA_DA_EQUIPE';
    throw err;
  }

  const equipeAtualDoGestor = await getTeamIdForGestor(gestorId);
  if (equipeAtualDoGestor && equipeAtualDoGestor !== teamId) {
    if (actorRole !== 'owner') {
      const err = new Error('Esse gestor ja pertence a outra equipe. So o owner pode move-lo.');
      err.code = 'GESTOR_EM_OUTRA_EQUIPE';
      throw err;
    }
    // owner pode mover: remove da equipe anterior primeiro
    await redis.srem(`team:gestores:${equipeAtualDoGestor}`, gestorId);
  }

  await redis.sadd(`team:gestores:${teamId}`, gestorId);
  await redis.hset('gestor:team', { [gestorId]: teamId });
  return true;
}

async function removeGestorFromTeam({ teamId, gestorId, actorRole, actorTeamId }) {
  if (actorRole === 'admin' && actorTeamId !== teamId) {
    const err = new Error('Voce so pode remover gestores da sua propria equipe.');
    err.code = 'FORA_DA_EQUIPE';
    throw err;
  }
  await redis.srem(`team:gestores:${teamId}`, gestorId);
  await redis.hdel('gestor:team', gestorId);
  return true;
}

// Gestores ativos que ainda nao pertencem a nenhuma equipe - usado para montar o dropdown
// de "adicionar um gestor" na tela (tanto do owner quanto do admin).
async function listGestoresSemEquipe() {
  const { listUsers } = require('./userStore');
  const todos = await listUsers();
  const gestoresAtivos = todos.filter((u) => u.role === 'analyst' && u.active !== false);
  const semEquipe = [];
  for (const g of gestoresAtivos) {
    const equipe = await getTeamIdForGestor(g.id);
    if (!equipe) semEquipe.push({ id: g.id, email: g.email, name: g.name });
  }
  return semEquipe;
}

// Admins ativos que ainda nao coordenam nenhuma equipe - usado no formulario de criar
// equipe do owner (cada admin so pode coordenar uma).
async function listAdminsSemEquipe() {
  const { listActiveAdmins } = require('./userStore');
  const admins = await listActiveAdmins();
  const semEquipe = [];
  for (const a of admins) {
    const teamId = await redis.hget('team:by-admin', a.id);
    if (!teamId) semEquipe.push(a);
  }
  return semEquipe;
}

module.exports = {
  createTeam,
  getTeam,
  getTeamByAdmin,
  getTeamIdForGestor,
  getTeamGestorIds,
  listTeams,
  addGestorToTeam,
  removeGestorFromTeam,
  listGestoresSemEquipe,
  listAdminsSemEquipe,
};
