// Motor do "cursinho" obrigatorio para analista novo.
//
// Toda conta de analista nasce travada: nenhuma ferramenta aparece ate ela terminar o
// tutorial. O tutorial e uma sequencia de ETAPAS configuravel por gestor/líder (sem
// precisar mexer em codigo). Cada etapa tem um tipo:
//   - 'boas-vindas'    : so um video de abertura, sem pergunta.
//   - 'video-pergunta' : video + um resumo em texto + uma ou mais perguntas abertas que
//                        o analista responde. As respostas ficam visiveis para o gestor
//                        dele (silenciosamente - o analista nunca ve isso nem e avisado).
//   - 'ferramenta'     : video explicando UMA ferramenta especifica do sistema - ao
//                        concluir essa etapa, aquela ferramenta e liberada na conta dele.
//
// O progresso de cada analista (em qual etapa esta, o que ja respondeu, quais
// ferramentas ja tem liberadas) fica guardado por usuario.
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ETAPAS_KEY = 'tutorial:etapas';

function progressKey(userId) {
  return `tutorial:progresso:${userId}`;
}

function newId() {
  return crypto.randomBytes(6).toString('hex');
}

// Lista de ferramentas do sistema que podem ser liberadas ao longo do tutorial. Cada
// chave aqui deve corresponder a uma checagem real no backend/tela (ver
// lib/tutorial.js -> ferramentaLiberada, e como e usada nas rotas/telas do analista).
// Comece so com o que ja existe de verdade na tela do analista hoje - de acordo com o
// README, o que o gestor ve/usa e "Meus clientes" e "Minhas tarefas". Mais ferramentas
// podem ser adicionadas aqui conforme o restante do sistema for ligado na API real.
const FERRAMENTAS_DISPONIVEIS = [
  { chave: 'ver_clientes', nome: 'Ver meus clientes (lojas atribuidas)' },
  { chave: 'minhas_tarefas', nome: 'Minhas tarefas' },
];

async function listarEtapas() {
  const etapas = await redis.get(ETAPAS_KEY);
  return etapas || [];
}

async function salvarEtapas(etapas) {
  // reordena por "ordem" para garantir consistencia, mesmo se vier fora de ordem
  const ordenadas = [...etapas].sort((a, b) => a.ordem - b.ordem);
  await redis.set(ETAPAS_KEY, ordenadas);
  return ordenadas;
}

async function adicionarEtapa({ tipo, titulo, video_url, texto_resumo, perguntas, ferramenta_chave }) {
  const etapas = await listarEtapas();
  const novaOrdem = etapas.length > 0 ? Math.max(...etapas.map((e) => e.ordem)) + 1 : 0;
  const etapa = {
    id: newId(),
    ordem: novaOrdem,
    tipo, // 'boas-vindas' | 'video-pergunta' | 'ferramenta'
    titulo: titulo || '',
    video_url: video_url || '',
    texto_resumo: texto_resumo || '',
    perguntas: (perguntas || []).map((texto) => ({ id: newId(), texto })),
    ferramenta_chave: tipo === 'ferramenta' ? (ferramenta_chave || null) : null,
  };
  etapas.push(etapa);
  await salvarEtapas(etapas);
  return etapa;
}

async function removerEtapa(etapaId) {
  const etapas = await listarEtapas();
  const restantes = etapas.filter((e) => e.id !== etapaId);
  await salvarEtapas(restantes);
  return restantes;
}

// --- Progresso por analista ---

async function iniciarProgresso(userId) {
  const progresso = {
    user_id: userId,
    etapa_atual_indice: 0,
    concluido: false,
    ferramentas_liberadas: [],
    respostas: [], // [{ etapa_id, etapa_titulo, pergunta_id, pergunta_texto, resposta, respondido_em }]
    iniciado_em: Date.now(),
    concluido_em: null,
  };
  await redis.set(progressKey(userId), progresso);
  return progresso;
}

async function getProgresso(userId) {
  const progresso = await redis.get(progressKey(userId));
  if (progresso) return progresso;
  // Conta antiga (criada antes do tutorial existir) - trata como ja tendo tudo liberado,
  // para nao travar quem ja estava usando o sistema antes dessa funcionalidade existir.
  return {
    user_id: userId,
    etapa_atual_indice: 0,
    concluido: true,
    ferramentas_liberadas: FERRAMENTAS_DISPONIVEIS.map((f) => f.chave),
    respostas: [],
    iniciado_em: null,
    concluido_em: null,
    conta_anterior_ao_tutorial: true,
  };
}

// Retorna o que a tela do analista precisa mostrar agora: a etapa atual (se houver) e o
// progresso. etapa === null quando ja concluiu tudo.
async function getEstadoParaAnalista(userId) {
  const [etapas, progresso] = await Promise.all([listarEtapas(), getProgresso(userId)]);
  if (progresso.concluido || etapas.length === 0) {
    return { progresso, etapa: null, total_etapas: etapas.length };
  }
  const etapa = etapas[progresso.etapa_atual_indice] || null;
  if (!etapa) {
    // indice passou do fim (ex: etapas foram removidas depois) - marca como concluido.
    progresso.concluido = true;
    progresso.concluido_em = Date.now();
    await redis.set(progressKey(userId), progresso);
    return { progresso, etapa: null, total_etapas: etapas.length };
  }
  return { progresso, etapa, total_etapas: etapas.length };
}

// Registra as respostas da etapa atual e avanca para a proxima. Se a etapa atual for do
// tipo 'ferramenta', libera aquela ferramenta neste momento.
async function responderEtapaAtual(userId, respostasEnviadas) {
  const etapas = await listarEtapas();
  const progresso = await getProgresso(userId);

  if (progresso.concluido) {
    const err = new Error('O tutorial ja foi concluido.');
    err.code = 'TUTORIAL_CONCLUIDO';
    throw err;
  }

  const etapa = etapas[progresso.etapa_atual_indice];
  if (!etapa) {
    const err = new Error('Nao ha etapa atual - tutorial pode ja estar concluido.');
    err.code = 'SEM_ETAPA';
    throw err;
  }

  // Se a etapa tem perguntas, exige que todas venham respondidas.
  if (etapa.perguntas && etapa.perguntas.length > 0) {
    for (const pergunta of etapa.perguntas) {
      const resposta = (respostasEnviadas || []).find((r) => r.pergunta_id === pergunta.id);
      if (!resposta || !String(resposta.resposta || '').trim()) {
        const err = new Error(`Falta responder: "${pergunta.texto}"`);
        err.code = 'RESPOSTA_FALTANDO';
        throw err;
      }
      progresso.respostas.push({
        etapa_id: etapa.id,
        etapa_titulo: etapa.titulo,
        pergunta_id: pergunta.id,
        pergunta_texto: pergunta.texto,
        resposta: String(resposta.resposta).trim(),
        respondido_em: Date.now(),
      });
    }
  }

  if (etapa.tipo === 'ferramenta' && etapa.ferramenta_chave) {
    if (!progresso.ferramentas_liberadas.includes(etapa.ferramenta_chave)) {
      progresso.ferramentas_liberadas.push(etapa.ferramenta_chave);
    }
  }

  progresso.etapa_atual_indice += 1;
  if (progresso.etapa_atual_indice >= etapas.length) {
    progresso.concluido = true;
    progresso.concluido_em = Date.now();
    // ao concluir tudo, libera qualquer ferramenta que por acaso nao tenha sido
    // vinculada a uma etapa especifica (seguranca extra - nunca deixa nada travado
    // depois do fim do tutorial).
    for (const f of FERRAMENTAS_DISPONIVEIS) {
      if (!progresso.ferramentas_liberadas.includes(f.chave)) {
        progresso.ferramentas_liberadas.push(f.chave);
      }
    }
  }

  await redis.set(progressKey(userId), progresso);
  return progresso;
}

async function ferramentaLiberada(userId, chave) {
  const progresso = await getProgresso(userId);
  return progresso.concluido || progresso.ferramentas_liberadas.includes(chave);
}

// Respostas do tutorial de um analista especifico - usado pela tela do gestor
// (visibilidade silenciosa, o analista nunca sabe que isso e consultado).
async function respostasDoAnalista(userId) {
  const progresso = await getProgresso(userId);
  return progresso.respostas || [];
}

module.exports = {
  FERRAMENTAS_DISPONIVEIS,
  listarEtapas,
  salvarEtapas,
  adicionarEtapa,
  removerEtapa,
  iniciarProgresso,
  getProgresso,
  getEstadoParaAnalista,
  responderEtapaAtual,
  ferramentaLiberada,
  respostasDoAnalista,
};
