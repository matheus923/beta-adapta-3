// POST /api/admin/create-user { email, password, name, role }
// Somente o administrador consegue criar contas. Nao existe cadastro publico/independente
// nesta plataforma - toda conta (inclusive de outros administradores) nasce aqui.
// A conta ja sai pronta para uso (verificada), com o e-mail e a senha que voce definir -
// combine essas credenciais com a pessoa por um canal seguro (nao e enviado por e-mail
// automaticamente, para nao trafegar senha em texto puro por e-mail).
const { requireUser } = require('../../lib/session');
const { createUserWithRole } = require('../../lib/userStore');
const { logAction } = require('../../lib/auditLog');

const PAPEIS_VALIDOS = ['admin', 'analyst'];

module.exports = async (req, res) => {
  const actor = await requireUser(req, res, { adminOnly: true });
  if (!actor) return;

  if (req.method !== 'POST') {
    res.status(405).json({ erro: 'Metodo nao permitido' });
    return;
  }

  const { email, password, name, role } = req.body || {};

  if (!email || !password || !role) {
    res.status(400).json({ erro: 'Informe email, password e role.' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
    return;
  }
  if (!PAPEIS_VALIDOS.includes(role)) {
    res.status(400).json({ erro: `Papel invalido. Use um destes: ${PAPEIS_VALIDOS.join(', ')}` });
    return;
  }
  // so o owner pode criar outra conta admin - um admin comum so pode criar gestores
  if (role === 'admin' && actor.role !== 'owner') {
    res.status(403).json({ erro: 'So o owner pode criar contas de administrador.' });
    return;
  }

  try {
    const user = await createUserWithRole({ email, password, name, role, verified: true });

    await logAction({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'user_created',
      target: user.email,
      metadata: { role: user.role },
    });

    res.status(201).json({
      ok: true,
      mensagem: 'Conta criada. Combine o e-mail e a senha com a pessoa por um canal seguro.',
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    if (err.code === 'EMAIL_EXISTS') {
      res.status(409).json({ erro: 'Ja existe uma conta com esse e-mail.' });
      return;
    }
    if (err.code === 'SENHA_FRACA') {
      res.status(400).json({ erro: err.message });
      return;
    }
    res.status(500).json({ erro: 'Falha ao criar conta', detalhe: String(err.message || err) });
  }
};
