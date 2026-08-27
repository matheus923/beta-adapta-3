// Cadastro de usuarios - tres papeis: 'owner' (Líder, voce, unico), 'admin' (Gestor de
// equipe) e 'analyst' (Analista, responsavel pelas contas de clientes). Os nomes
// exibidos na tela mudaram (Líder/Gestor/Analista), mas os valores 'owner'/'admin'/
// 'analyst' guardados no banco continuam os mesmos.
// IMPORTANTE: nao existe cadastro publico/independente nesta plataforma. Toda conta e
// criada por um líder/gestor ja logado, atraves de /api/admin/create-user (tela de
// "Criar usuario" no painel) - a pessoa recebe o e-mail e a senha diretamente de voce,
// por um canal seguro. A conta líder (a sua) e criada rodando scripts/create-admin.js
// localmente, fora do ar, com as suas proprias credenciais do banco - nunca por uma
// rota publica da internet.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

// Lista curta das senhas mais obvias/vazadas publicamente - nao substitui uma checagem
// completa (tipo zxcvbn), mas barra o caso mais grosseiro sem precisar de dependencia
// nova. Comparacao e case-insensitive.
const SENHAS_OBVIAS = new Set([
  '12345678', '123456789', '1234567890', 'password', 'password1', 'senha123',
  'senha1234', 'qwertyui', 'qwerty123', '11111111', '00000000', 'abc12345',
  'admin123', 'adaptaecom', 'shopee123', 'gestor123', 'trocaresta',
]);

// Retorna uma mensagem de erro (string) se a senha for obviamente fraca demais, ou
// null se estiver ok. Usada em toda criacao de conta (admin/owner criando alguem, ou
// o script local criando o owner).
function senhaFraca(password, email) {
  if (!password || password.length < 8) {
    return 'A senha precisa ter pelo menos 8 caracteres.';
  }
  const lower = password.toLowerCase();
  if (SENHAS_OBVIAS.has(lower)) {
    return 'Essa senha e muito obvia/comum. Escolha outra.';
  }
  const localPart = String(email || '').toLowerCase().split('@')[0];
  if (localPart && lower === localPart) {
    return 'A senha nao pode ser igual ao nome de usuario do e-mail.';
  }
  return null;
}

// Usada por /api/admin/create-user (admin logado) e por scripts/create-admin.js
// (rodado localmente, so para a primeira conta de administrador).
async function createUserWithRole({ email, password, name, role, verified = false }) {
  const normalized = String(email).toLowerCase().trim();
  const existingId = await redis.hget('users:by-email', normalized);
  if (existingId) {
    const err = new Error('E-mail ja cadastrado.');
    err.code = 'EMAIL_EXISTS';
    throw err;
  }

  const mensagemSenhaFraca = senhaFraca(password, normalized);
  if (mensagemSenhaFraca) {
    const err = new Error(mensagemSenhaFraca);
    err.code = 'SENHA_FRACA';
    throw err;
  }

  const id = newId();
  const passwordHash = await bcrypt.hash(password, 10);

  const user = {
    id,
    email: normalized,
    name: name || '',
    role,
    passwordHash,
    verified,
    active: true,
    created_at: Date.now(),
  };

  await redis.set(`user:${id}`, user);
  await redis.hset('users:by-email', { [normalized]: id });
  await redis.sadd('users:all', id);
  return user;
}

async function setUserActive(id, active) {
  const user = await redis.get(`user:${id}`);
  if (!user) return null;
  user.active = active;
  await redis.set(`user:${id}`, user);
  return user;
}

async function getUserByEmail(email) {
  const id = await redis.hget('users:by-email', String(email).toLowerCase().trim());
  if (!id) return null;
  return redis.get(`user:${id}`);
}

async function getUserById(id) {
  if (!id) return null;
  return redis.get(`user:${id}`);
}

async function listUsers() {
  const ids = await redis.smembers('users:all');
  const users = await Promise.all(ids.map((id) => redis.get(`user:${id}`)));
  return users.filter(Boolean);
}

async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.passwordHash);
}

// E-mails de todos os admins + o owner ativos - usado para escalar o alerta das 22h da
// analise de oferta relampago quando o gestor nao resolveu o problema a tempo.
async function listAdminAndOwnerEmails() {
  const users = await listUsers();
  return users
    .filter((u) => (u.role === 'admin' || u.role === 'owner') && u.active !== false)
    .map((u) => u.email);
}

// Admins ativos - usado pelo owner para escolher quem vai coordenar uma equipe nova.
async function listActiveAdmins() {
  const users = await listUsers();
  return users
    .filter((u) => u.role === 'admin' && u.active !== false)
    .map((u) => ({ id: u.id, email: u.email, name: u.name }));
}

module.exports = {
  createUserWithRole,
  setUserActive,
  getUserByEmail,
  getUserById,
  listUsers,
  verifyPassword,
  listAdminAndOwnerEmails,
  listActiveAdmins,
  senhaFraca,
};
