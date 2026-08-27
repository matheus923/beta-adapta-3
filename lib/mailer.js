// Envio de e-mails transacionais via Resend (https://resend.com).
// Configure RESEND_API_KEY, RESEND_FROM_EMAIL (ex: "Adaptaecom <relatorios@seudominio.com>")
// e APP_BASE_URL (ex: https://seu-app.vercel.app) nas variaveis de ambiente.
async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY nao configurada nas variaveis de ambiente.');
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to, subject, html }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Falha ao enviar e-mail: ${JSON.stringify(data)}`);
  }
  return data;
}

// Reservado para a Fase 3 (notificacao diaria) - ainda nao chamado por nenhuma rota.
async function sendDailyReportNotification(to, clientNames) {
  return sendEmail({
    to,
    subject: 'Seus relatorios de hoje ja estao disponiveis',
    html: `
      <p>Os relatorios de hoje das contas ${clientNames.join(', ')} ja estao disponiveis na plataforma.</p>
      <p><a href="${process.env.APP_BASE_URL}">Acessar plataforma</a></p>
    `,
  });
}

function listaProblemasHtml(problemas) {
  return `<ul>${problemas.map((p) => `<li>${p.detalhe}</li>`).join('')}</ul>`;
}

// Enviado as 20h para o GESTOR responsavel, quando a analise da oferta relampago de
// amanha encontra algum problema (anuncio faltando, estoque baixo ou preco descrepante).
async function sendFlashSaleAlertEmail(to, clientName, problemas, dataOferta) {
  return sendEmail({
    to,
    subject: `Atencao: oferta relampago de amanha (${dataOferta}) com pendencias - ${clientName}`,
    html: `
      <p>A analise automatica das 20h encontrou possiveis problemas na oferta relampago de
      <strong>${clientName}</strong> programada para <strong>${dataOferta}</strong>:</p>
      ${listaProblemasHtml(problemas)}
      <p>Por favor, corrija ate as 22h. Caso contrario, os administradores serao avisados
      automaticamente.</p>
      <p><a href="${process.env.APP_BASE_URL}">Acessar plataforma</a></p>
    `,
  });
}

// Enviado as 22h para ADMINS + OWNER quando o problema apontado as 20h ainda persiste
// (o gestor nao corrigiu a tempo).
async function sendFlashSaleEscalationEmail(toList, clientName, gestorEmail, problemas, dataOferta) {
  return sendEmail({
    to: toList,
    subject: `Escalonamento: oferta relampago de amanha (${dataOferta}) ainda com pendencias - ${clientName}`,
    html: `
      <p>O gestor <strong>${gestorEmail || 'sem gestor atribuido'}</strong> foi avisado as 20h
      sobre problemas na oferta relampago de <strong>${clientName}</strong> programada para
      <strong>${dataOferta}</strong>, e a nova checagem das 22h ainda encontrou:</p>
      ${listaProblemasHtml(problemas)}
      <p>Uma tarefa foi criada/atualizada na plataforma para acompanhamento.</p>
      <p><a href="${process.env.APP_BASE_URL}">Acessar plataforma</a></p>
    `,
  });
}

// Enviado quando um candidato do processo seletivo e aprovado - manda o e-mail e a
// senha aleatoria gerada para ele conseguir logar e comecar o tutorial. Se o Resend
// nao estiver configurado, quem aprovou ve a senha na propria tela e repassa manualmente.
async function sendCandidatoAprovadoEmail(to, nome, senhaGerada) {
  return sendEmail({
    to,
    subject: 'Bem-vindo(a) a Adaptaecom - seu acesso ja esta pronto',
    html: `
      <p>Ola${nome ? `, ${nome}` : ''}!</p>
      <p>Voce foi aprovado(a) no nosso processo seletivo. Seu acesso a plataforma ja
      esta criado:</p>
      <p><strong>E-mail:</strong> ${to}<br/>
      <strong>Senha:</strong> ${senhaGerada}</p>
      <p>Ao entrar pela primeira vez, voce vai passar por um cursinho rapido antes de
      liberar as ferramentas do sistema.</p>
      <p><a href="${process.env.APP_BASE_URL}">Acessar plataforma</a></p>
    `,
  });
}

// Enviado ao ADMIN coordenador da equipe quando o owner aprova um candidato e ja
// destina ele aquela equipe - avisa quem esta chegando e anexa as respostas do teste de
// aptidao que o candidato fez, para o admin ja conhecer o perfil da pessoa.
async function sendNovoAnalistaParaEquipeEmail(adminEmail, analistaNome, teamName, respostasAptidao) {
  const respostasHtml = (respostasAptidao || [])
    .map((r) => `<li><strong>${r.pergunta_texto}</strong><br/>${r.resposta}</li>`)
    .join('');
  return sendEmail({
    to: adminEmail,
    subject: `Novo analista na sua equipe (${teamName}): ${analistaNome}`,
    html: `
      <p><strong>${analistaNome}</strong> foi aprovado(a) e adicionado(a) a sua equipe
      <strong>${teamName}</strong>.</p>
      <p>Ele(a) vai passar por um cursinho de boas-vindas antes de comecar a usar o
      sistema - as respostas desse cursinho tambem vao aparecer para voce ao longo do
      processo.</p>
      <p>Respostas do teste de aptidao que ele(a) fez no processo seletivo:</p>
      <ul>${respostasHtml || '<li>Nenhuma resposta registrada.</li>'}</ul>
      <p><a href="${process.env.APP_BASE_URL}">Acessar plataforma</a></p>
    `,
  });
}

// Enviado toda semana ao GESTOR de cada equipe, com todas as mudancas de preco de
// anuncio / meta de ROAS detectadas na semana, separadas por analista e com a data em
// que cada uma foi detectada.
function listaMudancasHtml(mudancas) {
  return `<ul>${mudancas
    .map((m) => {
      const rotuloTipo = m.tipo === 'meta_roas' ? 'Meta de ROAS' : 'Preco do anuncio';
      const data = new Date(m.detectadoEm).toLocaleString('pt-BR');
      return `<li><strong>${m.clientName}</strong> — ${rotuloTipo} de "${m.rotulo}": ${m.valorAntes} → ${m.valorDepois} (detectado em ${data})</li>`;
    })
    .join('')}</ul>`;
}

async function sendWeeklyChangesReportEmail(gestorEmail, teamName, mudancasPorAnalista, periodoInicio, periodoFim) {
  const analistas = Object.keys(mudancasPorAnalista);
  const corpo = analistas.length === 0
    ? '<p>Nenhuma mudanca de preco de anuncio ou meta de ROAS foi detectada nesta semana.</p>'
    : analistas
        .map((nomeAnalista) => `
          <h3>${nomeAnalista}</h3>
          ${listaMudancasHtml(mudancasPorAnalista[nomeAnalista])}
        `)
        .join('');

  return sendEmail({
    to: gestorEmail,
    subject: `Relatorio semanal da equipe ${teamName} (${periodoInicio} a ${periodoFim})`,
    html: `
      <p>Resumo das mudancas de preco de anuncio e meta de ROAS detectadas pela checagem
      automatica diaria, de ${periodoInicio} a ${periodoFim}, por analista da equipe
      <strong>${teamName}</strong>:</p>
      ${corpo}
      <p style="color:#888; font-size:12px;">Importante: essas mudancas sao detectadas
      comparando o valor de um dia com o do dia anterior - a data mostrada e o dia em que
      a diferenca foi detectada, nao necessariamente o segundo exato em que o analista
      fez a alteracao no painel do marketplace.</p>
      <p><a href="${process.env.APP_BASE_URL}">Acessar plataforma</a></p>
    `,
  });
}

module.exports = {
  sendEmail,
  sendDailyReportNotification,
  sendFlashSaleAlertEmail,
  sendFlashSaleEscalationEmail,
  sendCandidatoAprovadoEmail,
  sendNovoAnalistaParaEquipeEmail,
  sendWeeklyChangesReportEmail,
};
