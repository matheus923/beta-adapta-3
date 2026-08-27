// Compara a "foto" de hoje com a de ontem (precos de anuncio + meta de ROAS das
// campanhas) e devolve uma lista do que mudou. Como a checagem roda 1x/dia (limite do
// plano Hobby da Vercel - ver README), isso NAO pega o segundo exato em que a mudanca
// aconteceu: pega "mudou entre a checagem de ontem e a de hoje", o que na pratica
// significa "detectado no dia de hoje".
function chaveVariacao(linha) {
  return `${linha.item_id}:${linha.model_id}`;
}

function analyzeChanges({ ontemPrecos = [], hojePrecos = [], ontemCampanhas = [], hojeCampanhas = [] } = {}) {
  const mudancas = [];

  const precosOntem = new Map(ontemPrecos.map((p) => [chaveVariacao(p), p]));
  for (const hoje of hojePrecos) {
    const ontem = precosOntem.get(chaveVariacao(hoje));
    if (
      ontem &&
      typeof ontem.preco_atual === 'number' &&
      typeof hoje.preco_atual === 'number' &&
      ontem.preco_atual !== hoje.preco_atual
    ) {
      mudancas.push({
        tipo: 'preco_anuncio',
        item_id: hoje.item_id,
        rotulo: `${hoje.item_name}${hoje.model_name ? ` (${hoje.model_name})` : ''}`,
        valor_antes: ontem.preco_atual,
        valor_depois: hoje.preco_atual,
      });
    }
  }

  const campanhasOntem = new Map(ontemCampanhas.map((c) => [c.campaign_id, c]));
  for (const hoje of hojeCampanhas) {
    const ontem = campanhasOntem.get(hoje.campaign_id);
    if (
      ontem &&
      typeof ontem.meta_roas === 'number' &&
      typeof hoje.meta_roas === 'number' &&
      ontem.meta_roas !== hoje.meta_roas
    ) {
      mudancas.push({
        tipo: 'meta_roas',
        item_id: hoje.campaign_id,
        rotulo: hoje.campaign_name,
        valor_antes: ontem.meta_roas,
        valor_depois: hoje.meta_roas,
      });
    }
  }

  return mudancas;
}

module.exports = { analyzeChanges };
