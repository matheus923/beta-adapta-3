# App parceiro Shopee - Adaptaecom

Este projeto e um app minimo que permite a Adaptaecom se conectar (via Shopee Open Platform)
as lojas dos clientes, com autorizacao explicita de cada um, para depois alimentar os
relatorios diarios do Manual do Gestor.

Ele NAO libera "todos os dados de todas as lojas" de uma vez - a Shopee nao funciona assim.
Cada loja de cliente precisa autorizar individualmente, e o app so acessa os escopos
(categorias de dados) que forem aprovados no cadastro de parceiro.

## Terminologia da plataforma (nomes exibidos na tela)

A tela e a documentacao usam estes nomes para os tres niveis de acesso:

- **Líder**: dono da operacao, conta unica (era chamado de "owner" nas primeiras versoes).
- **Gestor**: responsavel por uma equipe - coordena os analistas dela (era chamado de
  "admin"/"administrador" nas primeiras versoes).
- **Analista**: responsavel pelas contas de clientes atribuidas a ele (era chamado de
  "gestor" nas primeiras versoes - o nome mudou para nao confundir com o Gestor de
  equipe acima).

Importante: por baixo do capo, o codigo e as rotas de API continuam usando os nomes
originais em ingles (`owner`, `admin`, `analyst`) - so o que aparece NA TELA e nesta
documentacao foi atualizado para os nomes acima. Isso significa que nomes de rota como
`/api/owner/candidatos` ou `/api/admin/users` continuam com esses nomes tecnicos mesmo
falando do Líder/Gestor, respectivamente - nao ha necessidade de decorar isso no dia a
dia, e so para quem for mexer no codigo.

## Fase 4: os 6 relatorios do Manual do Gestor (analista, gestor e lider), cada um na sua tela

Pedido: cada papel (analista, gestor, líder) ver, dentro do proprio painel, o relatorio que
o Manual do Gestor da Adaptaecom pede para aquele papel - com diagnostico automatico
(modo da conta: Escala/Otimizacao/Atencao/Protecao) e recomendacoes que ja viram tarefa de
verdade para o analista responsavel. Cadencia implementada:

- **Analista**: relatorio **diario** e **semanal** sobre as proprias contas.
- **Gestor**: relatorio **diario** e **semanal** sobre os clientes da equipe, e relatorio
  **semanal** sobre a propria equipe (o que cada analista fez, tarefas concluidas,
  aderencia a rotina).
- **Líder (owner)**: relatorio **mensal**, para auditar os gestores e alinhar as
  expectativas dos lideres com as equipes (ranking das equipes, faturamento, contas em
  atencao/protecao, escalonamentos abertos ha mais de 7 dias).

Aparecem no card **"Relatórios"**, que fica logo abaixo de "Minhas tarefas"/"Tarefas de
todos os clientes" no painel de cada papel, com abas para trocar entre diario/semanal (ou
so a auditoria mensal, no caso do líder).

**Limitacao real, importante entender antes de usar isso**: o app hoje so tem integracao
de verdade com a Shopee para autenticacao, preco de anuncio e meta de ROAS
(`lib/shopeeMetrics.js`, usado na Fase 3). Faturamento consolidado, ACOS real
(gasto/faturamento), conversao (visitas -> venda) e cobertura de estoque em dias - os
numeros que o Manual do Gestor usa para diagnosticar uma conta - exigiriam integrar mais
chamadas da API da Shopee (pedidos agregados por periodo, gasto de ads, saldo de estoque
por SKU) que ainda nao foram implementadas.

**Como isso foi resolvido aqui, para o beta poder ser testado de ponta a ponta hoje**:
`lib/raioX.js` guarda um "raio-x" diario por loja (faturamento, ROAS, ACOS, conversao,
margem, estoque em dias, produto critico, curva ABC) que pode vir de duas formas, as duas
gravando no mesmo lugar e alimentando os mesmos relatorios reais:

1. Preenchido a mao pelo gestor/analista responsavel pela loja (endpoint
   `/api/raiox-entry` - a tela ainda nao tem um formulario proprio para isso, so a API;
   por enquanto o jeito mais rapido de ter dados de teste e o script abaixo).
2. Rodando `node scripts/seed-raiox-demo.js` (mesmo esquema de variaveis de ambiente do
   `scripts/create-admin.js`) - preenche 7 dias de raio-x de demonstracao para todas as
   lojas ja autorizadas e marca a rotina semanal de cada analista, so para o beta ter o
   que mostrar nos 6 relatorios sem esperar a integracao real.

No futuro, quando a agregacao real da Shopee existir, so precisa trocar QUEM escreve em
`lib/raioX.js` (um cron, em vez de preenchimento manual) - a leitura dos relatorios nao
muda.

**O que e 100% real, sem nenhuma limitacao acima**:
- `lib/manualGestor.js` - motor de regras deterministico que aplica os limites do Manual
  do Gestor (ACOS 3%/5%/8%, margem ideal ~30%, conversao referencia 10%, estoque
  minimo 10 dias/ideal 15 dias, ROAS sustentado 7+ dias, margem minima de escala 20%) e
  classifica a conta + gera recomendacoes. E a "IA" mencionada nos relatorios - hoje e um
  motor de regras (nao uma chamada a um modelo de linguagem), mas roda de verdade a cada
  relatorio e pode ser trocado por uma chamada real no futuro sem mudar a interface deste
  modulo.
- `lib/reportEngine.js` - ao montar qualquer um dos 6 relatorios, roda o motor de regras e
  **cria tarefas de verdade** (reaproveitando `lib/tasks.js`, idempotente por
  `issue_key` - rodar o relatorio de novo no mesmo dia nao duplica a tarefa).
- `lib/routineChecklist.js` - o proprio analista marca, na tela, cada item da rotina
  semanal do Manual do Gestor (segunda a sexta) como feito, com timestamp real. Isso e o
  que alimenta "aderencia a rotina" no relatorio do gestor e no mensal do líder - nao e um
  numero inventado.
- As mudancas de preco/ROAS (Fase 3) e as tarefas/escalonamentos (`lib/tasks.js`) usados
  nos relatorios ja eram dados reais do sistema.

**Rotas novas**: `GET /api/reports/analista?period=diario|semanal` (analista),
`GET /api/reports/gestor-clientes?period=diario|semanal` e
`GET /api/reports/gestor-equipe` (gestor/líder, líder pode passar `?admin_id=` para ver
a equipe de um gestor especifico), `GET /api/reports/lider` (só líder),
`GET/POST /api/rotina` (analista marca a rotina), `GET/POST /api/raiox-entry`
(preenche/consulta o raio-x manual de uma loja).

## Fase 3: mudancas de preco/ROAS detectadas automaticamente + relatorio semanal do gestor

Pedido: o gestor de cada equipe receber, toda semana, tudo que os analistas dela fizeram
de importante nos anuncios dos clientes (ex: mudar a meta de ROAS de uma campanha, mudar
o preco de um anuncio), com a data em que cada mudanca aconteceu.

**Limitacao real, importante entender antes de usar isso**: pesquisei nas APIs da
Shopee, Mercado Livre e TikTok Shop, e nenhuma delas expoe um "historico de quem mudou o
que e quando" para acoes feitas direto no painel do proprio marketplace (o analista
mexendo direto no Seller Center/Ads Manager, fora da nossa plataforma). Essas APIs so
mostram o valor ATUAL (preco de hoje, meta de ROAS de hoje) - sem registro de quem
alterou nem do segundo exato em que isso aconteceu. Isso vale para as tres plataformas
(nao e uma limitacao so da Shopee).

**Como isso foi resolvido aqui**: o sistema tira uma "foto" do preco de cada anuncio e da
meta de ROAS de cada campanha de cada loja **uma vez por dia** (limite do plano Hobby da
Vercel: 1 cron job por dia, ver secao acima) e compara com a foto do dia anterior. Toda
diferenca encontrada e registrada como "mudanca detectada", atribuida ao analista
responsavel por aquela loja no momento (`lib/assignments.js`), com a DATA em que a
diferenca foi percebida (comparando ontem com hoje). **Isso significa que a data
registrada e o dia em que a mudanca foi detectada, nao necessariamente o segundo exato em
que o analista mexeu no painel do marketplace** - a granularidade e diaria, nao por
minuto/segundo, porque essa e a frequencia maxima permitida pelo Cron do plano gratuito.
Se no futuro isso precisar ser mais preciso, as opcoes seriam: (a) migrar para o plano
Pro da Vercel e rodar essa checagem varias vezes ao dia (reduz a janela, mas nunca chega
no segundo exato, porque a limitacao e da API do marketplace, nao da Vercel); ou (b)
pedir para o analista fazer essas mudancas dentro da nossa propria plataforma em vez de
direto no marketplace (isso sim registraria o segundo exato e quem fez, mas exige
construir uma tela de edicao de preco/ROAS aqui dentro).

**O que foi construido**:
- `lib/shopeeMetrics.js` - busca o preco atual de cada anuncio (Product API) e a meta de
  ROAS de cada campanha ativa (Shopee Ads API) de uma loja. **Mesmo aviso do
  `lib/shopeeFlashSale.js`**: os nomes exatos dos endpoints (principalmente da API de
  Ads, que costuma exigir aprovacao de escopo separada da API basica) nao puderam ser
  confirmados ao vivo - confirme na documentacao oficial assim que o acesso de parceiro
  estiver liberado (pontos marcados "CONFIRMAR" no arquivo).
- `/api/cron/metrics-daily-check` (1x/dia) - tira a foto do dia, compara com a de ontem e
  registra as mudancas encontradas.
- `/api/cron/weekly-report` (toda segunda-feira as 11h de Brasilia) - manda um e-mail
  para o gestor de cada equipe com as mudancas da semana, separadas por analista.
- Card **"Mudanças de preço/ROAS detectadas"** no painel do gestor/líder - mostra os
  ultimos 30 dias a qualquer momento, sem esperar o e-mail de segunda-feira (o gestor so
  ve analistas da propria equipe; o líder ve de todas).
- Hoje isso so funciona para lojas **Shopee** (unico marketplace com integracao de
  verdade no projeto ate agora) - Mercado Livre e TikTok Shop ainda nao tem nenhuma
  integracao de API construida aqui, entao o mesmo recurso precisaria ser refeito para
  cada um deles quando essas integracoes existirem.

## Fase 2: processo seletivo + tutorial obrigatorio do analista novo

Adicionado nesta fase, sem mexer no que ja funcionava:

- **Teste de aptidao** (`public/candidato.html`): unica tela do sistema sem login -
  pensada para ser aberta num tablet da propria Adaptaecom durante uma prova presencial,
  nao para ser divulgada como link publico na internet. O candidato preenche
  nome/e-mail/telefone e responde as perguntas configuradas por voce (card "Perguntas do
  teste de aptidao"). Fica registrado como "candidato pendente", sem nenhuma conta criada.
- **So o LÍDER avalia e aprova/rejeita candidatos, e so ele edita as perguntas do
  teste** (card "Candidatos (processo seletivo)") - nao e uma decisao do gestor de
  equipe. Ao aprovar, o líder ja escolhe a equipe do candidato na mesma acao: o sistema
  cria a conta de analista na hora (e-mail informado + senha aleatoria, ja travada no
  tutorial), adiciona ele aquela equipe, e avisa por e-mail o gestor coordenador dela -
  com as respostas do teste de aptidao anexadas, para o gestor ja conhecer o perfil de
  quem esta chegando. Se o Resend estiver configurado, o proprio candidato tambem recebe
  um e-mail automatico com o acesso; senao, a senha aparece na tela para voce repassar
  por um canal seguro. O gestor (ou o líder) tambem pode reabrir esse teste de aptidao a
  qualquer momento pelo card "Contas cadastradas" -> "Ver teste de aptidão", num analista
  da propria equipe.
- **Conta de analista nasce travada**: nenhuma ferramenta aparece ate ele terminar um
  "cursinho" (video de boas-vindas -> video+resumo+perguntas repetido -> video de cada
  ferramenta, liberando uma de cada vez). As respostas dele ficam visiveis para o gestor
  da equipe e para o líder, silenciosamente - o analista nunca ve nem e avisado
  disso. Card "Etapas do tutorial" no painel configura essa sequencia, sem precisar
  mexer em codigo.
- **Videos do tutorial ficam no Vercel Blob Storage** (upload direto do navegador do
  gestor/líder, sem passar pelo servidor - necessario porque videos costumam ser maiores
  que o limite de uma Serverless Function). Para funcionar, ative isso uma vez no painel
  da Vercel: Project -> Storage -> Create Database -> **Blob** -> Connect to Project.
  A Vercel injeta a variavel `BLOB_READ_WRITE_TOKEN` sozinha, sem precisar copiar nada
  manualmente (diferente do Upstash).
- **Conhecido, ainda nao coberto nesta fase**: as ferramentas que hoje sao "travadas"
  pelo tutorial (`lib/tutorial.js` -> `FERRAMENTAS_DISPONIVEIS`) sao apenas as que ja
  existem de verdade na tela do analista (`ver_clientes`, `minhas_tarefas`) - o gate e
  aplicado hoje so na tela (esconde os cards ate concluir); as rotas de API
  correspondentes (`/api/shops`, `/api/tasks`) ainda nao recusam a chamada de um analista
  com tutorial incompleto se ele tentar acessar por fora da tela. Ainda nao foi
  construida a IA de verdade (Claude) como ferramenta de chat do dia a dia - por enquanto
  o "cursinho" usa videos/textos fixos cadastrados por voce, nao uma IA respondendo ao
  vivo.

## O que este app faz

- `/api/authorize` - gera o link de autorizacao para enviar a um cliente
- `/api/callback` - recebe o retorno da Shopee e guarda o token da loja autorizada
- `/api/refresh-all` - renova os tokens perto de vencer (rodar via Cron a cada poucas horas)
- `/api/shops` - lista as lojas conectadas (GET) e salva um apelido/nome do cliente (POST)
- `/` (public/index.html) - telinha basica interna: botao para gerar o link de autorizacao
  e tabela com as lojas conectadas, status do token e nome do cliente. So para uso da
  equipe da Adaptaecom, nao precisa de design elaborado, e so uma conveniencia.
- `/api/shop-data?shop_id=...` - exemplo de consulta (dados da loja + pedidos dos ultimos 7 dias)
- `/api/login` e `/api/logout` - login/logout da plataforma
- `/api/me` - retorna o usuario logado (usado pela tela para saber o que exibir)
- `/api/admin/create-user` - cria o acesso (e-mail, senha e papel) de uma pessoa. Admin/owner.
- `/api/admin/users` - lista contas cadastradas (owner ve todas; admin ve so gestores).
- `/api/admin/analysts` - lista os gestores ativos (para o menu de atribuicao). Admin/owner.
- `/api/admin/assign` - define qual gestor cuida de qual cliente. Admin/owner.
- `/api/admin/toggle-user` - ativa/desativa uma conta. Admin/owner (com regras, ver abaixo).
- `/api/tasks` - lista (GET) ou cria (POST) tarefas de um cliente.
- `/api/tasks/complete` - marca uma tarefa como concluida.
- `/api/admin/tasks-overview` - lista as tarefas dos clientes (owner ve todos; admin ve so
  os da propria equipe), para fiscalizacao. Admin/owner.
- `/api/owner/audit-log` - log de auditoria completo (admins e gestores). So o owner.
- `/api/admin/audit-log` - log de auditoria dos gestores (owner ve todos; admin ve so os
  da propria equipe). Admin/owner.
- `/api/teams` - GET lista equipes (owner: todas; admin: so a propria) / POST cria uma
  equipe nova (nome + admin coordenador). So o owner cria.
- `/api/teams/members` - adiciona ou remove um gestor de uma equipe. Admin (so na propria
  equipe) ou owner (em qualquer equipe).
- `/api/cron/flash-sale-check-20h` - roda automaticamente as 20h (Cron), confirma que a
  oferta relampago de amanha foi criada e avisa o gestor por e-mail se achar problema.
- `/api/cron/flash-sale-check-22h` - roda automaticamente as 22h (Cron), reanalisa e, se o
  problema persistir, escala por e-mail para admins + owner.
- `/api/cron/metrics-daily-check` - roda automaticamente 1x/dia (Cron), compara preco de
  anuncio e meta de ROAS de cada loja com o dia anterior e registra as mudancas
  encontradas (ver secao "Fase 3" acima).
- `/api/cron/weekly-report` - roda automaticamente toda segunda-feira (Cron), envia ao
  gestor de cada equipe o resumo das mudancas da semana.
- `/api/admin/mudancas-metricas` - lista as mudancas detectadas nos ultimos 30 dias
  (owner ve todas; admin ve so as da propria equipe). Admin/owner.

## Estrutura das rotas: por que existe `api/[...slug].js` e a pasta `server/`

O plano gratuito (Hobby) da Vercel limita cada deploy a **no maximo 12 Serverless
Functions**. Este projeto tem mais de 20 rotas diferentes - se cada arquivo dentro de
`api/` virasse uma funcao separada (como era no inicio), a Vercel recusa o deploy.

Para caber no plano gratuito sem mudar nenhuma URL (tudo continua exatamente igual:
`/api/login`, `/api/admin/users`, `/api/teams/members` etc.), toda a logica de cada rota
foi movida para dentro da pasta `server/handlers/` (um arquivo por rota, igual antes) e
existe **um unico arquivo** em `api/` - `api/[...slug].js` - que recebe qualquer chamada
para `/api/...` e repassa para o modulo certo dentro de `server/handlers/`. Ele funciona
como um "recepcionista": olha o caminho pedido e chama a funcao certa.

Isso significa que **99% do codigo continua igual** - só o "empacotamento" para a Vercel
mudou. Se um dia a Adaptaecom migrar para o plano Pro (que permite muito mais funcoes),
nao ha necessidade de mudar nada - esse formato funciona igual e sem custo extra, e da
para voltar a separar em arquivos individuais se um dia fizer sentido.

## Telas (mockups) - gestor, admin e owner

A pasta `mockups/` guarda os tres paineis de front-end (`gestor-dashboard.html`,
`admin-dashboard.html`, `owner-dashboard.html`), hoje ainda com dados fixos (mock) no
proprio arquivo, so para validar layout/fluxo antes de ligar na API real. Sao arquivos
HTML autocontidos (abra direto no navegador, sem precisar rodar nada) e ja tem:

- Escape de todo texto vindo de "usuario" antes de inserir na tela (`esc()`), fechando o
  risco de XSS armazenado assim que os dados passarem a vir da API de verdade.
- Os tres niveis de acesso completos: gestor (so os proprios clientes), admin (equipe +
  ferramentas de criar gestor/cliente), owner (todas as equipes, criar equipe/admin,
  ranking entre equipes, relatorio mensal comparativo).

Proximo passo (as "conexoes"): trocar os dados mock desses arquivos por chamadas reais
as rotas listadas acima (`/api/login`, `/api/me`, `/api/shops`, `/api/tasks`, etc.),
usando `fetch` com `credentials: 'include'` (a sessao e por cookie).

## Contas e papeis (líder x gestor x analista) - acesso fechado, sem cadastro publico

Este projeto **nao tem nenhuma tela de cadastro publico**. Ninguem consegue criar a
propria conta sozinho - toda conta nasce de uma das duas formas abaixo:

1. **Sua conta ("líder")**: criada uma unica vez, rodando um script no seu computador
   (`node scripts/create-admin.js`, ver o passo a passo abaixo). So existe uma conta
   líder - e a unica que ve o log de auditoria de todo mundo (gestores e analistas).
2. **Contas de qualquer outra pessoa (analista ou gestor)**: criadas por voce (ou
   por outro gestor, no caso de um analista), ja logado, na propria tela do site (card
   "Criar acesso para uma pessoa"). Voce define o e-mail, a senha e o tipo de acesso e
   combina essas credenciais com a pessoa por um canal seguro (WhatsApp, Slack etc.) - a
   senha nao e enviada automaticamente por e-mail. **So o líder pode criar outra conta
   de gestor** - um gestor comum so pode criar contas de analista.

Isso significa que a tela de login nunca mostra um link de "criar conta" - quem nao
recebeu um acesso criado por voce simplesmente nao consegue entrar.

- Como líder ou gestor, voce ve todas as lojas conectadas e escolhe, em um menu ao lado de
  cada uma, qual analista fica responsavel por aquele cliente.
- Um analista, ao logar, so ve os clientes atribuidos a ele - nenhum outro aparece na tela.
- So líder/gestor podem gerar links de autorizacao de novas lojas, renomear clientes,
  criar novos acessos e atribuir analistas.

## Equipes (varios gestores, cada um com a sua equipe)

Pensado para uma agencia com mais de um gestor: cada equipe tem um NOME, UM gestor
que a coordena, e uma lista de analistas. Regras (aplicadas no servidor):

- **So o líder cria uma equipe** - escolhe o nome e qual conta de gestor vai coordenar (card
  "Equipes" na tela do líder). Cada gestor coordena no maximo UMA equipe.
- **Um gestor pode adicionar analistas na PROPRIA equipe** (a que o líder atribuiu a ele),
  no card "Minha equipe" - mas **nao consegue adicionar ninguem na equipe de outro
  gestor**, essa tentativa e barrada no servidor, nao so escondida na tela.
- **Cada analista pertence a no maximo uma equipe por vez.** Se um gestor tentar adicionar
  um analista que ja esta em outra equipe, o sistema recusa (`GESTOR_EM_OUTRA_EQUIPE`) -
  so o líder pode mover um analista de uma equipe para outra.
- **O acesso de um gestor aos "relatorios" (log de auditoria dos analistas e o painel de
  fiscalizacao de tarefas) fica limitado aos analistas da PROPRIA equipe.** Um gestor nao
  ve mais o log nem as tarefas dos analistas de outra equipe - so o líder continua vendo
  tudo, de qualquer equipe. Isso tambem vale para a lista de contas (`/api/admin/users`)
  e o dropdown de atribuicao de cliente a analista (`/api/admin/analysts`): um gestor so
  enxerga os analistas da propria equipe nesses dois lugares.
- **Importante - o que NAO mudou**: a lista de lojas conectadas (`/api/shops`) e a
  geracao de link de autorizacao continuam disponiveis para qualquer gestor, de qualquer
  equipe (pensado para o cadastro inicial de um cliente novo, antes de decidir de qual
  equipe ele vai fazer parte). Se um dia isso tambem precisar ser restrito por equipe, e
  so avisar.

## Desativar uma conta (quando alguem sai da equipe)

Na tela, card "Contas cadastradas", cada pessoa tem um botao "Desativar"/"Reativar".
Regras (aplicadas no servidor, nao so escondidas na tela):

- A conta **líder nunca pode ser desativada** por essa rota.
- **Ninguem pode desativar a propria conta** (evita se trancar pra fora sem querer).
- **So o líder pode desativar/reativar uma conta de gestor.**
- **Gestor ou líder podem desativar/reativar uma conta de analista.**
- Uma conta desativada nao consegue mais fazer login, mesmo com a sessao ainda "valida"
  no navegador - a checagem e feita no banco a cada requisicao, nao so no momento do login.

## Log de auditoria

Registra: criacao de conta, ativacao/desativacao de conta, atribuicao de analista a
cliente, geracao de link de autorizacao, renomeacao de cliente, criacao e conclusao de
tarefas. Duas visoes:

- **Líder** (`/api/owner/audit-log`): ve **todas** as acoes, de gestores e de analistas.
- **Gestor** (`/api/admin/audit-log`): ve **so** as acoes cujo autor tem papel "analista" -
  nao ve o que outros gestores ou o líder fizeram.

## Tarefas e fiscalizacao semanal

- O fluxo pensado e o relatorio diario criar a tarefa SOZINHO quando encontra um problema
  (ex: "ACOS acima do limite") - nao e algo que admin/owner ficam criando na mao todo dia.
  A rota `/api/tasks` ja esta pronta para isso, chamada pela automacao via `SERVICE_KEY`,
  assim que a coleta diaria de dados existir (proxima fase do projeto). O card "Criar
  tarefa manualmente" na tela e so uma excecao, para usar enquanto essa automacao ainda
  nao esta pronta ou para um caso pontual.
- **A mesma tarefa nao e recriada todo dia**: cada tipo de problema tem um identificador
  (`issue_key`, gerado automaticamente a partir da descricao se voce nao informar um).
  Se o relatorio diario detectar de novo um problema que ja tem uma tarefa PENDENTE para
  aquele cliente, ele nao cria uma tarefa nova - a tarefa existente e reaproveitada, e o
  campo `dias_pendente` (calculado sozinho, a partir de quando o problema foi detectado
  pela primeira vez) mostra ha quantos dias aquilo continua sem solucao. So quando o
  gestor conclui a tarefa e o problema aparece de novo depois, uma tarefa nova e criada.
- O gestor responsavel pelo cliente ve as tarefas dele no card "Minhas tarefas", com o
  "pendente ha X dia(s)" ficando mais critico (vermelho) apos 7 dias, e clica em
  "Concluir" quando resolver.
- Admin/owner acompanham tudo no card "Tarefas de todos os clientes (fiscalizacao)": quem
  e o gestor, o que foi concluido, o que ainda esta pendente e ha quantos dias.
- **Importante sobre o relatorio semanal em si**: essa parte (comparar metricas da loja
  semana a semana, junto com as tarefas feitas/nao feitas, e entregar isso so para
  admins/owner) ainda depende da automacao diaria de coleta de dados, que e a proxima
  fase do projeto (ver o resumo tecnico enviado anteriormente). O que ja esta pronto
  agora e a base: criar (sem duplicar), atribuir, concluir e fiscalizar tarefas, com a
  contagem de dias pendente pronta para alimentar esse relatorio semanal quando a coleta
  diaria estiver no ar.

## Analise automatica da oferta relampago (20h e 22h)

Motivo: ja houve caso de um gestor esquecer de configurar a oferta relampago do dia
seguinte, e o cliente perder vendas. Para evitar isso, duas checagens automaticas rodam
todo dia (horario de Brasilia):

- **20h** (`/api/cron/flash-sale-check-20h`): confirma que a oferta relampago de AMANHA
  ja foi criada e compara ela com a de HOJE, procurando:
  1. **anuncio faltando** - um anuncio/variacao que estava na oferta de hoje e sumiu na de amanha;
  2. **estoque baixo** - estoque adicionado por variacao abaixo do minimo configurado
     (`FLASH_SALE_MIN_STOCK`, padrao 30 unidades);
  3. **preco descrepante** - preco muito diferente (pra cima ou pra baixo) do praticado
     hoje, acima do percentual configurado (`FLASH_SALE_PRICE_DEVIATION_PERCENT`, padrao 20%).

  Se achar algum problema (ou se a oferta nem existir ainda), cria/reaproveita uma tarefa
  do gestor responsavel (mesma logica de deduplicacao das outras tarefas - nao duplica dia
  apos dia) e manda um e-mail pra ele explicando o que foi encontrado.

- **22h** (`/api/cron/flash-sale-check-22h`): reanalisa do zero. Se o gestor nao corrigiu
  nada e o problema continua, manda um e-mail de escalonamento para **todos os admins e o
  owner** (nao so pro gestor), com o resumo do que ainda esta errado.

**Configuracao**: `FLASH_SALE_MIN_STOCK` e `FLASH_SALE_PRICE_DEVIATION_PERCENT` no
`.env.example` - ajuste conforme a realidade dos seus clientes.

**Importante - API de Oferta Relampago nao confirmada na documentacao oficial**: o
arquivo `lib/shopeeFlashSale.js` foi escrito com base no padrao geral da Shopee Open
Platform v2, mas os nomes exatos dos endpoints (`get_shop_flash_sale_list`,
`get_shop_flash_sale_item_list`) e dos campos de resposta (preco, estoque, etc.) **nao
puderam ser confirmados ao vivo** - o acesso a documentacao (open.shopee.com) ficou
bloqueado durante o desenvolvimento. Assim que a Adaptaecom tiver acesso de parceiro
aprovado, confirme esses nomes na documentacao real e ajuste o arquivo se precisar (os
pontos a revisar estao marcados com comentarios "CONFIRMAR" no codigo).

## Seguranca incluida neste projeto

- **Sem cadastro publico/independente**: toda conta e criada por um admin ja logado (ou,
  no caso da primeira, por voce rodando um script localmente). Ninguem consegue criar a
  propria conta batendo direto na API.
- **Login individual por pessoa** (e-mail + senha com hash bcrypt).
- **Controle de acesso por papel**: analista so ve/consulta dados dos clientes atribuidos
  a ele; rotas administrativas (`/api/authorize`, `/api/admin/*`, renomear cliente) exigem
  papel de gestor (ou líder).
- **Tokens criptografados**: os `access_token`/`refresh_token` de cada loja sao guardados
  criptografados (AES-256-GCM) no Redis, nunca em texto puro.
- **Protecao contra CSRF na autorizacao**: cada link de autorizacao carrega um codigo de
  uso unico (`state`), valido por 10 minutos - ninguem consegue forjar um retorno de
  autorizacao falso.
- **Rota de renovacao de token (`/api/refresh-all`) protegida por segredo de Cron**: so a
  propria Vercel (usando `CRON_SECRET`) pode chamar essa rota.
- **Rota de dados (`/api/shop-data`) aceita login (respeitando a atribuicao do gestor)
  OU uma chave de servico** (`SERVICE_KEY`), para uso pela automacao diaria que roda sem
  navegador.
- **Limite de tentativas no login**: 10 tentativas por e-mail e 20 por IP a cada 15
  minutos - depois disso, a rota responde "muitas tentativas" e bloqueia temporariamente.
- **Tempo de resposta do login normalizado**: mesmo quando o e-mail nao existe, o login
  gasta um tempo parecido com o de uma senha errada - isso evita que alguem descubra
  quais e-mails tem conta so cronometrando as respostas.
- **Comparacoes de segredos em tempo constante** (`SERVICE_KEY`, `CRON_SECRET`, a
  assinatura do cookie de sessao) - evita ataques de timing contra esses valores.
- **Cabecalhos de seguranca HTTP** (`vercel.json`): bloqueia a pagina de ser carregada
  dentro de um iframe de outro site (clickjacking), forca HTTPS, e desativa acesso a
  camera/microfone/localizacao que o navegador nao precisa.

### Revisao de seguranca apos a criacao das equipes

Depois de implementar as equipes, revisei todo o projeto de novo procurando furos -
principalmente onde o novo limite "admin so mexe na propria equipe" poderia estar sendo
ignorado por alguma rota mais antiga. Encontrei e corrigi:

- **`/api/admin/assign` nao respeitava equipe**: um admin conseguia atribuir QUALQUER
  gestor (inclusive de outra equipe) a qualquer cliente, e conseguia mexer num cliente
  ja cuidado por gestor de outra equipe - isso furava o modelo de equipes por completo,
  ja que a atribuicao gestor-cliente e a base de tudo. Agora um admin so mexe num cliente
  sem gestor ou ja da propria equipe, e so atribui gestores da propria equipe. Tambem
  passou a validar que `analyst_id` e mesmo uma conta de papel gestor ativa (antes aceitava
  qualquer ID).
- **`/api/admin/toggle-user` deixava um admin desativar gestor de outra equipe**: a tela
  ja escondia gestores de outra equipe, mas a rota em si nao conferia isso - dava para
  contornar chamando a API direto. Corrigido.
- **`/api/tasks` (GET e POST manual) e `/api/tasks/complete`**: um admin conseguia ver,
  criar tarefa manual e concluir tarefas de clientes de outra equipe. Agora seguem a
  mesma regra: sem gestor atribuido ou gestor da propria equipe.
- **`/api/shop-data`**: mesma correcao - um admin so consulta dados ao vivo da Shopee de
  clientes sem gestor ou da propria equipe (owner e a chave de servico continuam sem essa
  restricao).
- **Senha fraca**: alem do minimo de 8 caracteres, agora tambem e recusada uma lista
  curta de senhas obviamente fracas/comuns (`123456789`, `password1`, etc.) e uma senha
  igual ao nome de usuario do proprio e-mail - tanto na criacao de conta pela tela quanto
  no script local que cria o owner.

Nenhuma dessas correcoes exigiu mudar o comportamento visivel pela tela - eram furos que
so apareciam chamando a API diretamente (contornando o painel), nao no uso normal.

### Revisao de seguranca da Fase 2 (processo seletivo + tutorial)

Depois de implementar o processo seletivo e o tutorial obrigatorio, revisei toda essa
parte nova procurando furos, ja que e a unica area do sistema com uma rota publica (sem
login). Encontrei e corrigi:

- **O limite de tentativas na inscricao publica (e no login) podia ser burlado**: o
  codigo calculava o IP do visitante pegando o primeiro valor do cabecalho
  `X-Forwarded-For` - mas esse e exatamente o valor que o proprio visitante pode inventar
  e mandar diferente a cada tentativa, "resetando" o limite de 5 inscricoes por hora.
  Corrigido para usar o valor confiavel (o que a Vercel de fato adiciona), tanto na
  inscricao de candidatos quanto no login.
- **Resposta do teste sem limite de tamanho/quantidade em alguns casos**: se ainda nao
  houvesse nenhuma pergunta de teste cadastrada, ou se alguem mandasse itens de resposta
  com identificador de pergunta invalido, o sistema aceitava e guardava sem nenhum limite
  de tamanho. Agora toda resposta e sempre validada (tamanho maximo e quantidade maxima
  de itens), e qualquer item que nao corresponda a uma pergunta real e descartado.
- **Risco serio: dados do formulario publico apareciam sem tratamento na tela do
  líder** - nome, e-mail, telefone e respostas de um candidato (que qualquer pessoa da
  internet pode preencher) eram inseridos na tela de "Candidatos" sem nenhum escape.
  Isso permitiria, em teoria, que alguem mal-intencionado inscrevesse um "candidato" com
  um conteudo malicioso no nome/resposta que, ao ser visualizado pelo líder, executasse
  acoes na conta dele (criar contas, aprovar candidatos etc.) sem o líder perceber.
  Corrigido: todo texto vindo de fora (candidatos, e tambem titulos/perguntas cadastrados
  por um gestor no tutorial) agora passa por uma funcao de escape antes de aparecer na
  tela.
- **Consultas silenciosas ao teste de aptidao/respostas do tutorial de um analista nao
  ficavam no log de auditoria**: a regra de "o analista nunca fica sabendo que isso foi
  consultado" e proposital, mas isso nao deveria significar "sem nenhum registro" - agora
  fica registrado no log quem consultou os dados de qual analista, mesmo que o proprio
  analista continue sem ser avisado.

Nenhuma dessas correcoes muda o uso normal da tela - so fecham brechas que so apareciam
chamando a API diretamente ou explorando o formulario publico, e a ultima acrescenta
apenas mais uma linha no log de auditoria (nada que apareca para o analista).

### O que este projeto AINDA NAO cobre (risco aceito, nao "seguranca total")

Sendo direto: nenhum sistema tem "toda a seguranca possivel" - sempre existe uma proxima
camada. O que ficou de fora aqui, conscientemente, por ainda nao ter sido pedido ou por
depender de decisao sua:

- **Sem exclusao definitiva de conta**: hoje da para desativar (ver secao acima), mas nao
  para apagar de vez o registro do banco - manter o historico ajuda o log de auditoria a
  continuar fazendo sentido (nao perder o rastro de quem fez o que).
- **Sem exigencia de senha forte**: so exigimos 8 caracteres minimos: senhas fracas como
  "12345678" passam. Da para adicionar uma checagem mais rigorosa.
- **Variaveis de ambiente sensiveis**: ao colar `ENCRYPTION_KEY`, `SESSION_SECRET` etc. na
  Vercel, marque-as como "Sensitive" (opcao no proprio formulario da Vercel) para que o
  valor fique oculto depois de salvo, mesmo para quem tem acesso ao projeto.
- **Sem varredura automatica de dependencias**: rode `npm audit` de vez em quando (ou
  ative o Dependabot no GitHub) para saber se alguma biblioteca usada aqui teve uma falha
  de seguranca descoberta depois.

Isso cobre o essencial para colocar dados reais de clientes com uma seguranca razoavel -
mas nao tenho como garantir que atende a todos os criterios de revisao da Shopee, ja que
nao consegui confirmar a lista exata deles na documentacao oficial (ver conversa anterior).

## Passo a passo para colocar no ar

### 1. Criar conta na Vercel (hospedagem gratuita)
1. Va em https://vercel.com e crie uma conta (pode ser com o login do Google/GitHub).
2. Crie um repositorio no GitHub com os arquivos deste projeto (ou peca para eu gerar
   o zip pronto para subir).
3. Na Vercel, clique em "Add New Project" e importe esse repositorio.
4. Nao precisa mexer em nada nas configuracoes de build, e um projeto Node simples.

### 2. Criar o banco Redis gratuito (Upstash)
1. Va em https://upstash.com, crie uma conta gratuita.
2. Crie um banco "Redis" (regiao mais proxima do Brasil, ex: sa-east-1 se disponivel).
3. Copie as duas chaves `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`.

### 3. Configurar as variaveis de ambiente na Vercel
No painel do projeto na Vercel, va em Settings -> Environment Variables e adicione todas
as variaveis do arquivo `.env.example` (menos o `SHOPEE_REDIRECT_URL`, que so da para
preencher depois do primeiro deploy, quando voce souber a URL final, ex:
`https://adaptaecom-shopee-app.vercel.app/api/callback`).

Para as variaveis de seguranca (`ENCRYPTION_KEY`, `SESSION_SECRET`, `CRON_SECRET`,
`SERVICE_KEY`), rode os comandos indicados nos comentarios do `.env.example` no seu
terminal (com Node instalado) para gerar os valores - nao invente strings de cabeca, use
valores realmente aleatorios.

Depois de preencher, faca um "Redeploy" do projeto para as variaveis entrarem em vigor.

### 3.1 Criar conta no Resend (opcional por enquanto)
Como nao ha mais cadastro publico com verificacao de e-mail, o Resend nao e
obrigatorio para colocar o app no ar hoje. Ele fica reservado para quando construirmos
a notificacao diaria por e-mail (avisando o gestor que o relatorio do dia saiu). Se
quiser deixar ja configurado:
1. Va em https://resend.com, crie uma conta gratuita (ate 3.000 e-mails/mes).
2. Verifique um dominio seu.
3. Copie a API Key para `RESEND_API_KEY`.
4. Preencha `RESEND_FROM_EMAIL` (ex: `Adaptaecom <relatorios@adaptaecom.com>`) e
   `APP_BASE_URL` com a URL do seu app na Vercel.

### 3.2 Criar sua conta de administrador
Essa conta nao e criada pela tela do site - e criada rodando um comando no seu
computador, com acesso direto ao banco (assim ninguem mais consegue criar um admin
so usando o site):
```
cd shopee-app
npm install
export UPSTASH_REDIS_REST_URL="cole aqui a mesma URL que voce colocou na Vercel"
export UPSTASH_REDIS_REST_TOKEN="cole aqui o mesmo token que voce colocou na Vercel"
node scripts/create-admin.js "seu@email.com" "sua-senha-forte" "Seu Nome"
```
Depois disso, acesse `https://SEU-APP.vercel.app/` e faca login normalmente com esse
e-mail e senha - essa e a sua conta de administrador, ja verificada.

### 3.3 Criar o acesso dos analistas da sua equipe
Ja logado como gestor, use o card "Criar acesso para uma pessoa" na propria tela: informe
nome, e-mail, uma senha e escolha "Analista" (ou "Gestor", se for o caso). Combine
essas credenciais com a pessoa por um canal seguro - a plataforma nao envia a senha por
e-mail automaticamente.

### 4. Virar parceiro na Shopee (voce faz isso, nao eu)
1. Acesse https://open.shopee.com e crie uma conta de desenvolvedor/parceiro com o CNPJ
   da Adaptaecom.
2. Comece pelo ambiente de TESTE (sandbox) - e mais rapido de aprovar e serve para validar
   tudo antes de mexer com dados reais de clientes.
3. Ao criar o "app", voce vai receber o `Partner ID` e a `Partner Key` - cole esses valores
   nas variaveis de ambiente da Vercel.
4. Escolha os escopos (categorias de API) que voce realmente precisa: pedidos (Order),
   produtos (Product), marketing/ads (AMS), e reputacao/pos-venda se disponivel. Evite pedir
   escopos que voce nao vai usar - isso atrasa a aprovacao.
5. Registre a `Redirect URL` do seu app (`.../api/callback`) no cadastro do app na Shopee.

### 5. Conectar a primeira loja de cliente
1. Acesse `https://SEU-APP.vercel.app/api/authorize` no navegador.
2. Copie o `auth_url` que aparecer e envie para o cliente (ou abra voce mesmo, se for uma
   loja de teste/sandbox).
3. O cliente loga na conta Shopee dele e clica em "Autorizar".
4. Ele e redirecionado de volta para `/api/callback`, que salva o token automaticamente.

### 6. Testar se esta funcionando
Essa rota agora exige autenticacao. De dentro do painel (`/`) logado, ou via terminal com
a chave de servico:
```
curl -H "x-service-key: SUA_SERVICE_KEY" "https://SEU-APP.vercel.app/api/shop-data?shop_id=SHOP_ID_DA_LOJA"
```
Veja se os dados da loja e os pedidos recentes aparecem em JSON.

### 7. Manter os tokens vivos + plano Hobby x Pro da Vercel

O token de acesso de cada loja (`access_token`) expira sozinho a cada ~4h. Existem duas
camadas para isso nunca ser um problema:

1. **Renovacao sob demanda** (`lib/shopeeAuth.js`): toda vez que uma rota vai chamar a API
   da Shopee em nome de uma loja, ela passa por `getValidAccessToken(shopId)` primeiro, que
   renova o token sozinho se estiver a menos de 5 minutos de vencer. Isso significa que o
   sistema **nao depende de um cron frequente** para manter os tokens vivos.
2. **`/api/refresh-all`** continua existindo como uma "rede de seguranca", rodando 1x/dia
   (Cron) para renovar qualquer token que esteja perto de vencer, mesmo que nenhuma rota
   tenha sido chamada naquele dia.

Isso importa por causa de uma limitacao real da Vercel: **no plano Hobby (gratuito),
cada Cron Job so pode rodar no maximo 1x por dia, e o horario tem uma margem de ate 59
minutos de imprecisao** (ex: um cron marcado para "20h" pode rodar entre 20h e 20h59).
Um cron a cada 3 horas, por exemplo, **nao e permitido no Hobby e o deploy falharia** -
por isso a renovacao sob demanda acima, e por isso os crons deste projeto (`refresh-all`,
`flash-sale-check-20h`, `flash-sale-check-22h`) foram todos ajustados para rodar 1x/dia.

**O que isso significa na pratica para as checagens das 20h e 22h**: elas continuam
funcionando no plano Hobby, mas o horario exato pode variar em ate ~1h (ex: a "das 20h"
pode disparar as 20h40). Se, no futuro, a precisao de horario for critica (por exemplo,
se um cliente muito grande depender de a checagem rodar exatamente as 20h00), vale
considerar o **plano Pro da Vercel (por volta de US$20/usuario/mes, confirme o valor
atual no site da Vercel)**, que permite cron por minuto com precisao exata. Hoje, com o
volume de checagens que temos (poucas vezes ao dia), isso nao e necessario - e so uma
opcao para quando a precisao de horario passar a ser mais importante que o custo.

### 7.1 Quantos "creditos"/uso da Vercel essas automacoes consomem?

Cron Jobs em si **nao tem custo extra em nenhum plano** - o que e cobrado (ou descontado
da cota gratuita) e o **uso da funcao que o cron chama**: numero de execucoes ("Function
Invocations"), memoria x tempo de execucao ("Provisioned Memory", em GB-Hrs) e trafego de
saida ("Fast Origin Transfer"). O plano Hobby inclui de graca, por mes: 1 milhao de
execucoes de funcao, 360 GB-Hrs de memoria e 10 GB de trafego.

Com a rotina atual - `refresh-all` (1x/dia), a checagem das 20h (1x/dia), a das 22h
(1x/dia) e, se adicionarmos, um relatorio semanal toda segunda as 11h (1x/semana) - isso
da cerca de **95 a 100 execucoes de funcao por mes**, no total. Isso e uma fracao
insignificante (bem menos de 0,1%) da cota gratuita de 1 milhao de execucoes/mes: mesmo
somando o uso normal do time durante o dia (logins, telas do painel, etc.), esse volume
de automacoes praticamente nao pesa na conta. Cada cron roda como UMA execucao de funcao,
mesmo que dentro dele o codigo percorra varias lojas de clientes em loop (o loop acontece
"dentro" da mesma execucao, nao conta como uma execucao por loja).

O ponto que realmente merece atencao com o crescimento da carteira de clientes nao e o
consumo de creditos, e sim o **tempo maximo de execucao de uma funcao** (`maxDuration`).
Se a Adaptaecom tiver muitos clientes, e cada um exigir varias chamadas a API da Shopee
dentro do mesmo cron, o loop pode demorar bastante e a funcao ser interrompida no meio se
o limite configurado for baixo demais.

**Boa noticia: aumentar esse limite nao exige o plano Pro.** O teto de `maxDuration` no
plano Hobby (gratuito) e **300 segundos (5 minutos) por execucao** - o mesmo teto que o
Pro usa no dia a dia (o Pro so vai alem disso, ate 800s ou 1800s, mediante custo extra de
uso, algo que so faria sentido para lojas com uma carteira gigante). Importante: esses
300 segundos sao um limite **por execucao** (cada vez que o cron dispara, 1x por dia),
nao um "orcamento de tempo por dia" somado entre os 3 crons - cada um tem seu proprio
teto, independente dos outros.

### 7.2 Quanto tempo cada checagem realmente demora, com varios gestores/clientes?

O que importa aqui nao e "quantos segundos por dia", e sim **quanto tempo uma unica
execucao do cron leva para percorrer todas as lojas**. Por loja, a checagem de oferta
relampago faz: 1 consulta ao token no Redis (rapida, ~50-150ms), e as chamadas a API da
Shopee para pegar a oferta de hoje e a de amanha (a parte mais lenta - APIs externas
costumam levar entre ~0,5s e ~1,5s por chamada, variando com a instabilidade da rede/API
da Shopee). Ou seja, uma estimativa realista e de **~1 a 2 segundos por loja**.

Se cada gestor cuida de 5 clientes, o tempo total depende de quantos gestores existem:

| Gestores | Lojas (5 cada) | Loop um-por-um (sequencial) | Em lotes de 8 ao mesmo tempo (como este projeto faz) |
| --- | --- | --- | --- |
| 5 | 25 | ~25-50s | ~4-10s |
| 10 | 50 | ~50-100s | ~7-13s |
| 20 | 100 | ~100-200s (perto do limite de 60s ja estouraria) | ~13-25s |
| 40 | 200 | ~200-400s (estouraria os 300s do Hobby) | ~25-50s |

Um loop simples, loja por loja, um atras da outra, escala mal: com 20 gestores (100
lojas) ele ja fica perto ou passa de qualquer `maxDuration` baixo, e com 40 gestores
(200 lojas) pode passar até do teto de 300s do proprio Hobby. Por isso os tres crons que
percorrem lojas (`refresh-all`, `flash-sale-check-20h`, `flash-sale-check-22h`) **nao
processam mais uma loja por vez**: eles processam em lotes de 8 lojas ao mesmo tempo
(`lib/concurrency.js`, ajustavel pela variavel `FLASH_SALE_CONCURRENCY` no
`.env.example`), o que reduz o tempo total por um fator proximo a 8x. Com isso, mesmo um
cenario de 40 gestores (200 lojas) fica em torno de 25-50 segundos - bem dentro do
`maxDuration: 60` ja configurado no `vercel.json`, com folga.

Se a operacao crescer muito alem disso (centenas de gestores), os ajustes possiveis, em
ordem: (1) aumentar `FLASH_SALE_CONCURRENCY` (mais lojas em paralelo por vez); (2)
aumentar o `maxDuration` no `vercel.json` (ainda de graca ate 300s no Hobby); (3) so
depois disso, se ainda nao bastar, considerar o plano Pro para durações maiores que 300s
ou dividir a checagem em mais de uma execucao. Hoje, com a estimativa de dezenas de
gestores, nenhuma dessas medidas extras e necessaria.

## Depois que estiver no ar

Quando esse app estiver publicado e com pelo menos uma loja de cliente autorizada, me
avise e eu configuro a tarefa agendada diaria (8h) que vai chamar `/api/shop-data`,
aplicar o Manual do Gestor nos numeros e te entregar o relatorio com as acoes do dia e
da semana. Tambem posso configurar, na mesma leva, o relatorio semanal (ex: toda
segunda-feira as 11h) mencionado na conversa - assim que voce confirmar que quer seguir
com ele, ele entra como mais um Cron Job de 1x/semana, sem custo extra (ver secao 7.1
acima sobre uso/creditos da Vercel).

## Aviso importante

- Comece sempre pelo ambiente de SANDBOX da Shopee antes de ir para producao.
- So peca os escopos de API que voce realmente vai usar.
- Nunca suba o arquivo `.env` real (com as chaves preenchidas) para um repositorio publico.
