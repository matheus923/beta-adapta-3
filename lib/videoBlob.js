// Upload dos videos do tutorial direto do navegador para o Vercel Blob Storage.
//
// Por que "upload direto do navegador" em vez de mandar o video pela nossa propria rota
// da API: toda Serverless Function da Vercel tem um limite de tamanho de corpo da
// requisicao (poucos MB) - um video de alguns minutos passa disso facil. O jeito
// recomendado pela propria Vercel para arquivos grandes e o "client upload": o navegador
// pede um "token" temporario pra nossa API (isso sim e uma chamada pequena, rapida, e
// exige estar logado como admin/owner), e depois envia o arquivo diretamente para o
// Blob Storage usando esse token - sem passar pelo nosso servidor no meio.
//
// Precisa da variavel de ambiente BLOB_READ_WRITE_TOKEN, que a propria Vercel preenche
// sozinha quando voce ativa "Blob" nas Storage do projeto (Project -> Storage -> Create
// Database -> Blob) - nao precisa gerar nada manualmente, diferente do Upstash.
//
// CONFIRMAR: o fluxo abaixo segue a documentacao oficial do @vercel/blob (client uploads),
// mas so foi testado localmente sem uma conta Blob real - vale confirmar ao vivo, no
// primeiro upload de video real, se tudo funciona como esperado.
const { handleUpload } = require('@vercel/blob/client');

// Chamado pela rota /api/admin/tutorial/upload. O @vercel/blob cuida de diferenciar as
// duas chamadas que esse mesmo endpoint recebe:
//   1) "generate-client-token": vem do navegador do admin (com a sessao/cookie dele) -
//      aqui SIM exigimos login de admin/owner antes de autorizar o upload.
//   2) "upload-completed": chamada feita pelos servidores da Vercel depois que o arquivo
//      terminou de subir (nao tem o cookie do navegador) - nao da pra exigir login aqui,
//      mas o proprio @vercel/blob ja valida que essa chamada e legitima (assinatura).
async function tratarUploadVideo(req, res, { requireUser }) {
  const body = req.body;

  const jsonResponse = await handleUpload({
    body,
    request: req,
    onBeforeGenerateToken: async () => {
      const user = await requireUser(req, res, { roles: ['admin', 'owner'] });
      if (!user) {
        // requireUser ja respondeu 401/403 - lanca para o handleUpload abortar o fluxo.
        throw new Error('Nao autorizado a enviar videos.');
      }
      return {
        allowedContentTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
        addRandomSuffix: true,
        maximumSizeInBytes: 500 * 1024 * 1024, // 500MB por video, ajustavel se precisar
      };
    },
    onUploadCompleted: async () => {
      // Nao precisa fazer nada aqui - a URL final do blob e devolvida direto pro
      // navegador do admin, que a usa para preencher o campo "video_url" da etapa.
    },
  });

  res.status(200).json(jsonResponse);
}

module.exports = { tratarUploadVideo };
