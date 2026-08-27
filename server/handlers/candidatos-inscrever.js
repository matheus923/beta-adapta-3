// POST /api/candidatos/inscrever - PUBLICO (sem login).
//
// Unica rota do sistema que aceita cadastro de qualquer pessoa da internet, sem estar
// logada - por isso os cuidados extras abaixo (diferente do resto da plataforma, que
// nao tem cadastro publico nenhum):
//   - Limite de tentativas por IP (reaproveita lib/rateLimit.js, ja usado no login).
//   - Validacao de tamanho/formato dos campos, pra evitar lixo ou abuso.
//   - NAO cria conta de login nenhuma aqui - so guarda a inscricao como "candidato
//     pendente". A conta de analista so nasce depois que um admin/owner aprovar
//     manualmente (ver /api/admin/candidatos/aprovar).
const { inscreverCandidato, listarPerguntasTeste } = require('../../lib/candidates');
const { checkAndIncrement } = require('../../lib/rateLimit');
const { getClientIp } = require('../../lib/clientIp');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RESPOSTAS = 30; // limite de itens no array, mesmo sem perguntas configuradas

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ erro: 'Metodo nao permitido.' });
    return;
  }

  const ip = getClientIp(req);
  const porIp = await checkAndIncrement(`candidatura:ip:${ip}`, 5, 60 * 60); // 5 por hora por IP
  if (!porIp.permitido) {
    res.status(429).json({ erro: 'Muitas tentativas. Tente novamente mais tarde.' });
    return;
  }

  const { nome, email, telefone, respostas } = req.body || {};

  if (!nome || String(nome).trim().length < 2 || String(nome).length > 200) {
    res.status(400).json({ erro: 'Informe seu nome completo.' });
    return;
  }
  if (!email || !EMAIL_REGEX.test(String(email)) || String(email).length > 200) {
    res.status(400).json({ erro: 'Informe um e-mail valido.' });
    return;
  }
  if (telefone && String(telefone).length > 40) {
    res.status(400).json({ erro: 'Telefone invalido.' });
    return;
  }

  const perguntasAtuais = await listarPerguntasTeste();

  // Validacao do array de respostas SEMPRE roda, mesmo se ainda nao houver nenhuma
  // pergunta configurada - senao um envio malicioso poderia mandar um array gigante
  // sem nenhum limite (custo de armazenamento) logo apos o deploy, antes do owner
  // configurar as perguntas pela primeira vez.
  if (respostas !== undefined && !Array.isArray(respostas)) {
    res.status(400).json({ erro: 'Respostas do teste em formato invalido.' });
    return;
  }
  const respostasRecebidas = Array.isArray(respostas) ? respostas : [];
  if (respostasRecebidas.length > MAX_RESPOSTAS) {
    res.status(400).json({ erro: 'Numero de respostas invalido.' });
    return;
  }

  if (perguntasAtuais.length > 0) {
    for (const pergunta of perguntasAtuais) {
      const resposta = respostasRecebidas.find((r) => r.pergunta_id === pergunta.id);
      if (!resposta || !String(resposta.resposta || '').trim()) {
        res.status(400).json({ erro: `Falta responder: "${pergunta.texto}"` });
        return;
      }
      if (String(resposta.resposta).length > 5000) {
        res.status(400).json({ erro: 'Uma das respostas esta muito longa (maximo 5000 caracteres).' });
        return;
      }
    }
  }

  // So aceitamos respostas que correspondam a uma pergunta configurada no momento do
  // envio - qualquer item com pergunta_id desconhecido (ou resposta invalida) e
  // descartado, para nao ficar gravado sem validacao nenhuma.
  const respostasFormatadas = respostasRecebidas
    .map((r) => {
      const pergunta = perguntasAtuais.find((p) => p.id === r.pergunta_id);
      if (!pergunta) return null;
      const texto = String(r.resposta || '').trim();
      if (!texto || texto.length > 5000) return null;
      return { pergunta_id: r.pergunta_id, pergunta_texto: pergunta.texto, resposta: texto };
    })
    .filter(Boolean);

  try {
    const candidato = await inscreverCandidato({ nome, email, telefone, respostas: respostasFormatadas });
    res.status(201).json({ ok: true, candidato_id: candidato.id });
  } catch (err) {
    if (err.code === 'JA_INSCRITO') {
      res.status(409).json({ erro: err.message });
      return;
    }
    res.status(500).json({ erro: 'Erro ao registrar inscricao.' });
  }
};
