# Video Upload

`Video Upload` é um serviço não visual da paleta **Nonvisual**, representado na bandeja do Designer. A classe `WebVideoUpload` é instanciada separadamente em cada página ou posicionamento de componente reutilizável. O envio usa o módulo `/videos` do RestGo, com sessão Authentication e renovação compartilhada; arquivos comuns continuam no componente File Upload.

Configure a conexão RestGo e autentique o usuário antes de enviar. A seleção não faz login, não cria sessão de upload e não envia dados.

```ts
const login = await RestGO.login('usuario@exemplo.com', 'senha');
if (!login.sucess) throw login.error;

VideoUpload1.maxFileSizeMB = 100;
VideoUpload1.maxDurationSeconds = 60;
const selection = await VideoUpload1.OpenFile();
if (!selection) return;

const video = await this.VideoUpload1.SendToRestGO({
  title: 'Aula 1',
  descri: 'Introdução',
  isPublic: false,
});
// A resposta confirma o original; a conversão pode continuar no servidor.
const ready = await VideoUpload1.WaitUntilReady({ timeoutMs: 600_000 });
```

Chame `OpenFile()` a partir de uma interação do usuário. Cancelar o seletor retorna `null` e preserva a seleção anterior. A seleção contém `name`, `path`, `size`, `extension` e `duration`; `size` está em bytes, `duration` em segundos e `path` pode ser `null`. O navegador não fornece um caminho local absoluto.

| Propriedade no Inspector   | API                  | Efeito                                                                                         |
| -------------------------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| Accepted video types       | `accept`             | Filtro do seletor; padrão `.mp4,.mov,.mkv,.webm`. A validação também rejeita outras extensões. |
| Enabled                    | `enabled`            | Permite seleção e início/retomada de envio. Não cancela uma operação já iniciada.              |
| Title / Description        | `title` / `descri`   | Metadados padrão, sobrescritos pelas opções de envio.                                          |
| Public video               | `isPublic`           | Padrão `false`. Publicação exige habilitação no servidor.                                      |
| Chunk size (bytes)         | `chunkSizeBytes`     | Padrão 8 MiB; limitado pelo `maxChunkBytes` da sessão.                                         |
| Maximum file size (MB)     | `maxFileSizeMB`      | Limite local opcional: 1 MB = 1024² bytes. Vazio/`null` desabilita.                            |
| Maximum duration (seconds) | `maxDurationSeconds` | Limite local opcional de duração. Vazio/`null` desabilita.                                     |

Os limites devem ser positivos. São verificados na seleção e novamente antes do envio, inclusive se alterados por código. A duração vem de `loadedmetadata` de um elemento de vídeo sem reprodução. Se o navegador não conseguir decodificar os metadados (por exemplo, um codec/container não suportado), `duration` será `null`; com limite de duração ativo, a seleção falha com uma mensagem explícita. URLs de objeto são revogadas após inspeção e cancelamento. Metadados locais são uma validação da aplicação: não alteram os limites globais, não substituem FFprobe e não constituem uma política de segurança do servidor. O RestGo mantém seus próprios limites de tamanho, quota, formatos e processamento.

`SendToRestGO()` e `Resume()` retornam `Promise<RestGoVideo>`. Durante envio, chamadas concorrentes compartilham a Promise ativa. Cada bloco é binário (`PUT /videos/uploads/{id}/chunks`), com `Upload-Offset` e SHA-256 hexadecimal; o offset confirmado determina a retomada. Criações não são repetidas automaticamente quando a resposta é incerta. Falhas transitórias e conflitos têm tentativas limitadas, consulta do offset e espera progressiva. Finalização é idempotente pelo ID da sessão. Cookies e credenciais administrativas não são enviados.

`Pause()` aborta apenas a operação local; `Resume()` continua a sessão existente. Uma pausa durante hashing pode retomar a preparação sem sessão criada. Durante a criação, a pausa aguarda a resposta para preservar o ID da sessão antes de interromper; isso evita uma criação duplicada. `CancelUpload()` cancela explicitamente a sessão aberta no servidor e agenda a exclusão. Sessões concluídas devem ser removidas por `RestGO.videos.remove(videoId)`. `Clear()` e `dispose()` interrompem I/O local sem excluir dados remotos. Antes de iniciar outro vídeo no mesmo componente, use `Clear()`; um upload com checkpoint existente deve usar `Resume()`.

Para retomar depois de reload, salve `resumeToken` no armazenamento da aplicação, selecione novamente o arquivo original e chame `Resume({ resumeToken })`. O checkpoint contém servidor, dono, IDs, nome, tamanho, data e uma impressão SHA-256 calculada por partes sobre todos os bytes. Não contém tokens de autenticação ou `File`. A retomada rejeita outro servidor, outro usuário e conteúdo diferente, inclusive arquivos com o mesmo nome, tamanho e data. Não há persistência automática de checkpoints nem de arquivos no Project Model.

`state` distingue seleção, hashing, envio, pausa, finalização e espera. `confirmedBytes`, `totalBytes` e `percentage` representam dados confirmados; `OnProgress.detail.chunk` contém a medição transitória da requisição, possivelmente indeterminada. Web Crypto exige HTTPS ou localhost. O hashing usa memória limitada e também percorre o arquivo antes de uma retomada para verificar sua identidade.

| Evento                 | Significado                                                                   |
| ---------------------- | ----------------------------------------------------------------------------- |
| `OnChange`             | Seleção validada ou limpeza local.                                            |
| `OnStateChange`        | Estado anterior e atual.                                                      |
| `OnProgress`           | Bytes e percentual confirmados, mais medição transitória do bloco.            |
| `OnUploadComplete`     | Original aceito; não implica HLS pronto.                                      |
| `OnProcessingProgress` | Registro do vídeo e tarefas durante a espera explícita.                       |
| `OnReady`              | Estado ready com geração publicada e descritor HLS confirmado.                |
| `OnError`              | Erro de validação/rede/processamento. Pausa local não emite erro.             |
| `OnComplete`           | Término da operação de upload, processamento ou cancelamento, com vídeo/erro. |

Handlers recebem `sender: WebVideoUpload` e detalhes tipados em `CustomEvent`. Os membros ficam disponíveis por `VideoUpload1` e `this.VideoUpload1`, com completion, hover, assinaturas e diagnósticos do Monaco.

`RestGO.videos` expõe sessões/chunks, upload e retomada, biblioteca, metadados completos, exclusão, processamento/reprocessamento/cancelamento, descritor HLS e thumbnail. Os tipos de resposta são validados. URLs absolutas do descritor preservam o prefixo do proxy sem substituir os caminhos originais. Configurações administrativas do módulo não são acessadas pelo componente.

`WaitUntilReady()` não inicia processamento automaticamente. Quando a configuração do servidor desabilita processamento automático, execute `RestGO.videos.process(video.id)` explicitamente. A espera é cancelável, tem timeout e termina em falha/cancelamento. Ela acompanha a disponibilidade atual do vídeo; para controlar uma tarefa específica de reprocessamento, acompanhe o `jobId` retornado e os detalhes de `RestGO.videos.get()`. Um player visual não integra este componente.

Testes incluem SDK/contrato, limites e ciclo de vida do runtime, persistência, Registry, Monaco, execução de Preview compilado e isolamento de reutilizáveis. O teste opcional `tests/video-upload.browser.test.ts` executa a aplicação compilada em Chrome com WebM real, leitura de duração, rejeição por tamanho/duração, checksum binário HTTP, pausa, reconciliação e retomada. O servidor desse teste reproduz o contrato; ele não comprova conversão FFmpeg em uma instância RestGo real.
