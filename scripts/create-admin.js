// Script para criar a SUA conta (o "owner", dono da plataforma) - rode isso no seu
// computador, nunca exponha essa criacao como uma rota da web (e por isso que ela nao
// existe no site).
//
// Papeis existentes na plataforma:
//   - owner   : voce. So existe UMA conta owner, criada por este script. E o unico papel
//               que ve o log de auditoria de TODO MUNDO (admins e gestores).
//   - admin   : criado por voce (ou por outro admin) pela tela. Ve o log de auditoria
//               so das acoes dos gestores, nao das de outros admins/do owner.
//   - analyst : os "gestores" da equipe, cada um ve so os clientes atribuidos a ele.
//
// Como usar:
//   1. cd shopee-app
//   2. npm install
//   3. Exporte as mesmas variaveis UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN
//      que voce colocou na Vercel (copie da Vercel -> Settings -> Environment Variables).
//      No Mac/Linux: export UPSTASH_REDIS_REST_URL="..." && export UPSTASH_REDIS_REST_TOKEN="..."
//      No Windows (PowerShell): $env:UPSTASH_REDIS_REST_URL="..."; $env:UPSTASH_REDIS_REST_TOKEN="..."
//   4. node scripts/create-admin.js "seu@email.com" "sua-senha-forte" "Seu Nome"
//
// A conta ja e criada como owner E ja verificada (nao precisa clicar em link de e-mail)
// - afinal, e voce mesmo rodando isso, com acesso direto ao banco.
const { createUserWithRole } = require('../lib/userStore');

async function main() {
  const [, , email, password, name] = process.argv;

  if (!email || !password) {
    console.error('Uso: node scripts/create-admin.js <email> <senha> [nome]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('A senha precisa ter pelo menos 8 caracteres.');
    process.exit(1);
  }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error('Configure UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN no seu terminal antes de rodar.');
    process.exit(1);
  }

  try {
    const user = await createUserWithRole({ email, password, name, role: 'owner', verified: true });
    console.log(`Conta owner criada com sucesso: ${user.email} (id: ${user.id})`);
    console.log('Ja pode fazer login na plataforma normalmente.');
  } catch (err) {
    if (err.code === 'EMAIL_EXISTS') {
      console.error('Ja existe uma conta cadastrada com esse e-mail.');
    } else if (err.code === 'SENHA_FRACA') {
      console.error(err.message);
    } else {
      console.error('Erro ao criar administrador:', err.message || err);
    }
    process.exit(1);
  }
}

main();
