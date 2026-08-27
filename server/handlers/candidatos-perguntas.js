// GET /api/candidatos/perguntas - PUBLICO (sem login).
// Devolve as perguntas atuais do teste de aptidao, para a tela publica de inscricao
// montar o formulario. Nao expoe nada sensivel - so o texto das perguntas.
const { listarPerguntasTeste } = require('../../lib/candidates');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ erro: 'Metodo nao permitido.' });
    return;
  }
  const perguntas = await listarPerguntasTeste();
  res.status(200).json({ perguntas });
};
