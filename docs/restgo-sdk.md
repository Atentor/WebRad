# SDK nativo do RestGO

O pacote `@webrad/restgo-sdk` implementa os contratos de `RestGo/web/docs.html` e dos handlers correspondentes de autenticação, Storage e APIs dinâmicas. Utiliza `fetch`, `FormData`, `Blob` e APIs padrão do navegador. O Preview e a aplicação compilada utilizam o mesmo cliente, sem dependências de Electron ou Node.js.

## Configuração no WebRAD

Abra **Project Settings > Authentication and JWT** ou **APIs and integrations**. As duas abas editam a mesma conexão:

- Ative **Enable native RestGO integration** e informe a URL HTTP(S) da instância. Um caminho de reverse proxy, como `https://exemplo.com/backend`, é preservado.
- Escolha a versão dos endpoints dinâmicos e, opcionalmente, o slug do banco padrão.
- Configure persistência em armazenamento local, armazenamento da aba ou memória. A chave deve distinguir aplicações hospedadas na mesma origem.
- Clique em **Save changes** e salve o projeto normalmente. A conexão é persistida em `settings.restGo` no arquivo `.wrproj`.

O compilador configura `RestGO` antes de construir as páginas. Esse cliente é compartilhado entre os eventos e as navegações da aplicação. Acessá-lo com a integração desativada gera `RestGoNotConfiguredError`, com indicação de onde configurá-la.

## Login e sessão

Em um método de evento da página:

```ts
const { data: session, error } = await RestGO.auth.signInWithPassword({
  email: this.Email.text,
  password: this.Senha.text,
  remember: true,
});

if (error) {
  Message(error.message);
  return;
}

Message(`Olá, ${session.user.fullName}`);
Navigate('PageHome');
```

Os componentes `Email` e `Senha` desse exemplo devem existir na página. `remember` é enviado ao RestGO, que determina a validade do JWT conforme sua configuração.

```ts
const initial = await RestGO.auth.ready;
const { data: session, error } = await RestGO.auth.getSession();
const { data: user } = await RestGO.auth.getUser();

const subscription = RestGO.auth.onAuthStateChange((event, currentSession) => {
  // Atualize a interface conforme a sessão validada e o evento recebido.
});

subscription.unsubscribe();
await RestGO.auth.signOut();
```

`auth.ready` conclui a validação inicial das credenciais persistidas. `getSession()` consulta `GET /auth/session` e retorna a identidade atual do servidor, ou `null` quando não há sessão. `expiresAt` serve como metadado para a interface; não comprova que a sessão continua válida. Logout, alterações administrativas e reinício do RestGO podem revogar uma sessão antes desse horário.

O SDK normaliza os erros em `{ data, error }`. `error` contém `message`, `code`, `status` e detalhes quando disponíveis. Falhas de rede e respostas 5xx preservam a credencial para uma nova tentativa. Um 401 que invalida o JWT remove a sessão; falhas em login, chamadas públicas e chamadas com token de API não removem uma sessão válida. Em um endpoint dinâmico, um 401 usando JWT leva à revalidação da sessão, pois o endpoint pode exigir outra modalidade de credencial.

A persistência guarda a credencial e seus metadados, vinculados à instância. A identidade restaurada vem da validação do servidor. O armazenamento em memória funciona quando a persistência está desativada ou o navegador bloqueia o acesso ao armazenamento.

## Cadastro, recuperação, confirmação e avatar

| Método                                                 | Contrato RestGO                                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `auth.signUp({ email, password, fullName?, active? })` | `POST /auth/users`; exige um token de API ativo configurado explicitamente e não inicia sessão |
| `auth.setSession({ token, expiresAt })`                | Valida a credencial em `GET /auth/session` antes de adotar a sessão                            |
| `auth.resetPasswordForEmail(email, { url? })`          | `POST /auth/password-reset/request`                                                            |
| `auth.confirmPasswordReset({ token, password })`       | `POST /auth/password-reset/confirm`                                                            |
| `auth.confirmEmail(token)`                             | `POST /auth/email-confirmation/confirm`                                                        |
| `auth.uploadAvatar(blob, { name?, signal? })`          | `PUT /auth/avatar`, multipart com `file`                                                       |
| `auth.deleteAvatar()`                                  | `DELETE /auth/avatar`                                                                          |

O RestGO exige autorização para cadastrar usuários. O cliente nativo do projeto não armazena token administrativo nem token de API. Um serviço no servidor pode usar o SDK com `apiToken` para implementar um cadastro autorizado. Esse token concede os acessos configurados no RestGO e deve permanecer no servidor. A gestão administrativa de contas e o reenvio administrativo de confirmação continuam nas rotas administrativas do RestGO.

A recuperação permite `url` HTTP(S) opcional para o destino do link; sem ela, utiliza a URL configurada no RestGO. O envio de e-mail depende do SMTP do servidor. Os tokens de recuperação e confirmação têm uso único. O avatar aceita JPEG, PNG e WebP; o RestGO produz uma imagem pública JPEG de 512 × 512 pixels e retorna `avatarUrl`.

## Storage

```ts
const uploaded = await RestGO.storage.upload(file, {
  name: 'documento.pdf',
  isPublic: false,
});
if (uploaded.error) throw uploaded.error;

const metadata = await RestGO.storage.get(uploaded.data.id);
const download = await RestGO.storage.download(uploaded.data.id);
if (download.error) throw download.error;
const objectUrl = URL.createObjectURL(download.data);
// Use objectUrl na interface e libere-o com URL.revokeObjectURL quando terminar.
```

| Método                                                               | Operação                                                                |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `storage.list({ page?, pageSize?, q?, ownerId?, signal? })`          | Lista arquivos próprios e preserva o envelope de paginação do RestGO    |
| `storage.upload(blob, { name?, isPublic?, ownerId?, signal? })`      | Envia um arquivo multipart                                              |
| `storage.get(id)`                                                    | Consulta metadados privados                                             |
| `storage.update(id, { file?, name?, isPublic?, ownerId?, signal? })` | Atualiza metadados e/ou conteúdo                                        |
| `storage.remove(id)`                                                 | Exclui o arquivo; sucesso 204 retorna `data: null`                      |
| `storage.download(id, { range?, public?, signal? })`                 | Retorna `Blob`; permite Range e download público sem JWT                |
| `storage.getPublicUrl(id)`                                           | Constrói `{ data: { publicUrl }, error: null }` sem solicitar o arquivo |
| `storage.usage()`                                                    | Retorna espaço utilizado, capacidade e espaço disponível                |

`getPublicUrl()` não torna um arquivo público. O servidor continua verificando `isPublic`. Arquivos privados exigem JWT do dono ou autorização administrativa; tokens de API dinâmica não autorizam Storage. `ownerId` não amplia os direitos do usuário. O RestGO bloqueia a alteração de arquivos de avatar pelas rotas genéricas de Storage.

## APIs dinâmicas e API Operations

O SDK chama endpoints publicados em `/v{versao}/{banco}/{endpoint}`. API Operations utilizam essas mesmas rotas. Defina um tipo para o conteúdo retornado:

```ts
interface Cliente {
  id: number;
  nome: string;
}

const result = await RestGO.api
  .from('clientes')
  .endpoint<Cliente[]>('listar')
  .get({ query: { ativo: true }, page: 1, pagination: 'simple' });

if (result.error) throw result.error;
const clientes = result.data;
const temMais = result.has_more;

// Utiliza o banco padrão configurado no projeto.
await RestGO.api.endpoint('cadastrar').post({ nome: 'Maria' });
```

`get`, `post`, `put`, `patch`, `delete`, `head`, `options` e `request` utilizam os métodos HTTP publicados no RestGO. `data` contém o conteúdo do envelope do servidor. `page`, `total_pages`, `has_more` e `next_cursor` permanecem disponíveis no resultado quando o servidor os retorna.

```ts
const page = await RestGO.api.from('clientes').endpoint<Cliente[]>('listar').get({
  pagination: 'cursor',
  cursorColumn: 'id',
  cursor: previousCursor,
});
```

Os modos de paginação são `exact`, `simple` e `cursor`. Cursor exige coluna única, estável e não nula definida no SQL; a chamada seguinte mantém endpoint, método, coluna e filtros. Os parâmetros JSON prevalecem sobre valores homônimos da query, conforme o contrato do RestGO. A versão pode ser escolhida na criação do endpoint ou nas opções da chamada.

`auth: 'auto'` utiliza o JWT quando disponível e, na ausência dele, o token de API configurado explicitamente. Use `auth: 'session'`, `'apiToken'` ou `'none'` para escolher a modalidade. Um endpoint RestGO com autenticação JWT habilitada exige JWT; um endpoint com essa autenticação desabilitada exige token de API. Essa opção do servidor não significa acesso público anônimo.

## Uso independente

```ts
import { createClient } from '@webrad/restgo-sdk';

const restgo = createClient('https://api.exemplo.com', {
  apiVersion: 1,
  defaultDatabase: 'clientes',
  persistSession: true,
  sessionStorage: 'local',
  storageKey: 'portal-cliente-restgo',
});

await restgo.auth.signInWithPassword({ email, password });
```

O pacote é um workspace fonte TypeScript deste repositório, sem publicação automática no npm. O compilador do WebRAD resolve seu import diretamente e inclui o código na aplicação. As opções permitem injetar `fetch` para testes ou outros ambientes compatíveis.

As chamadas são feitas diretamente pelo navegador. Configure no RestGO as origens, métodos e headers permitidos, incluindo `Authorization` e os headers de paginação utilizados. O SDK segue os recursos existentes: renovação automática por refresh token, OAuth, MFA, Realtime e consulta arbitrária a tabelas exigiriam novos contratos no backend.
