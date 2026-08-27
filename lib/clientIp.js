// Descobre o IP real do visitante de forma confiavel, mesmo atras do proxy da Vercel.
//
// Cuidado: "X-Forwarded-For" pode conter varios IPs separados por virgula, e o
// PRIMEIRO da lista pode ser enviado pelo proprio visitante (nao e confiavel) - so a
// Vercel decide o valor mais a direita, que e o real. Por isso NUNCA usamos
// `.split(',')[0]` (o mais a esquerda) para decidir o limite de tentativas, senao
// bastaria mandar um cabecalho falso a cada requisicao pra "resetar" o limite.
//
// A Vercel tambem envia "X-Real-Ip" com o IP do visitante direto (sem precisar separar
// nada), entao usamos ele como primeira opcao quando disponivel.
function getClientIp(req) {
  const realIp = req.headers['x-real-ip'];
  if (realIp) return String(realIp).trim();

  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const partes = String(forwarded).split(',').map((p) => p.trim()).filter(Boolean);
    if (partes.length > 0) return partes[partes.length - 1]; // o mais a direita = o que a Vercel adicionou
  }

  return req.socket?.remoteAddress || 'desconhecido';
}

module.exports = { getClientIp };
