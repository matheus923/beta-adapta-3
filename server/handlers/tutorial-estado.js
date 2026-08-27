// GET /api/tutorial/estado - o proprio analista logado consultando em que etapa do
// tutorial ele esta (video, texto-resumo, perguntas a responder), ou null se ja
// concluiu tudo. Qualquer papel pode chamar (admin/owner sempre voltam "concluido",
// ja que o tutorial e so para analista).
const { requireUser } = require('../../lib/session');
const { getEstadoParaAnalista } = require('../../lib/tutorial');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ erro: 'Metodo nao permitido.' });
    return;
  }
  const user = await requireUser(req, res);
  if (!user) return;

  if (user.role !== 'analyst') {
    res.status(200).json({ concluido: true, etapa: null, total_etapas: 0 });
    return;
  }

  const estado = await getEstadoParaAnalista(user.id);
  res.status(200).json({
    concluido: estado.progresso.concluido,
    etapa_atual_indice: estado.progresso.etapa_atual_indice,
    total_etapas: estado.total_etapas,
    ferramentas_liberadas: estado.progresso.ferramentas_liberadas,
    etapa: estado.etapa
      ? {
          id: estado.etapa.id,
          tipo: estado.etapa.tipo,
          titulo: estado.etapa.titulo,
          video_url: estado.etapa.video_url,
          texto_resumo: estado.etapa.texto_resumo,
          perguntas: estado.etapa.perguntas,
        }
      : null,
  });
};
