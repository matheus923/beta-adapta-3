// Motor dos 6 relatorios (analista diario/semanal, gestor clientes diario/semanal,
// gestor equipe semanal, lider mensal). Le dados reais ja existentes no sistema (tarefas,
// mudancas de metrica detectadas pelo cron, checklist de rotina, times/atribuicoes) e o
// raio-x diario de cada loja (lib/raioX.js - ver o aviso ali sobre o que e real hoje e o
// que ainda depende de integrar mais APIs da Shopee). Ao rodar, tambem CRIA TAREFAS DE
// VERDADE (lib/tasks.js) a partir das recomendacoes do Manual do Gestor - nao e so uma
// tela bonita, o relatorio de fato movimenta o sistema.
const { getRaioX, getRaioXRange, getLatestRaioX } = require('./raioX');
const { classificarModo, gerarRecomendacoes, MODO_LABEL } = require('./manualGestor');
const { createTask, findPendingTaskByIssueKey, listTasksForShop } = require('./tasks');
const { logChange, listChangesSince } = require('./marketplaceChanges');
const { getAdesaoResumo, isoWeekString } = require('./routineChecklist');
const { getAssignedAnalyst, getAllAssignments } = require('./assignments');
const { getShopNames, listAuthorizedShops } = require('./tokenStore');
const { getUserById } = require('./userStore');
const { getTeamByAdmin, getTeamGestorIds, listTeams } = require('./teams');
const { brazilDateString } = require('./timezone');

function prazoLabel(dias) {
  if (dias === null || dias === undefined) return null;
  if (dias <= 0) return 'vence hoje';
  if (dias === 1) return 'vence amanhã';
  return `vence em ${dias} dias`;
}

function ultimosNDias(n, aPartirDe = 0) {
  const datas = [];
  for (let i = n - 1; i >= 0; i--) datas.push(brazilDateString(aPartirDe - i));
  return datas;
}

function diaDaSemanaCurto(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  return `${dias[dt.getUTCDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

// Roda o motor de regras num raio-x e CRIA as tarefas de verdade (reaproveitando uma
// pendente do mesmo issue_key, como o resto do sistema ja faz). Devolve as recomendacoes
// com o status real da tarefa (criada agora, ja existia, ou sem acao).
async function aplicarRecomendacoes({ shopId, analystId, actorLabel }) {
  const raiox = await getLatestRaioX(shopId);
  if (!raiox) return { modo: null, motivos: [], recomendacoes: [], raiox: null };

  const { modo, motivos } = classificarModo(raiox);
  const recomendacoesBrutas = gerarRecomendacoes(raiox);

  const recomendacoes = [];
  for (const rec of recomendacoesBrutas) {
    if (rec.sem_acao || !analystId) {
      recomendacoes.push({ ...rec, tarefa: null });
      continue;
    }
    const existente = await findPendingTaskByIssueKey(shopId, rec.issue_key);
    let task = existente;
    if (!existente) {
      task = await createTask({
        shop_id: shopId,
        description: rec.titulo,
        issue_key: rec.issue_key,
        created_by: 'ia_manual_gestor',
      });
    }
    recomendacoes.push({
      ...rec,
      tarefa: {
        id: task.id,
        ja_existia: Boolean(existente),
        prazo_label: prazoLabel(rec.prazo_dias),
      },
    });
  }

  return { modo, modo_label: MODO_LABEL[modo] || null, motivos, recomendacoes, raiox };
}

// --- Analista -------------------------------------------------------------

async function shopsDoAnalista(analystId) {
  const assignments = await getAllAssignments();
  return Object.entries(assignments).filter(([, aId]) => aId === analystId).map(([shopId]) => shopId);
}

async function buildAnalistaDiario(analystId) {
  const analista = await getUserById(analystId);
  const shopIds = await shopsDoAnalista(analystId);
  const names = await getShopNames();
  const hoje = brazilDateString(0);
  const dias7 = ultimosNDias(7);

  const contas = [];
  for (const shopId of shopIds) {
    const resultado = await aplicarRecomendacoes({ shopId, analystId });
    const trendRange = await getRaioXRange(shopId, dias7);
    contas.push({
      shop_id: shopId,
      nome: names[shopId] || shopId,
      ...resultado,
      tendencia_faturamento: trendRange.map((r) => r.raiox?.faturamento ?? null),
    });
  }

  const tasks = (await Promise.all(shopIds.map((s) => listTasksForShop(s)))).flat();
  const pendentes = tasks.filter((t) => t.status === 'pending');

  return {
    tipo: 'analista_diario',
    gerado_em: Date.now(),
    data: hoje,
    analista: analista ? { id: analista.id, nome: analista.name || analista.email } : null,
    contas,
    tarefas_pendentes: pendentes,
    dias_trend: dias7.map(diaDaSemanaCurto),
  };
}

async function buildAnalistaSemanal(analystId) {
  const analista = await getUserById(analystId);
  const shopIds = await shopsDoAnalista(analystId);
  const names = await getShopNames();
  const semanaIso = isoWeekString(new Date());
  const dias7 = ultimosNDias(7);

  const contas = [];
  for (const shopId of shopIds) {
    const resultado = await aplicarRecomendacoes({ shopId, analystId });
    const trendRange = await getRaioXRange(shopId, dias7);
    contas.push({
      shop_id: shopId,
      nome: names[shopId] || shopId,
      ...resultado,
      tendencia_faturamento: trendRange.map((r) => r.raiox?.faturamento ?? null),
    });
  }

  const mudancasSemana = await listChangesSince({
    sinceTs: Date.now() - 7 * 24 * 60 * 60 * 1000,
    analystIds: [analystId],
  });

  const tasks = (await Promise.all(shopIds.map((s) => listTasksForShop(s)))).flat();
  const concluidasSemana = tasks.filter(
    (t) => t.status === 'done' && t.completed_at && t.completed_at > Date.now() - 7 * 24 * 60 * 60 * 1000
  );

  const rotina = await getAdesaoResumo(analystId, semanaIso);

  return {
    tipo: 'analista_semanal',
    gerado_em: Date.now(),
    semana: semanaIso,
    analista: analista ? { id: analista.id, nome: analista.name || analista.email } : null,
    contas,
    mudancas_semana: mudancasSemana,
    tarefas_concluidas_semana: concluidasSemana.length,
    tarefas_totais_semana: tasks.filter((t) => t.created_at > Date.now() - 7 * 24 * 60 * 60 * 1000).length,
    rotina,
    dias_trend: dias7.map(diaDaSemanaCurto),
  };
}

// --- Gestor (clientes) -----------------------------------------------------

async function shopsDaEquipe(adminId) {
  const team = await getTeamByAdmin(adminId);
  if (!team) return { team: null, shopIds: [] };
  const analystIds = new Set(await getTeamGestorIds(team.id));
  const assignments = await getAllAssignments();
  const shopIds = Object.entries(assignments)
    .filter(([, aId]) => analystIds.has(aId))
    .map(([shopId]) => shopId);
  return { team, shopIds, analystIds: [...analystIds] };
}

async function buildGestorClientes(adminId, { periodo = 'diario' } = {}) {
  const gestor = await getUserById(adminId);
  const { team, shopIds } = await shopsDaEquipe(adminId);
  const names = await getShopNames();
  const assignments = await getAllAssignments();
  const dias7 = ultimosNDias(7);
  const janelaMs = periodo === 'semanal' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  const contas = [];
  for (const shopId of shopIds) {
    const analystId = assignments[shopId] || null;
    const resultado = await aplicarRecomendacoes({ shopId, analystId });
    const analista = analystId ? await getUserById(analystId) : null;
    const trendRange = await getRaioXRange(shopId, dias7);
    contas.push({
      shop_id: shopId,
      nome: names[shopId] || shopId,
      analista: analista ? { id: analista.id, nome: analista.name || analista.email } : null,
      ...resultado,
      tendencia_faturamento: trendRange.map((r) => r.raiox?.faturamento ?? null),
    });
  }

  const mudancas = await listChangesSince({
    sinceTs: Date.now() - janelaMs,
    analystIds: contas.map((c) => c.analista?.id).filter(Boolean),
  });

  return {
    tipo: `gestor_clientes_${periodo}`,
    gerado_em: Date.now(),
    periodo,
    gestor: gestor ? { id: gestor.id, nome: gestor.name || gestor.email } : null,
    equipe: team ? { id: team.id, nome: team.name } : null,
    contas,
    mudancas,
    dias_trend: dias7.map(diaDaSemanaCurto),
  };
}

// --- Gestor (equipe) --------------------------------------------------------

async function buildGestorEquipe(adminId) {
  const gestor = await getUserById(adminId);
  const { team, shopIds, analystIds } = await shopsDaEquipe(adminId);
  const assignments = await getAllAssignments();
  const semanaIso = isoWeekString(new Date());
  const inicioSemanaMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const analistas = [];
  for (const analystId of analystIds || []) {
    const analista = await getUserById(analystId);
    if (!analista) continue;
    const shopsDele = Object.entries(assignments).filter(([, aId]) => aId === analystId).map(([sId]) => sId);
    const tasksDele = (await Promise.all(shopsDele.map((s) => listTasksForShop(s)))).flat();
    const concluidasSemana = tasksDele.filter((t) => t.status === 'done' && t.completed_at > inicioSemanaMs);
    const totalSemana = tasksDele.filter((t) => t.created_at > inicioSemanaMs);
    const mudancasDele = await listChangesSince({ sinceTs: inicioSemanaMs, analystIds: [analystId] });
    const rotina = await getAdesaoResumo(analystId, semanaIso);

    analistas.push({
      id: analystId,
      nome: analista.name || analista.email,
      clientes: shopsDele.length,
      tarefas_concluidas_semana: concluidasSemana.length,
      tarefas_totais_semana: totalSemana.length,
      mudancas_semana: mudancasDele.length,
      rotina,
    });
  }

  const todasMudancas = (await Promise.all(analistas.map((a) => listChangesSince({ sinceTs: inicioSemanaMs, analystIds: [a.id] })))).flat();

  return {
    tipo: 'gestor_equipe_semanal',
    gerado_em: Date.now(),
    semana: semanaIso,
    gestor: gestor ? { id: gestor.id, nome: gestor.name || gestor.email } : null,
    equipe: team ? { id: team.id, nome: team.name } : null,
    analistas,
    mudancas_semana: todasMudancas,
  };
}

// --- Lider (mensal) ----------------------------------------------------------

async function buildLiderMensal() {
  const teams = await listTeams();
  const assignments = await getAllAssignments();
  const shopIds = await listAuthorizedShops();
  const names = await getShopNames();
  const inicioMesMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const equipes = [];
  for (const team of teams) {
    const analystIds = new Set(await getTeamGestorIds(team.id));
    const gestor = await getUserById(team.admin_id);
    const shopsDaEquipeAtual = Object.entries(assignments)
      .filter(([, aId]) => analystIds.has(aId))
      .map(([sId]) => sId);

    let faturamentoMes = 0;
    let contasAtencaoProtecao = 0;
    const modos = { escala: 0, otimizacao: 0, atencao: 0, protecao: 0 };

    for (const shopId of shopsDaEquipeAtual) {
      const raiox = await getLatestRaioX(shopId);
      if (raiox?.faturamento) faturamentoMes += raiox.faturamento;
      if (raiox) {
        const { modo } = classificarModo(raiox);
        modos[modo] = (modos[modo] || 0) + 1;
        if (modo === 'atencao' || modo === 'protecao') contasAtencaoProtecao += 1;
      }
    }

    const mudancasMes = await listChangesSince({ sinceTs: inicioMesMs, analystIds: [...analystIds] });

    const tasksEquipe = (await Promise.all(shopsDaEquipeAtual.map((s) => listTasksForShop(s)))).flat();
    const tasksMes = tasksEquipe.filter((t) => t.created_at > inicioMesMs);
    const concluidasMes = tasksMes.filter((t) => t.status === 'done');
    const escalonamentosAbertos = tasksEquipe.filter((t) => t.status === 'pending' && t.dias_pendente > 7);

    equipes.push({
      id: team.id,
      nome: team.name,
      gestor: gestor ? { id: gestor.id, nome: gestor.name || gestor.email } : null,
      analistas: analystIds.size,
      clientes: shopsDaEquipeAtual.length,
      faturamento_mes: faturamentoMes,
      contas_atencao_protecao: contasAtencaoProtecao,
      contas_por_modo: modos,
      mudancas_mes: mudancasMes.length,
      tarefas_concluidas_pct: tasksMes.length ? Math.round((concluidasMes.length / tasksMes.length) * 100) : null,
      escalonamentos_abertos: escalonamentosAbertos.map((t) => ({
        shop_id: t.shop_id,
        cliente: names[t.shop_id] || t.shop_id,
        descricao: t.description,
        dias_pendente: t.dias_pendente,
      })),
    });
  }

  const modosTotais = { escala: 0, otimizacao: 0, atencao: 0, protecao: 0 };
  equipes.forEach((e) => Object.entries(e.contas_por_modo).forEach(([k, v]) => { modosTotais[k] += v; }));

  return {
    tipo: 'lider_mensal',
    gerado_em: Date.now(),
    mes: brazilDateString(0).slice(0, 7),
    equipes,
    contas_por_modo_total: modosTotais,
    faturamento_total: equipes.reduce((s, e) => s + e.faturamento_mes, 0),
    escalonamentos_abertos_total: equipes.reduce((s, e) => s + e.escalonamentos_abertos.length, 0),
  };
}

module.exports = {
  aplicarRecomendacoes,
  buildAnalistaDiario,
  buildAnalistaSemanal,
  buildGestorClientes,
  buildGestorEquipe,
  buildLiderMensal,
  prazoLabel,
};
