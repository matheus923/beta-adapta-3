// GET /api/rotina - devolve a checklist da rotina semanal do proprio analista logado
//   (segunda a sexta, conforme secao 9 do Manual do Gestor).
// POST /api/rotina { dia } - marca um item como feito AGORA (timestamp real). "dia" e um
//   de: segunda, terca, quarta, quinta, sexta. Se marcado num dia da semana diferente do
//   item, fica registrado como "atraso" (ex: marcar "quarta" numa quinta-feira).
const { requireUser } = require('../../lib/session');
const { getAdesaoResumo, marcarItem, isoWeekString, DIAS } = require('../../lib/routineChecklist');
const { logAction } = require('../../lib/auditLog');

const DIA_INDEX_HOJE = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

module.exports = async (req, res) => {
  const user = await requireUser(req, res, { roles: ['analyst'] });
  if (!user) return;

  const semanaIso = isoWeekString(new Date());

  if (req.method === 'POST') {
    const { dia } = req.body || {};
    if (!DIAS.includes(dia)) {
      res.status(400).json({ erro: `Informe "dia" como um de: ${DIAS.join(', ')}` });
      return;
    }
    const hojeIndex = new Date().getUTCDay();
    const atraso = DIA_INDEX_HOJE[hojeIndex] !== dia;

    const atualizado = await marcarItem(user.id, semanaIso, dia, { atraso });
    await logAction({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'rotina_marcada',
      target: dia,
      metadata: { semana: semanaIso, atraso },
    });
    res.status(200).json({ ok: true, semana: semanaIso, rotina: atualizado });
    return;
  }

  const resumo = await getAdesaoResumo(user.id, semanaIso);
  res.status(200).json({ semana: semanaIso, ...resumo });
};
