// O Brasil nao usa mais horario de verao desde 2019, entao America/Sao_Paulo e sempre
// UTC-3 fixo. Isso permite calcular datas/horarios de Brasilia so somando/subtraindo 3
// horas do relogio do servidor (Vercel roda em UTC) - sem precisar de biblioteca de fuso.
const OFFSET_HOURS = -3;

// Retorna um Date cujos campos UTC (getUTCFullYear, getUTCDate, etc) representam o
// horario local de Brasilia "fingindo" ser UTC - util para pegar so a data (YYYY-MM-DD).
function brazilNow() {
  return new Date(Date.now() + OFFSET_HOURS * 60 * 60 * 1000);
}

// "YYYY-MM-DD" do dia atual em horario de Brasilia. offsetDias=1 -> dia de amanha.
function brazilDateString(offsetDias = 0) {
  const d = brazilNow();
  d.setUTCDate(d.getUTCDate() + offsetDias);
  return d.toISOString().slice(0, 10);
}

// Timestamps unix (segundos, UTC real) do inicio e fim de um dia de Brasilia, dado
// "YYYY-MM-DD". Ex: dayWindowUnix("2026-08-10") -> {start, end} cobrindo 00:00 a 23:59:59
// no horario de Brasilia daquele dia.
function dayWindowUnix(dateStr) {
  const start = Math.floor(new Date(`${dateStr}T00:00:00-03:00`).getTime() / 1000);
  const end = start + 24 * 60 * 60;
  return { start, end };
}

module.exports = { brazilNow, brazilDateString, dayWindowUnix };
