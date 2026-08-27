// Processo seletivo dentro do proprio sistema: candidato preenche um teste de aptidao
// (dados basicos + respostas) numa tela sem login (public/candidato.html) - pensada para
// ser aberta num tablet da propria Adaptaecom durante uma prova presencial, nao para ser
// divulgada como um link publico na internet. Fica guardado como "candidato pendente"
// ate o LÍDER (role 'owner' no codigo) revisar e aprovar ou rejeitar - so ele tem acesso
// a essa tela e so ele pode mudar as perguntas do teste (nao e uma decisao do gestor de
// equipe, role 'admin' no codigo).
//
// Ao aprovar, o líder ja escolhe de uma vez a equipe do candidato: o sistema cria
// sozinho o acesso dele como analista (role 'analyst' no codigo), com uma senha
// aleatoria (repassada por voce ou por e-mail, se o Resend estiver configurado), ja
// adiciona ele aquela equipe, e avisa o gestor coordenador da equipe (com as respostas
// do teste de aptidao anexadas), para ele ja saber quem esta chegando. A conta ja nasce
// com o tutorial travado (ver lib/tutorial.js).
//
// Nota de terminologia: os valores de papel guardados no banco ('owner', 'admin',
// 'analyst') NAO mudaram - so os nomes exibidos na tela e nesta documentacao (Líder,
// Gestor, Analista) foram atualizados.
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');
const { createUserWithRole } = require('./userStore');
const { iniciarProgresso } = require('./tutorial');
const { getTeam, addGestorToTeam } = require('./teams');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function candidateKey(id) {
  return `candidate:${id}`;
}

function newId() {
  return crypto.randomBytes(10).toString('hex');
}

// Gera uma senha aleatoria legivel (evita caracteres ambiguos tipo 0/O, 1/l/I).
function gerarSenhaAleatoria() {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let senha = '';
  for (let i = 0; i < 12; i++) {
    senha += alfabeto[crypto.randomInt(0, alfabeto.length)];
  }
  return senha;
}

// Perguntas do teste de aptidao (configuraveis por admin/owner). Cada uma e uma
// pergunta de texto livre - a avaliacao e manual (o proprio admin/owner le as respostas
// antes de aprovar ou rejeitar), sem correcao automatica.
const PERGUNTAS_KEY = 'candidatos:perguntas';

async function listarPerguntasTeste() {
  const perguntas = await redis.get(PERGUNTAS_KEY);
  return perguntas || [];
}

async function salvarPerguntasTeste(perguntas) {
  await redis.set(PERGUNTAS_KEY, perguntas);
  return perguntas;
}

// --- Inscricoes de candidatos ---

async function inscreverCandidato({ nome, email, telefone, respostas }) {
  const normalizado = String(email).toLowerCase().trim();

  // Evita inscricao duplicada do mesmo e-mail enquanto a anterior ainda nao foi decidida.
  const idsExistentes = await redis.smembers('candidatos:all');
  const existentes = await Promise.all(idsExistentes.map((id) => redis.get(candidateKey(id))));
  const jaTemPendente = existentes.some(
    (c) => c && c.email === normalizado && c.status === 'pendente'
  );
  if (jaTemPendente) {
    const err = new Error('Ja existe uma inscricao pendente com esse e-mail.');
    err.code = 'JA_INSCRITO';
    throw err;
  }

  const id = newId();
  const candidato = {
    id,
    nome: String(nome || '').trim(),
    email: normalizado,
    telefone: String(telefone || '').trim(),
    respostas: respostas || [], // [{ pergunta_id, pergunta_texto, resposta }]
    status: 'pendente', // 'pendente' | 'aprovado' | 'rejeitado'
    criado_em: Date.now(),
    decidido_em: null,
    decidido_por: null,
    user_id_criado: null, // preenchido quando aprovado
  };
  await redis.set(candidateKey(id), candidato);
  await redis.sadd('candidatos:all', id);
  await redis.sadd('candidatos:pendentes', id);
  return candidato;
}

async function getCandidato(id) {
  return redis.get(candidateKey(id));
}

async function listarCandidatos() {
  const ids = await redis.smembers('candidatos:all');
  const candidatos = await Promise.all(ids.map((id) => redis.get(candidateKey(id))));
  return candidatos.filter(Boolean).sort((a, b) => b.criado_em - a.criado_em);
}

// teamId e obrigatorio: aprovar um candidato ja significa decidir para qual equipe ele
// vai, na mesma acao (nao fica um analista "solto" sem equipe depois de aprovado).
async function aprovarCandidato(id, { decididoPor, teamId }) {
  const candidato = await redis.get(candidateKey(id));
  if (!candidato) {
    const err = new Error('Candidato nao encontrado.');
    err.code = 'NAO_ENCONTRADO';
    throw err;
  }
  if (candidato.status !== 'pendente') {
    const err = new Error('Esse candidato ja foi avaliado.');
    err.code = 'JA_AVALIADO';
    throw err;
  }

  const team = await getTeam(teamId);
  if (!team) {
    const err = new Error('Equipe nao encontrada.');
    err.code = 'EQUIPE_NAO_ENCONTRADA';
    throw err;
  }

  const senhaGerada = gerarSenhaAleatoria();
  const user = await createUserWithRole({
    email: candidato.email,
    password: senhaGerada,
    name: candidato.nome,
    role: 'analyst',
    verified: true,
  });

  await iniciarProgresso(user.id);
  await addGestorToTeam({ teamId, gestorId: user.id, actorRole: 'owner', actorTeamId: null });

  candidato.status = 'aprovado';
  candidato.decidido_em = Date.now();
  candidato.decidido_por = decididoPor;
  candidato.user_id_criado = user.id;
  candidato.team_id = teamId;
  await redis.set(candidateKey(id), candidato);
  await redis.srem('candidatos:pendentes', id);
  await redis.hset('candidatos:by-user', { [user.id]: id });

  return { candidato, user, senhaGerada, team };
}

// Usado pela tela do admin/owner para mostrar o teste de aptidao de um analista da
// equipe (o mesmo teste que foi respondido antes dele virar analista).
async function getCandidatoPorUserId(userId) {
  const candidateId = await redis.hget('candidatos:by-user', userId);
  if (!candidateId) return null;
  return redis.get(candidateKey(candidateId));
}

async function rejeitarCandidato(id, { decididoPor, motivo }) {
  const candidato = await redis.get(candidateKey(id));
  if (!candidato) {
    const err = new Error('Candidato nao encontrado.');
    err.code = 'NAO_ENCONTRADO';
    throw err;
  }
  if (candidato.status !== 'pendente') {
    const err = new Error('Esse candidato ja foi avaliado.');
    err.code = 'JA_AVALIADO';
    throw err;
  }
  candidato.status = 'rejeitado';
  candidato.decidido_em = Date.now();
  candidato.decidido_por = decididoPor;
  candidato.motivo_rejeicao = motivo || null;
  await redis.set(candidateKey(id), candidato);
  await redis.srem('candidatos:pendentes', id);
  return candidato;
}

module.exports = {
  listarPerguntasTeste,
  salvarPerguntasTeste,
  inscreverCandidato,
  getCandidato,
  getCandidatoPorUserId,
  listarCandidatos,
  aprovarCandidato,
  rejeitarCandidato,
};
