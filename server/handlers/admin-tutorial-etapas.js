// GET /api/admin/tutorial/etapas - lista as etapas configuradas.
// POST /api/admin/tutorial/etapas - adiciona uma etapa nova (video de boas-vindas,
// video+pergunta, ou video de uma ferramenta a liberar).
// DELETE (via body { etapa_id, _method: 'delete' } - ver nota abaixo) remove uma etapa.
// Admin/owner.
const { requireUser } = require('../../lib/session');
const { listarEtapas, adicionarEtapa, removerEtapa, FERRAMENTAS_DISPONIVEIS } = require('../../lib/tutorial');
const { logAction } = require('../../lib/auditLog');

const TIPOS_VALIDOS = ['boas-vindas', 'video-pergunta', 'ferramenta'];

module.exports = async (req, res) => {
  const user = await requireUser(req, res, { roles: ['admin', 'owner'] });
  if (!user) return;

  if (req.method === 'GET') {
    const etapas = await listarEtapas();
    res.status(200).json({ etapas, ferramentas_disponiveis: FERRAMENTAS_DISPONIVEIS });
    return;
  }

  if (req.method === 'POST') {
    const { acao, etapa_id, tipo, titulo, video_url, texto_resumo, perguntas, ferramenta_chave } = req.body || {};

    if (acao === 'remover') {
      if (!etapa_id) {
        res.status(400).json({ erro: 'etapa_id e obrigatorio para remover.' });
        return;
      }
      const restantes = await removerEtapa(etapa_id);
      await logAction({ actorId: user.id, actorEmail: user.email, actorRole: user.role, action: 'removeu_etapa_tutorial', target: etapa_id });
      res.status(200).json({ ok: true, etapas: restantes });
      return;
    }

    if (!TIPOS_VALIDOS.includes(tipo)) {
      res.status(400).json({ erro: `tipo deve ser um de: ${TIPOS_VALIDOS.join(', ')}` });
      return;
    }
    if (!video_url || String(video_url).trim().length === 0) {
      res.status(400).json({ erro: 'video_url e obrigatorio (envie o video ou cole um link).' });
      return;
    }
    if (tipo === 'video-pergunta' && (!Array.isArray(perguntas) || perguntas.length === 0)) {
      res.status(400).json({ erro: 'Etapas do tipo "video-pergunta" precisam de pelo menos uma pergunta.' });
      return;
    }
    if (tipo === 'ferramenta' && !FERRAMENTAS_DISPONIVEIS.some((f) => f.chave === ferramenta_chave)) {
      res.status(400).json({ erro: 'ferramenta_chave invalida.' });
      return;
    }

    const etapa = await adicionarEtapa({ tipo, titulo, video_url, texto_resumo, perguntas, ferramenta_chave });
    await logAction({ actorId: user.id, actorEmail: user.email, actorRole: user.role, action: 'criou_etapa_tutorial', target: etapa.id });
    res.status(201).json({ ok: true, etapa });
    return;
  }

  res.status(405).json({ erro: 'Metodo nao permitido.' });
};
