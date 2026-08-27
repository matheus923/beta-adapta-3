// Roteador unico de todas as rotas /api/*.
//
// Motivo deste arquivo existir: o plano gratuito (Hobby) da Vercel permite no maximo
// 12 Serverless Functions por deploy. Este projeto tem mais de 20 rotas diferentes -
// se cada arquivo dentro de api/ virasse uma funcao separada (como era antes), o deploy
// e recusado com o erro "No more than 12 Serverless Functions can be added...".
//
// A solucao, sem mudar NADA do que o painel ou qualquer cliente da API chama (as URLs
// continuam exatamente iguais: /api/login, /api/admin/users, /api/teams/members etc.),
// e concentrar tudo em UMA UNICA funcao (esta aqui), que recebe qualquer caminho dentro
// de /api/... e repassa para o modulo certo dentro da pasta server/handlers/. A logica
// de cada rota continua isolada em seu proprio arquivo, exatamente como antes - so o
// "empacotamento" para a Vercel mudou.
//
// Se um dia migrarmos para o plano Pro (que permite bem mais funcoes), da para voltar a
// separar em arquivos individuais se quiser - mas nao ha necessidade, esse formato
// funciona igual e sem custo extra.

const routes = {
  'authorize': () => require('../server/handlers/authorize'),
  'callback': () => require('../server/handlers/callback'),
  'login': () => require('../server/handlers/login'),
  'logout': () => require('../server/handlers/logout'),
  'me': () => require('../server/handlers/me'),
  'refresh-all': () => require('../server/handlers/refresh-all'),
  'shop-data': () => require('../server/handlers/shop-data'),
  'shops': () => require('../server/handlers/shops'),
  'tasks': () => require('../server/handlers/tasks'),
  'tasks/complete': () => require('../server/handlers/tasks-complete'),
  'teams': () => require('../server/handlers/teams'),
  'teams/members': () => require('../server/handlers/teams-members'),
  'admin/analysts': () => require('../server/handlers/admin-analysts'),
  'admin/assign': () => require('../server/handlers/admin-assign'),
  'admin/audit-log': () => require('../server/handlers/admin-audit-log'),
  'admin/create-user': () => require('../server/handlers/admin-create-user'),
  'admin/tasks-overview': () => require('../server/handlers/admin-tasks-overview'),
  'admin/mudancas-metricas': () => require('../server/handlers/admin-mudancas-metricas'),
  'admin/toggle-user': () => require('../server/handlers/admin-toggle-user'),
  'admin/users': () => require('../server/handlers/admin-users'),
  'owner/audit-log': () => require('../server/handlers/owner-audit-log'),
  'cron/flash-sale-check-20h': () => require('../server/handlers/cron-flash-sale-check-20h'),
  'cron/flash-sale-check-22h': () => require('../server/handlers/cron-flash-sale-check-22h'),
  'cron/metrics-daily-check': () => require('../server/handlers/cron-metrics-daily-check'),
  'cron/weekly-report': () => require('../server/handlers/cron-weekly-report'),

  // Processo seletivo (candidato -> analista) - Fase 2. So o OWNER avalia/aprova/
  // rejeita candidatos e edita as perguntas do teste - ver server/handlers/owner-*.
  'candidatos/perguntas': () => require('../server/handlers/candidatos-perguntas'),
  'candidatos/inscrever': () => require('../server/handlers/candidatos-inscrever'),
  'owner/candidatos': () => require('../server/handlers/owner-candidatos'),
  'owner/candidatos/aprovar': () => require('../server/handlers/owner-candidatos-aprovar'),
  'owner/candidatos/rejeitar': () => require('../server/handlers/owner-candidatos-rejeitar'),
  'owner/teste-candidato/perguntas': () => require('../server/handlers/owner-teste-candidato-perguntas'),
  // admin (da propria equipe) ou owner podem ver o teste de aptidao de um analista.
  'admin/candidatos/por-analista': () => require('../server/handlers/admin-candidato-por-analista'),

  // Tutorial obrigatorio do analista novo - Fase 2
  'admin/tutorial/etapas': () => require('../server/handlers/admin-tutorial-etapas'),
  'admin/tutorial/upload': () => require('../server/handlers/admin-tutorial-upload'),
  'admin/tutorial/respostas': () => require('../server/handlers/admin-tutorial-respostas'),
  'tutorial/estado': () => require('../server/handlers/tutorial-estado'),
  'tutorial/responder': () => require('../server/handlers/tutorial-responder'),

  // Relatorios (analista diario/semanal, gestor clientes/equipe, lider mensal) - Fase 4.
  // Ver lib/reportEngine.js e lib/raioX.js.
  'reports/analista': () => require('../server/handlers/report-analista'),
  'reports/gestor-clientes': () => require('../server/handlers/report-gestor-clientes'),
  'reports/gestor-equipe': () => require('../server/handlers/report-gestor-equipe'),
  'reports/lider': () => require('../server/handlers/report-lider'),
  'rotina': () => require('../server/handlers/rotina'),
  'raiox-entry': () => require('../server/handlers/raiox-entry'),
};

// Rotas que NAO exigem estar logado (o resto do sistema, por padrao, sempre exige).
// Usado so para navegacao/depuracao - a checagem de verdade continua sendo feita dentro
// de cada handler (chamando requireUser ou nao).
const ROTAS_PUBLICAS = new Set(['candidatos/perguntas', 'candidatos/inscrever']);

module.exports = async (req, res) => {
  // Em alguns ambientes de deploy, o parametro de rota "pega-tudo" do arquivo
  // [...slug].js chega em req.query com a chave "slug" (o normal), mas em
  // outros chega com a chave literal "...slug" (com os tres pontos inclusos).
  // Aceitamos os dois formatos para nao depender desse detalhe do provedor.
  const slugParam = req.query.slug !== undefined ? req.query.slug : req.query['...slug'];
  const slugArr = Array.isArray(slugParam) ? slugParam : (slugParam ? [slugParam] : []);
  const key = slugArr.join('/');

  const loadHandler = routes[key];
  if (!loadHandler) {
    res.status(404).json({ erro: 'Rota nao encontrada.' });
    return;
  }

  try {
    const handler = loadHandler();
    return await handler(req, res);
  } catch (e) {
    // DEBUG TEMPORARIO: mostra o erro real em vez de uma tela generica.
    // Assim que resolvermos, removemos este bloco de novo.
    if (!res.headersSent) {
      res.status(500).json({
        erro: 'Erro interno.',
        debug_mensagem: e && e.message,
        debug_stack: e && e.stack,
      });
    }
  }
};
