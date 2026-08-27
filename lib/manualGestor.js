// Motor de regras do Manual do Gestor: aplica os limites do manual interno da Adaptaecom
// (ver skill "adapta-manual-do-gestor") num raio-x numerico e devolve (a) o modo da conta
// e (b) as recomendacoes de acao. Isso e a "IA" mencionada nos relatorios - hoje e um
// motor de regras deterministico (nao uma chamada a um modelo de linguagem), mas o
// resultado - classificacao + recomendacao + tarefa criada - e real e roda de verdade a
// cada relatorio. Trocar isto por uma chamada real a API da Claude no futuro NAO muda a
// interface deste modulo (mesma entrada, mesma saida), so a forma como a recomendacao e
// escrita.
const REF_CONVERSAO = 10; // %
const ACOS_EXCELENTE = 3;
const ACOS_BOM = 5;
const ACOS_ATENCAO = 8; // %
const MARGEM_IDEAL = 30; // %
const MARGEM_MIN_ESCALA = 20; // %
const ESTOQUE_MIN_DIAS = 10;
const ESTOQUE_IDEAL_DIAS = 15;
const ROAS_SUSTENTADO_DIAS = 7;

// metrics: { faturamento, faturamento_delta_pct, roas, acos, conversao, margem,
//            estoque_dias, roas_sustentado_dias, produto_critico }
function classificarModo(metrics) {
  const motivos = [];

  if (typeof metrics.estoque_dias === 'number' && metrics.estoque_dias <= 0) {
    motivos.push(`ruptura de estoque (${metrics.estoque_dias} dias de cobertura)`);
    return { modo: 'protecao', motivos };
  }
  if (typeof metrics.acos === 'number' && metrics.acos >= ACOS_ATENCAO * 1.5) {
    motivos.push(`ACOS muito acima do ponto de atencao (${metrics.acos}% vs ${ACOS_ATENCAO}%+)`);
    return { modo: 'protecao', motivos };
  }

  let atencao = false;
  if (typeof metrics.estoque_dias === 'number' && metrics.estoque_dias < ESTOQUE_MIN_DIAS) {
    motivos.push(`cobertura de estoque abaixo do minimo (${metrics.estoque_dias} dias, minimo ${ESTOQUE_MIN_DIAS})`);
    atencao = true;
  }
  if (typeof metrics.acos === 'number' && metrics.acos >= ACOS_ATENCAO) {
    motivos.push(`ACOS no ponto de atencao ou acima (${metrics.acos}% vs ${ACOS_ATENCAO}%+)`);
    atencao = true;
  }
  if (typeof metrics.conversao === 'number' && metrics.conversao < REF_CONVERSAO * 0.7) {
    motivos.push(`conversao bem abaixo da referencia (${metrics.conversao}% vs ${REF_CONVERSAO}%)`);
    atencao = true;
  }
  if (atencao) return { modo: 'atencao', motivos };

  let otimizacao = false;
  if (typeof metrics.margem === 'number' && metrics.margem < MARGEM_IDEAL) {
    motivos.push(`margem abaixo do ideal (${metrics.margem}% vs ~${MARGEM_IDEAL}%)`);
    otimizacao = true;
  }
  if (typeof metrics.conversao === 'number' && metrics.conversao < REF_CONVERSAO) {
    motivos.push(`conversao abaixo da referencia (${metrics.conversao}% vs ${REF_CONVERSAO}%)`);
    otimizacao = true;
  }
  if (otimizacao) return { modo: 'otimizacao', motivos };

  const criteriosEscala =
    typeof metrics.roas_sustentado_dias === 'number' && metrics.roas_sustentado_dias >= ROAS_SUSTENTADO_DIAS &&
    typeof metrics.margem === 'number' && metrics.margem >= MARGEM_MIN_ESCALA &&
    typeof metrics.estoque_dias === 'number' && metrics.estoque_dias >= ESTOQUE_MIN_DIAS;

  if (criteriosEscala) {
    motivos.push(`ROAS sustentado ha ${metrics.roas_sustentado_dias}+ dias, margem e estoque dentro do minimo para escalar`);
  }
  return { modo: 'escala', motivos };
}

// Devolve uma lista de recomendacoes; cada uma com issue_key estavel (para o motor de
// tarefas nao duplicar) e prazo sugerido em dias.
function gerarRecomendacoes(metrics) {
  const recs = [];

  if (typeof metrics.estoque_dias === 'number' && metrics.estoque_dias <= 0) {
    recs.push({
      issue_key: 'ruptura_estoque',
      titulo: `Repor estoque${metrics.produto_critico ? ` do "${metrics.produto_critico}"` : ''} com prioridade maxima.`,
      porque: `Cobertura em ${metrics.estoque_dias} dia(s) - risco de ruptura ativa, protocolo de contencao do Manual do Gestor (secao 8).`,
      prazo_dias: 0,
    });
  } else if (typeof metrics.estoque_dias === 'number' && metrics.estoque_dias < ESTOQUE_MIN_DIAS) {
    recs.push({
      issue_key: 'estoque_baixo',
      titulo: `Confirmar reposicao de estoque${metrics.produto_critico ? ` do "${metrics.produto_critico}"` : ''} nos proximos dias.`,
      porque: `Cobertura em ${metrics.estoque_dias} dias, abaixo do minimo de ${ESTOQUE_MIN_DIAS} recomendado pelo Manual do Gestor.`,
      prazo_dias: 3,
    });
  }

  if (typeof metrics.acos === 'number' && metrics.acos >= ACOS_ATENCAO) {
    recs.push({
      issue_key: 'acos_alto',
      titulo: 'Reduzir a meta de ROAS da campanha principal antes de qualquer novo aporte.',
      porque: `ACOS em ${metrics.acos}%, acima do ponto de atencao de ${ACOS_ATENCAO}% do Manual do Gestor - a margem esta sendo corroida pelo investimento em ads.`,
      prazo_dias: 0,
    });
  }

  if (typeof metrics.margem === 'number' && metrics.margem < MARGEM_IDEAL) {
    recs.push({
      issue_key: 'margem_abaixo_ideal',
      titulo: 'Recalcular o ROAS de empate do produto principal e revisar a precificacao.',
      porque: `Margem em ${metrics.margem}%, abaixo do ideal de ~${MARGEM_IDEAL}% do Manual do Gestor.`,
      prazo_dias: 2,
    });
  }

  if (typeof metrics.conversao === 'number' && metrics.conversao < REF_CONVERSAO) {
    recs.push({
      issue_key: 'conversao_baixa',
      titulo: 'Investigar o funil de conversao (trafego -> carrinho -> venda).',
      porque: `Conversao em ${metrics.conversao}%, abaixo da referencia de ${REF_CONVERSAO}% do Manual do Gestor.`,
      prazo_dias: 4,
    });
  }

  const criteriosEscala =
    typeof metrics.roas_sustentado_dias === 'number' && metrics.roas_sustentado_dias >= ROAS_SUSTENTADO_DIAS &&
    typeof metrics.margem === 'number' && metrics.margem >= MARGEM_MIN_ESCALA &&
    typeof metrics.estoque_dias === 'number' && metrics.estoque_dias >= ESTOQUE_MIN_DIAS;

  if (criteriosEscala) {
    recs.push({
      issue_key: 'pronta_para_escalar',
      titulo: 'Conta atende os criterios de escala segura - avaliar aumento de orcamento gradual (15-30%).',
      porque: `ROAS sustentado ha ${metrics.roas_sustentado_dias}+ dias, margem em ${metrics.margem}% e estoque em ${metrics.estoque_dias} dias - todos dentro do minimo do Manual do Gestor (secao 7).`,
      prazo_dias: 5,
    });
  }

  if (recs.length === 0) {
    recs.push({
      issue_key: null,
      titulo: 'Nenhum ponto fora do padrao do Manual do Gestor hoje.',
      porque: 'Mencionado aqui so para registro - nenhuma tarefa foi criada porque esta tudo dentro do esperado.',
      prazo_dias: null,
      sem_acao: true,
    });
  }

  return recs;
}

const MODO_LABEL = { escala: 'Escala', otimizacao: 'Otimização', atencao: 'Atenção', protecao: 'Proteção' };

module.exports = {
  classificarModo,
  gerarRecomendacoes,
  MODO_LABEL,
  REF_CONVERSAO, ACOS_EXCELENTE, ACOS_BOM, ACOS_ATENCAO, MARGEM_IDEAL, MARGEM_MIN_ESCALA,
  ESTOQUE_MIN_DIAS, ESTOQUE_IDEAL_DIAS, ROAS_SUSTENTADO_DIAS,
};
