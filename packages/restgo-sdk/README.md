# SDK nativo RestGo

O serviço `videos` implementa upload binário resumível com SHA-256, progresso confirmado, checkpoints verificados, renovação de sessão e espera explícita do processamento. Também oferece biblioteca, metadados, tarefas, descritor HLS e thumbnail. Consulte [Video Upload](../../docs/video-upload.md) para exemplos. As rotas nativas usam JWT de Authentication; consultas públicas a HLS/thumbnail selecionam explicitamente `{ public: true }`.

Cliente TypeScript para aplicações de navegador. O pacote não depende do designer, Electron ou Node.js. O cadastro público requer que o RestGo permita `POST /auth/users` sem `Authorization`; enquanto o servidor exigir credencial nessa rota, ele rejeitará o cadastro com 401.

```ts
import { createClient } from '@webrad/restgo-sdk';

const restGo = createClient('https://api.exemplo.com', {
  apiVersion: 1,
  defaultDatabase: 'clientes',
  persistSession: true,
  sessionStorage: 'local',
});

const login = await restGo.login('ana@exemplo.com', 'senha-do-usuario');
if (login.error) throw login.error;

const clientes = await restGo.from<{ id: number; nome: string }[]>('listar').get({
  query: { ativo: true },
  page: 1,
});
if (clientes.error) throw clientes.error;
```

Cada operação retorna `{ data, error }`, discriminado por `error`. Falhas HTTP incluem `error.status`; falhas de rede e cancelamento usam `NETWORK_ERROR` e `ABORTED`. APIs dinâmicas devolvem o conteúdo de `data` junto dos metadados `page`, `total_pages`, `has_more` e `next_cursor`, conforme o modo solicitado.

## Autenticação

- Atalhos diretos: `login(email, password, remember = false)`, `logout()`, `getSession()`, `getUser()`, `refreshSession()` e `onAuthStateChange(callback)`. Eles usam a mesma instância de `auth`, com persistência, renovação e eventos compartilhados. As operações assíncronas retornam `{ data, error }`; a assinatura de eventos retorna `{ unsubscribe }`. Na aplicação WebRAD, use `RestGO.login(email, senha)` diretamente nos eventos.
- `auth.signInWithPassword({ email, password, remember? })` chama `POST /auth/token` sem `Authorization`, mesmo com `apiToken` configurado ou uma sessão existente. Uma rejeição do login não revalida nem repete a sessão anterior.
- `auth.ready` valida as credenciais persistidas ao criar o cliente, renovando um JWT expirado quando existe refresh token. `auth.getSession()` e `auth.getUser()` consultam `GET /auth/session`. O servidor determina a validade da sessão.
- `auth.refreshSession()` renova por `POST /auth/refresh`, enviando somente `{ refreshToken }` no JSON, sem header de autorização. A resposta substitui `token`, `expiresAt`, `refreshToken`, `refreshExpiresAt` e a identidade do usuário.
- A renovação automática é habilitada por padrão: antes da expiração, antes de chamadas com JWT expirado e após uma rejeição autoritativa da sessão. Uma chamada protegida rejeitada com 401 pode ser repetida uma vez com o novo JWT. `autoRefreshToken: false` desativa esse comportamento, mantendo a renovação manual disponível.
- `auth.setSession({ token, expiresAt, refreshToken?, refreshExpiresAt? })` valida a sessão no servidor antes de substituir a atual. As duas propriedades de refresh devem ser fornecidas juntas; um JWT expirado pode ser renovado durante a importação.
- `auth.signOut()` revoga o JWT atual por `POST /auth/logout`. Falhas temporárias mantêm a sessão para permitir uma nova tentativa.
- `auth.signUp({ email, password, fullName?, active? })` envia cadastro por `POST /auth/users` sem `Authorization`, mesmo com token de API ou sessão existente. Não exige `apiToken` no cliente. O servidor precisa permitir cadastro público e controlar a criação de usuários comuns. Retorna o usuário criado, sem login automático.
- `auth.resetPasswordForEmail(email, { url? })`, `auth.confirmPasswordReset({ token, password })` e `auth.confirmEmail(token)` usam os endpoints públicos correspondentes.
- `auth.uploadAvatar(blob, { name?, signal? })` e `auth.deleteAvatar()` usam `/auth/avatar`. A normalização da imagem acontece no RestGo.
- `auth.onAuthStateChange((event, session) => {})` retorna `{ unsubscribe }`. Os eventos são `INITIAL_SESSION`, `SIGNED_IN`, `SIGNED_OUT`, `SESSION_VALIDATED`, `TOKEN_REFRESHED` e `USER_UPDATED`.

As opções `persistSession`, `sessionStorage: 'local' | 'session' | 'memory'` e `storageKey` controlam a persistência opcional dos tokens. Cada registro fica vinculado à URL normalizada do servidor. Dados antigos sem essa identificação e credenciais de outro servidor nunca são enviados. Indisponibilidade do armazenamento permite continuar em memória. Erros de login público, tokens de API inválidos e falhas de rede não encerram uma sessão válida.

Refresh tokens são de uso único. O SDK reúne chamadas simultâneas e usa Web Locks para coordenar clientes e abas com a mesma instância e chave de armazenamento local. Essa modalidade exige um contexto seguro com Web Locks, como HTTPS ou localhost; caso indisponível, retorna `REFRESH_LOCK_UNAVAILABLE` sem consumir o token. Use armazenamento da aba ou memória nesses ambientes. Copiar manualmente o mesmo refresh token para contextos sem armazenamento compartilhado exige coordenação externa.

401 no refresh encerra a sessão. Falhas de rede, 429 e 5xx preservam as credenciais, com tentativas automáticas em intervalos crescentes e respeito a `Retry-After` (`error.retryAfterMs`). Uma resposta perdida após a rotação pode exigir novo login na próxima tentativa. Sessões antigas sem refresh continuam funcionando até serem rejeitadas pelo servidor; faça novo login para obter o par completo. `client.dispose()` interrompe timers e listeners sem revogar a sessão.

OAuth e edição de perfil pelo próprio usuário não fazem parte desses contratos. A gestão de usuários, tokens e reenvio de confirmação exige as APIs administrativas do servidor. O SDK de navegador não solicita nem configura a credencial master.

## Storage

```ts
const uploaded = await restGo.storage.upload(file, {
  name: 'documento.pdf',
  isPublic: false,
});
if (uploaded.error) throw uploaded.error;

const downloaded = await restGo.storage.download(uploaded.data.id);
const removed = await restGo.storage.remove(uploaded.data.id);
```

- `storage.list({ page?, pageSize?, q?, ownerId?, signal? })` preserva a lista original ou o envelope paginado `{ data, page, page_size, has_more }` do servidor.
- `storage.get(id)`, `storage.update(id, { file?, name?, isPublic?, ownerId? })`, `storage.remove(id)` e `storage.usage()` usam a sessão JWT.
- `storage.upload(blob, options)` e `storage.update(id, options)` enviam multipart. O navegador define o boundary automaticamente.
- As duas operações aceitam `onUploadProgress: ({ loaded, total, percentage, lengthComputable }) => void`. Os bytes medidos incluem o multipart inteiro, além do arquivo. `total` e `percentage` são `null` quando o navegador não informa o total; 100% significa que o corpo foi enviado, e o resultado assíncrono ainda precisa confirmar o armazenamento no servidor. Uma repetição após renovar o JWT inicia outra medição.
- `storage.download(id, { range?, public?, signal? })` retorna `Blob` e suporta Range. Sem sessão, a chamada permite baixar arquivos públicos; arquivos privados continuam sujeitos à autorização do servidor.
- `storage.getPublicUrl(id)` retorna `{ data: { publicUrl }, error: null }`. A URL funciona publicamente somente quando o arquivo tem `isPublic: true`; ela não altera permissões.

O progresso real usa `XMLHttpRequest.upload` somente quando solicitado, em uma página HTTP(S), para um servidor de outra origem, com `withCredentials: false`. Na mesma origem, fora do navegador ou quando o cliente recebe um `fetch` personalizado, o envio mantém `fetch` com `credentials: 'omit'` e `redirect: 'error'`, e o callback informa uma medição indeterminada (`percentage: null`). Nenhuma porcentagem intermediária é simulada.

Configure a URL final do RestGo, sem redirecionamento: o transporte XHR pode seguir redirecionamentos antes de expor a URL final, e o SDK rejeita respostas cuja URL final difere da solicitação. Essa verificação não impede a primeira requisição redirecionada nem identifica uma cadeia que retorna à URL original. O navegador remove `Authorization` em redirecionamentos entre origens. As chamadas sem acompanhamento de progresso preservam a rejeição antecipada de redirecionamentos do `fetch`.

## Endpoints publicados

```ts
const result = await restGo.api
  .from('clientes')
  .endpoint('buscar')
  .post({ cliente_id: 42 }, { version: 2, auth: 'session' });

const cursorPage = await restGo.from('listar').get({
  pagination: 'cursor',
  cursorColumn: 'id',
  cursor: previousPage.next_cursor,
});
```

`get`, `post`, `put`, `patch`, `delete`, `head` e `options` usam `/v{version}/{database}/{endpoint}`. `post`, `put`, `patch` e `delete` recebem `(body?, options?)`; os outros recebem `(options?)`. `RestGoDynamicOptions` aceita query, paginação `exact`/`simple`/`cursor`, coluna e cursor, versão, headers e AbortSignal.

Endpoints configurados com autenticação JWT exigem `auth: 'session'`; endpoints configurados para token de API exigem `auth: 'apiToken'` e uma opção `apiToken` explícita no cliente. O padrão `auto` escolhe a sessão atual quando disponível, depois o token de API configurado. Não há tentativa automática com outro tipo de credencial. Uma rejeição de JWT por um endpoint dinâmico é confirmada em `/auth/session` antes de encerrar a sessão, pois o endpoint pode exigir outro tipo de token.

No WebRAD, configure esse token opcional em **RestGo integration > Connection > Application API token**, sem `Bearer`, apenas quando uma API dinâmica precisar dele. Essas chamadas automáticas usam o token antes do login e depois do logout; durante a sessão usam `Bearer <JWT>`. Cadastro e login sempre omitem esse header. Para autenticação e cadastro públicos, deixe o campo vazio. Um token preenchido faz parte do projeto e do JavaScript gerado, portanto deve ser apropriado para exposição no navegador.

Os nomes representam endpoints publicados pelo RestGo. Seleção direta de tabelas, SQL remoto e operações de buckets não integram esse contrato.
