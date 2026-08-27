// Comparacao de segredos em tempo constante, para nao vazar informacao por timing
// (quanto tempo a comparacao demora pode, em teoria, revelar quantos caracteres bateram).
const crypto = require('crypto');

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) {
    // ainda assim gasta um tempo "normal" comparando contra si mesmo, para nao retornar
    // instantaneamente so por causa do tamanho diferente
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { safeCompare };
