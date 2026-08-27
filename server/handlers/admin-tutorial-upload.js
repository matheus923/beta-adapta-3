// POST /api/admin/tutorial/upload - autoriza e finaliza o upload de um video direto do
// navegador para o Vercel Blob Storage (ver lib/videoBlob.js para o motivo desse
// desenho). A checagem de "e admin/owner logado" acontece dentro de tratarUploadVideo,
// so na primeira das duas chamadas que esse endpoint recebe.
const { requireUser } = require('../../lib/session');
const { tratarUploadVideo } = require('../../lib/videoBlob');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ erro: 'Metodo nao permitido.' });
    return;
  }
  try {
    await tratarUploadVideo(req, res, { requireUser });
  } catch (err) {
    res.status(400).json({ erro: err.message || 'Erro ao processar upload.' });
  }
};
