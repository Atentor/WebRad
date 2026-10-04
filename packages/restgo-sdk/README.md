# SDK nativo RestGo

Cliente TypeScript para aplicações de navegador. O contrato segue `web/docs.html` e os handlers atuais do projeto RestGo; o pacote não depende do designer, Electron ou Node.js.

```ts
import { createClient } from '@webrad/restgo-sdk';

const restGo = createClient('https://api.exemplo.com', {
  apiVersion: 1,
  defaultDatabase: 'clientes',
  persistSession: true,
  sessionStorage: 'local',
});

const login = await restGo.auth.signInWithPassword({
  email: 'ana@exemplo.com',
  password: 'senha-do-usuario',
});
if (login.error) throw login.error;

const clientes = await restGo.from<{ id: number; nome: string }[]>('listar').get({
  query: { ativo: true },
  page: 1,
});
if (clientes.error) throw clientes.error;
```

Cada operação retorna `{ data, error }`, discriminado por `error`. Falhas HTTP incluem `error.status`; falhas de rede e cancelamento usam `NETWORK_ERROR` e `ABORTED`. APIs dinâmicas devolvem o conteúdo de `data` junto dos metadados `page`, `total_pages`, `has_more` e `next_cursor`, conforme o modo solicitado.

## Autenticação

- `auth.signInWithPassword({ email, password, remember? })` chama `POST /auth/token`.
- `auth.ready` valida as credenciais persistidas ao criar o cliente. `auth.getSession()` e `auth.getUser()` consultam `GET /auth/session`. A data `expiresAt` é metadado; a sessão em memória do servidor determina sua validade.
- `auth.setSession({ token, expiresAt })` valida a sessão no servidor antes de substituir a atual.
- `auth.signOut()` revoga o JWT atual por `POST /auth/logout`. Falhas temporárias mantêm a sessão para permitir uma nova tentativa.
- `auth.signUp({ email, password, fullName?, active? })` cria um usuário comum por `POST /auth/users`. Requer `apiToken` configurado explicitamente no cliente e retorna o usuário criado, sem login automático.
- `auth.resetPasswordForEmail(email, { url? })`, `auth.confirmPasswordReset({ token, password })` e `auth.confirmEmail(token)` usam os endpoints públicos correspondentes.
- `auth.uploadAvatar(blob, { name?, signal? })` e `auth.deleteAvatar()` usam `/auth/avatar`. A normalização da imagem acontece no RestGo.
- `auth.onAuthStateChange((event, session) => {})` retorna `{ unsubscribe }`. Os eventos são `INITIAL_SESSION`, `SIGNED_IN`, `SIGNED_OUT`, `SESSION_VALIDATED` e `USER_UPDATED`.

As opções `persistSession`, `sessionStorage: 'local' | 'session' | 'memory'` e `storageKey` controlam a persistência opcional dos tokens. Cada registro fica vinculado à URL normalizada do servidor. Dados antigos sem essa identificação e credenciais de outro servidor nunca são enviados. Indisponibilidade do armazenamento permite continuar em memória. Erros de login público, tokens de API inválidos e falhas de rede não encerram uma sessão válida.

O RestGo atual não oferece refresh token, OAuth ou edição de perfil pelo próprio usuário. A gestão de usuários, tokens e reenvio de confirmação exige as APIs administrativas do servidor. O SDK de navegador não solicita nem configura a credencial master.

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
- `storage.download(id, { range?, public?, signal? })` retorna `Blob` e suporta Range. Sem sessão, a chamada permite baixar arquivos públicos; arquivos privados continuam sujeitos à autorização do servidor.
- `storage.getPublicUrl(id)` retorna `{ data: { publicUrl }, error: null }`. A URL funciona publicamente somente quando o arquivo tem `isPublic: true`; ela não altera permissões.

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

Os nomes representam endpoints publicados pelo RestGo. Seleção direta de tabelas, SQL remoto e operações de buckets não integram esse contrato.
