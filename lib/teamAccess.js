// Helper central para aplicar a regra "um admin so mexe nos clientes da PROPRIA equipe"
// de forma consistente em todas as rotas que tocam num shop_id especifico (atribuir
// gestor, ver/criar/concluir tarefas, consultar dados da loja). O owner nunca e
// restringido por essas checagens.
const { getAssignedAnalyst } = require('./assignments');
const { getTeamByAdmin, getTeamGestorIds } = require('./teams');

// Um admin pode agir sobre um cliente se: (a) o cliente ainda nao tem gestor atribuido
// (ex: cliente novo, qualquer admin pode triar/atribuir), ou (b) o gestor atribuido faz
// parte da PROPRIA equipe do admin. Owner sempre pode. Gestor nao usa esta funcao (a
// checagem dele e feita separadamente, comparando o proprio id com o responsavel).
async function adminPodeAcessarLoja(user, shopId) {
  if (user.role === 'owner') return true;
  if (user.role !== 'admin') return false;

  const gestorId = await getAssignedAnalyst(shopId);
  if (!gestorId) return true;

  const team = await getTeamByAdmin(user.id);
  if (!team) return false;
  const idsDaEquipe = await getTeamGestorIds(team.id);
  return idsDaEquipe.includes(gestorId);
}

// Confere se um gestor especifico pertence a propria equipe do admin - usado quando o
// admin esta ATRIBUINDO esse gestor a um cliente (nao pode atribuir gestor de outra equipe).
async function gestorPertenceAEquipeDoAdmin(adminUserId, gestorId) {
  const team = await getTeamByAdmin(adminUserId);
  if (!team) return false;
  const idsDaEquipe = await getTeamGestorIds(team.id);
  return idsDaEquipe.includes(gestorId);
}

module.exports = { adminPodeAcessarLoja, gestorPertenceAEquipeDoAdmin };
