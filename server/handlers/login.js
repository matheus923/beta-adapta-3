// POST /api/login { email, password }
// Confere a senha do usuario (voce ou um gestor) e cria o cookie de sessao.
const bcrypt = require('bcryptjs');
const { getUserByEmail, verifyPassword } = require('../../lib/userStore');
const { createSessionCookie } = require('../../lib/session');
const { checkAndIncrement } = require('../../lib/rateLimit');
const { getClientIp } = require('../../lib/clientIp');

// Hash "de mentira" usado quando o e-mail nao existe, so para o bcrypt.compare gastar
// um tempo parecido com o caso real - assim ninguem descobre se um e-mail existe ou
// nao so cronometrando a resposta.
const HASH_FALSO = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8pM.CyPCcMxKvxTfnMSFwl6PPPSVEO';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ erro: 'Metodo nao permitido' });
    return;
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ erro: 'Informe e-mail e senha.' });
    return;
  }

  // Limite de tentativas: por e-mail (evita forca-bruta numa conta) e por IP (evita
  // um unico atacante testar varios e-mails). 10 tentativas a cada 15 minutos.
  const emailNormalizado = String(email).toLowerCase().trim();
  const ip = getClientIp(req);
  const porEmail = await checkAndIncrement(`login:email:${emailNormalizado}`, 10, 15 * 60);
  const porIp = await checkAndIncrement(`login:ip:${ip}`, 20, 15 * 60);

  if (!porEmail.permitido || !porIp.permitido) {
    res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
    return;
  }

  const user = await getUserByEmail(emailNormalizado);
  // mensagem generica de proposito, para nao revelar se o e-mail existe ou nao
  const credenciaisInvalidas = () => res.status(401).json({ erro: 'E-mail ou senha invalidos.' });

  if (!user) {
    // ainda assim faz uma comparacao bcrypt, so para o tempo de resposta ficar parecido
    // com o caso de e-mail existente + senha errada
    await bcrypt.compare(password, HASH_FALSO);
    credenciaisInvalidas();
    return;
  }

  const senhaOk = await verifyPassword(user, password);
  if (!senhaOk) {
    credenciaisInvalidas();
    return;
  }

  if (!user.verified) {
    res.status(403).json({ erro: 'Conta ainda nao habilitada. Fale com o administrador.' });
    return;
  }

  res.setHeader('Set-Cookie', createSessionCookie(user.id));
  res.status(200).json({ ok: true, role: user.role, name: user.name, email: user.email });
};
