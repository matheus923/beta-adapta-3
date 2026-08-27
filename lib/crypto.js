// Criptografia dos tokens da Shopee antes de guardar no Redis (AES-256-GCM).
// Gere uma chave com: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// e coloque em ENCRYPTION_KEY nas variaveis de ambiente da Vercel.
const crypto = require('crypto');

function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY nao configurada nas variaveis de ambiente.');
  return Buffer.from(key, 'base64');
}

function encrypt(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // guarda tudo junto, separado por ":", em base64
  return [iv, authTag, encrypted].map((b) => b.toString('base64')).join(':');
}

function decrypt(payload) {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
