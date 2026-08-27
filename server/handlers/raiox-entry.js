// POST /api/raiox-entry { shop_id, faturamento, roas, acos, conversao, margem,
//   estoque_dias, produto_critico, roas_sustentado_dias, curva_abc? }
// Registra o raio-x de HOJE de uma loja (lib/raioX.js). Isso alimenta os 6 relatorios e
// roda o motor de regras do Manual do Gestor na hora (pode criar tarefa de verdade).
// PADRAO ATUAL, ENQUANTO A AGREGACAO AUTOMATICA DA SHOPEE NAO EXISTE (ver aviso em
// lib/raioX.js): quem preenche e o proprio analista responsavel pela loja, ou um
// gestor/lider com acesso a ela.
//
// GET /api/raiox-entry?shop_id=... - devolve o raio-x mais recente ja salvo (para
// pre-preencher o formulario na tela).
const { requireUser } = require('../../lib/session');
const { getAssignedAnalyst } = require('../../lib/assignments');
const { adminPodeAcessarLoja } = require('../../lib/teamAccess');
const { saveRaioX, getLatestRaioX } = require('../../lib/raioX');
const { brazilDateString } = require('../../lib/timezone');
const { logAction } = require('../../lib/auditLog');

async function podeAcessar(user, shopId) {
  if (user.role === 'owner') return true;
  if (user.role === 'analyst') return (await getAssignedAnalyst(shopId)) === user.id;
  if (user.role === 'admin') return adminPodeAcessarLoja(user, shopId);
  return false;
}

module.exports = async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const { shop_id } = req.query;
    if (!shop_id) { res.status(400).json({ erro: 'Informe ?shop_id=' }); return; }
    if (!(await podeAcessar(user, shop_id))) { res.status(403).json({ erro: 'Sem acesso a essa loja.' }); return; }
    const raiox = await getLatestRaioX(shop_id);
    res.status(200).json({ raiox });
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ erro: 'Metodo nao permitido' }); return; }

  const {
    shop_id, faturamento, roas, acos, conversao, margem,
    estoque_dias, produto_critico, roas_sustentado_dias, curva_abc,
  } = req.body || {};

  if (!shop_id) { res.status(400).json({ erro: 'Informe shop_id.' }); return; }
  if (!(await podeAcessar(user, shop_id))) { res.status(403).json({ erro: 'Sem acesso a essa loja.' }); return; }

  const numOrNull = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

  const dados = {
    faturamento: numOrNull(faturamento),
    roas: numOrNull(roas),
    acos: numOrNull(acos),
    conversao: numOrNull(conversao),
    margem: numOrNull(margem),
    estoque_dias: numOrNull(estoque_dias),
    roas_sustentado_dias: numOrNull(roas_sustentado_dias),
    produto_critico: produto_critico || null,
    curva_abc: Array.isArray(curva_abc) ? curva_abc.slice(0, 10) : [],
  };

  const hoje = brazilDateString(0);
  const registro = await saveRaioX(shop_id, hoje, dados, { savedBy: user.email });

  await logAction({
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'raiox_registrado',
    target: shop_id,
    metadata: { data: hoje },
  });

  res.status(201).json({ ok: true, raiox: registro });
};
