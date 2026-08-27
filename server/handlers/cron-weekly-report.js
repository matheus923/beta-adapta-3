// Cron semanal (toda segunda-feira de manha) que envia para o GESTOR de cada equipe um
// resumo de tudo que foi detectado na semana: mudancas de preco de anuncio e de meta de
// ROAS, separadas por analista da equipe dele, com a data em que cada uma foi detectada
// (ver lib/marketplaceChanges.js e cron-metrics-daily-check.js sobre como isso e coletado).
const { safeCompare } = require('../../lib/safeCompare');
const { listTeams, getTeamGestorIds } = require('../../lib/teams');
const { getUserById } = require('../../lib/userStore');
const { listChangesSince } = require('../../lib/marketplaceChanges');
const { sendWeeklyChangesReportEmail } = require('../../lib/mailer');
const { brazilDateString } = require('../../lib/timezone');

const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET) {
    res.status(500).json({ erro: 'CRON_SECRET nao configurado' });
    return;
  }
  const auth = req.headers['authorization'] || '';
  if (!safeCompare(auth, `Bearer ${process.env.CRON_SECRET}`)) {
    res.status(401).json({ erro: 'Nao autorizado' });
    return;
  }

  const sinceTs = Date.now() - SETE_DIAS_MS;
  const periodoInicio = brazilDateString(-7);
  const periodoFim = brazilDateString(0);

  const teams = await listTeams();
  const resultados = [];

  for (const team of teams) {
    try {
      const gestor = await getUserById(team.admin_id);
      if (!gestor || !gestor.email) {
        resultados.push({ team_id: team.id, erro: 'equipe sem gestor com e-mail valido' });
        continue;
      }

      const analystIds = await getTeamGestorIds(team.id);
      if (analystIds.length === 0) {
        resultados.push({ team_id: team.id, gestor_avisado: false, motivo: 'equipe sem analistas' });
        continue;
      }

      const mudancas = await listChangesSince({ sinceTs, analystIds });

      // Agrupa por nome do analista (para o e-mail ficar organizado por pessoa).
      const analistasPorId = {};
      for (const id of analystIds) {
        const a = await getUserById(id);
        if (a) analistasPorId[id] = a.name || a.email;
      }
      const mudancasPorAnalista = {};
      for (const m of mudancas) {
        const nome = analistasPorId[m.analystId] || 'Analista desconhecido';
        if (!mudancasPorAnalista[nome]) mudancasPorAnalista[nome] = [];
        mudancasPorAnalista[nome].push(m);
      }

      await sendWeeklyChangesReportEmail(gestor.email, team.name, mudancasPorAnalista, periodoInicio, periodoFim);
      resultados.push({ team_id: team.id, gestor_avisado: true, total_mudancas: mudancas.length });
    } catch (err) {
      resultados.push({ team_id: team.id, erro: String(err) });
    }
  }

  res.status(200).json({ ok: true, equipes: resultados.length, resultados });
};
