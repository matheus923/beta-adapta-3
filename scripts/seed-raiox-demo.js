// Preenche 7 dias de raio-x de demonstracao para todas as lojas ja autorizadas, e marca
// alguns itens da rotina semanal dos analistas - so para o BETA poder ser testado de
// ponta a ponta (login -> relatorio -> recomendacao -> tarefa criada) sem precisar
// esperar a integracao real de faturamento/ACOS/estoque com a Shopee (ver aviso em
// lib/raioX.js). Nao mexe em tokens, usuarios ou equipes - so em raio-x e rotina.
//
// Como usar (mesmo esquema do create-admin.js):
//   export UPSTASH_REDIS_REST_URL="..." && export UPSTASH_REDIS_REST_TOKEN="..."
//   node scripts/seed-raiox-demo.js
const { listAuthorizedShops, getShopNames } = require('../lib/tokenStore');
const { saveRaioX } = require('../lib/raioX');
const { getAllAssignments } = require('../lib/assignments');
const { marcarItem, isoWeekString, DIAS } = require('../lib/routineChecklist');
const { brazilDateString } = require('../lib/timezone');

// Perfis ciclicos - se houver mais lojas que perfis, repete do inicio.
const PERFIS = [
  { base: 9000, tendencia: 1.09, roas: 18.2, acos: 4.1, conversao: 12.4, margem: 29, estoque_dias: 12, roas_sustentado_dias: 11, produto_critico: 'Vestido Midi Linho' },
  { base: 6700, tendencia: 0.92, roas: 11.4, acos: 9.4, conversao: 4.2, margem: 18, estoque_dias: 3, roas_sustentado_dias: 0, produto_critico: 'Fone Bluetooth X2' },
  { base: 2500, tendencia: 1.01, roas: 9.8, acos: 9.1, conversao: 9.7, margem: 21, estoque_dias: 18, roas_sustentado_dias: 2, produto_critico: 'Jogo de Panelas Inox' },
];

function numeroComVariacao(valor, seed) {
  const ruido = 1 + (Math.sin(seed) * 0.03);
  return Math.round(valor * ruido * 100) / 100;
}

async function main() {
  const shopIds = await listAuthorizedShops();
  if (shopIds.length === 0) {
    console.log('Nenhuma loja autorizada ainda. Conecte uma loja de teste (/api/authorize) antes de rodar este script.');
    return;
  }
  const names = await getShopNames();

  for (let i = 0; i < shopIds.length; i++) {
    const shopId = shopIds[i];
    const perfil = PERFIS[i % PERFIS.length];
    console.log(`Semeando raio-x de ${names[shopId] || shopId} (perfil ${i % PERFIS.length + 1})...`);

    for (let diasAtras = 6; diasAtras >= 0; diasAtras--) {
      const dateStr = brazilDateString(-diasAtras);
      const passos = 6 - diasAtras; // 0..6, cresce a cada dia mais recente
      const faturamento = numeroComVariacao(perfil.base * Math.pow(perfil.tendencia, passos / 6), i + diasAtras);

      await saveRaioX(shopId, dateStr, {
        faturamento,
        roas: perfil.roas,
        acos: perfil.acos,
        conversao: perfil.conversao,
        margem: perfil.margem,
        estoque_dias: Math.max(0, perfil.estoque_dias - Math.floor(diasAtras / 3)),
        roas_sustentado_dias: perfil.roas_sustentado_dias,
        produto_critico: perfil.produto_critico,
        curva_abc: [
          { nome: perfil.produto_critico, valor: Math.round(faturamento * 0.62) },
          { nome: 'Item secundario', valor: Math.round(faturamento * 0.24) },
        ],
      }, { savedBy: 'seed-raiox-demo' });
    }
  }

  // Marca a rotina da semana atual para todo analista que ja tem loja atribuida - alguns
  // dias "em dia", outros deixados em aberto de proposito, para o relatorio ter o que
  // mostrar tanto de aderencia total quanto de aderencia parcial.
  const assignments = await getAllAssignments();
  const analystIds = [...new Set(Object.values(assignments))];
  const semanaIso = isoWeekString(new Date());

  for (let i = 0; i < analystIds.length; i++) {
    const analystId = analystIds[i];
    const diasParaMarcar = i % 2 === 0 ? DIAS : DIAS.slice(0, 4); // um analista fica com "sexta" em aberto
    console.log(`Marcando rotina da semana ${semanaIso} para o analista ${analystId}: ${diasParaMarcar.join(', ')}`);
    for (const dia of diasParaMarcar) {
      await marcarItem(analystId, semanaIso, dia, { atraso: dia === 'sexta' && i % 3 === 0 });
    }
  }

  console.log('\nPronto! Os 6 relatorios ja tem dados de demonstracao para testar de ponta a ponta.');
  console.log('Isso substitui a integracao real de faturamento/ACOS/estoque, que ainda nao existe (ver README, secao Fase 4).');
}

main().catch((err) => { console.error(err); process.exit(1); });
