# SDK nativo do RestGO

O pacote `@webrad/restgo-sdk` utiliza `fetch`, `FormData`, `Blob` e APIs padrão do navegador para autenticação, Storage e APIs dinâmicas. O Preview e a aplicação compilada utilizam o mesmo cliente, sem dependências de Electron ou Node.js. O SDK está preparado para cadastro público; a instância RestGo precisa permitir `POST /auth/users` sem `Authorization` para esse fluxo funcionar.

## Configuração no WebRAD

Abra **RestGo integration** pelo ícone de banco no menu vertical esquerdo. A seção **Connection** reúne a configuração usada pelo SDK e uma conexão administrativa exclusiva do WebRAD.

- Ative **Enable native RestGO integration** e informe a URL HTTP(S) da instância. Um caminho de reverse proxy, como `https://exemplo.com/backend`, é preservado.
- Deixe **Application API token** vazio para cadastro e login públicos. O campo é opcional para APIs dinâmicas que precisam de token de API; nesse caso, informe o valor sem `Bearer`. Ele é salvo em `settings.restGo.apiToken` e usado como `Authorization: <token>` em chamadas automáticas a essas APIs quando não existe sessão. Cadastro e login não o enviam.
- Escolha a versão de cada requisição no API Client e, opcionalmente, o slug do banco padrão na conexão.
- Configure persistência em armazenamento local, armazenamento da aba ou memória. A chave deve distinguir aplicações hospedadas na mesma origem.
- Clique em **Save changes** e salve o projeto normalmente. A conexão é persistida em `settings.restGo` no arquivo `.wrproj`.

O compilador configura `RestGO` antes de construir as páginas. Esse cliente é compartilhado entre os eventos e as navegações da aplicação. Acessá-lo com a integração desativada gera `RestGoNotConfiguredError`, com indicação de onde configurá-la.

As chamadas a APIs dinâmicas com autorização automática usam o JWT da sessão como `Authorization: Bearer <JWT>` quando o usuário está autenticado. Sem sessão, incluindo após logout, usam o token configurado sem `Bearer`. Não há repetição com outro tipo de credencial após rejeição. Cadastro (`POST /auth/users`) e login (`POST /auth/token`) sempre omitem `Authorization`, inclusive quando existe token configurado ou sessão. Falhas nessas operações não encerram uma sessão válida. `POST /auth/refresh` e as operações públicas de recuperação/confirmação também não enviam esse header; operações protegidas preservam o contrato do endpoint.

O token configurado é incluído no projeto, no Preview e no JavaScript gerado, ficando acessível no navegador. Utilize um token de API apropriado para a aplicação; mantenha `RESTGO_AUTHORIZATION` e outras credenciais administrativas no servidor.

## Administração de endpoints dentro do IDE

Na seção **Connection**, informe separadamente um API Token do RestGo com permissão administrativa. **Connect** verifica essa permissão antes de guardar a credencial. A conexão administrativa usa a URL salva para a integração; alterações na URL precisam ser aplicadas antes de conectar.

O token administrativo permanece no processo principal do Electron. Por padrão, vale somente durante a sessão do IDE. A opção de lembrar a conexão grava somente a credencial criptografada pelo armazenamento seguro do sistema operacional no perfil local do WebRAD; quando a criptografia segura não está disponível, a conexão permanece temporária. **Disconnect** também remove a credencial lembrada. Esse token nunca entra no `.wrproj`, nas operações do API Client, no Preview ou no Build.

Em **Endpoints**, crie ou edite um slug e uma versão, configure os métodos HTTP com SQL parametrizado ou selecione uma API Operation existente. Salvar persiste os endpoints na instância. Publicar vincula o grupo de slug/versão a um banco existente, define JWT, API Token ou acesso público e ativa os registros necessários. Os métodos do grupo compartilham a publicação e a política de autenticação segundo o contrato do RestGo. Alterações de estado e publicação afetam a instância imediatamente; o histórico local do Designer cobre apenas alterações dos componentes do projeto.

Ao abrir um endpoint já publicado, **Database** e **Required credential** vêm preenchidos com os valores salvos. Se houver várias publicações, o editor prioriza o banco padrão configurado na conexão; caso contrário, usa a primeira publicação. Selecionar outro banco carrega a política de autenticação já salva para ele.

**Published APIs** lista as rotas com banco, versão, método, autenticação e disponibilidade. Somente rotas ativas, com banco e endpoint ativos e API Operation disponível quando necessária, podem ser importadas. A busca ajuda a localizar APIs existentes.

Abra um componente **API Client** na página ou componente reutilizável e use **Import from RestGo** para selecionar as APIs publicadas. Para um cliente novo, adicione primeiro o componente pelo Designer. O importador preserva identificadores e operações existentes, preenche rota, versão, método e parâmetros de entrada e evita duplicar a mesma rota. Um cliente usa um único modo de autenticação; APIs com modos diferentes ficam em clientes separados. Converter um cliente personalizado exige confirmação explícita no importador do editor, e rotas que escapem da URL da integração são rejeitadas.

Se o acesso administrativo estiver desconectado ou o RestGo rejeitar a credencial, o importador permite informar outro **Administrative API token** e conectar sem fechar o editor. As requisições em edição são preservadas. A credencial recusada deixa de indicar uma conexão ativa; falhas temporárias de rede ou servidor não encerram o acesso. O token continua restrito ao IDE, com a opção de lembrar disponível somente quando há armazenamento seguro.

As conexões **RestGo JWT Authentication** (`restgo-session`), **RestGO API Token** (`restgo-api-token`) e **RestGO Public** (`restgo-public`) fixam a URL da integração e administram o header Authorization. JWT exige a sessão atual e nunca recorre a outro token. API Token usa exclusivamente `settings.restGo.apiToken`, sem `Bearer`, mesmo com usuário autenticado. Público omite Authorization e cookies. Todos os modos enviam requisições pelo `fetch` do navegador, preservam CORS e recusam redirecionamentos. Campos da resposta são inferidos após uma chamada real no editor; amostras, uploads e credenciais temporárias não são persistidos.

O corpo do API Client aceita placeholders `<nome>`, como `{"idinstancia": <idinstancia>, "chave": <chave>}`. A aba **Body** mostra os parâmetros automaticamente e permite definir tipo e valor de teste. Um nome repetido utiliza uma só entrada; remover o placeholder remove sua linha. Tipos são salvos com o template, enquanto os valores de teste ficam em memória. Na aplicação, passe os valores em `ApiClient1.execute('PutKey', { parameters: { idinstancia: 42, chave: 'valor' } })`. A substituição preserva números, booleanos, objetos, arrays e null, e escapa textos como JSON. Esses parâmetros não alteram o modo de autenticação.

## Login e sessão

Em um método de evento da página:

```ts
const log = await RestGO.login(this.Email.text.trim(), this.Senha.text, true);

if (!log.sucess) {
  Message(log.error.message);
  return;
}

Message(`Olá, ${log.data.user.fullName}`);
Navigate('PageHome');
```

Os componentes `Email` e `Senha` desse exemplo devem existir na página; `PageHome` é a página de destino após o login. O terceiro parâmetro é `remember`, opcional e `false` por padrão. Ele é enviado ao RestGO, que determina a validade do JWT e do refresh token conforme sua configuração. A persistência no navegador continua sendo definida em Project Settings.

`login()` retorna `{ sucess, data, error }`. O campo `sucess` é sempre booleano: `true` quando esse login autentica o usuário e retorna uma sessão válida, ou `false` em falhas de autenticação, rede, resposta inválida ou cancelamento. O tipo público `RestGoLoginResult` permite acessar `log.data.user` diretamente em `if (log.sucess)` e `log.error.message` no ramo de falha. A verificação existente por `error` também continua funcionando. Um login malsucedido retorna `sucess: false` mesmo quando existe uma sessão anterior ainda válida.

Para apenas entrar e navegar, o evento pode ser escrito assim:

```ts
const { error } = await RestGO.login(this.Email.text.trim(), this.Senha.text);
if (error) Message(error.message);
else Navigate('PageHome');
```

Os atalhos abaixo utilizam a mesma sessão, persistência e renovação automática do cliente `RestGO` e também estão disponíveis em clientes criados com `createClient()`:

| Atalho                                     | Resultado em `data`                           |
| ------------------------------------------ | --------------------------------------------- |
| `RestGO.login(email, password, remember?)` | Sessão autenticada, incluindo `user` e tokens |
| `RestGO.logout()`                          | Resultado da revogação da sessão              |
| `RestGO.getSession()`                      | Sessão validada no servidor ou `null`         |
| `RestGO.getUser()`                         | Usuário validado no servidor ou `null`        |
| `RestGO.refreshSession()`                  | Sessão e credenciais rotacionadas             |
| `RestGO.onAuthStateChange(callback)`       | Retorna `{ unsubscribe }` diretamente         |

As operações assíncronas retornam `{ data, error }`; o atalho `login()` também inclui `sucess`, com os tipos do SDK no autocompletar. Um erro de rede é um erro de consulta, e não prova de que o usuário saiu. Os métodos em `RestGO.auth` também permanecem disponíveis. Login não escolhe uma página de destino: o código do evento usa `Navigate()` para isso.

```ts
const initial = await RestGO.auth.ready;
const { data: session, error } = await RestGO.getSession();
const { data: user } = await RestGO.getUser();

const subscription = RestGO.onAuthStateChange((event, currentSession) => {
  // Atualize a interface conforme a sessão validada e o evento recebido.
});

subscription.unsubscribe();
await RestGO.logout();
```

`auth.ready` conclui a validação inicial das credenciais persistidas, renovando primeiro um JWT expirado quando existe refresh token. `getSession()` consulta `GET /auth/session` e retorna a identidade atual do servidor, ou `null` quando não há sessão. `expiresAt` agenda a renovação, mas não comprova que a sessão continua válida. Logout, alterações administrativas, redefinição de senha e reinício do RestGO podem revogar uma sessão antes desse horário.

O SDK normaliza os erros em `{ data, error }`. `error` contém `message`, `code`, `status`, detalhes e `retryAfterMs` quando disponíveis. Falhas de rede, 429 e respostas 5xx preservam a credencial para uma nova tentativa. Um 401 que invalida o JWT tenta renovar a sessão; um 401 no refresh remove a sessão. Falhas em login, chamadas públicas e chamadas com token de API não removem uma sessão válida. Em um endpoint dinâmico, um 401 usando JWT leva à revalidação da sessão, pois o endpoint pode exigir outra modalidade de credencial.

A persistência guarda a credencial e seus metadados, vinculados à instância. A identidade restaurada vem da validação do servidor. O armazenamento em memória funciona quando a persistência está desativada ou o navegador bloqueia o acesso ao armazenamento.

## Eventos de autenticação em Interaction

Selecione a página no **Builder**, abra **Interaction** e, no grupo **RestGO**, dê dois cliques em **OnLogin**, **OnLogout** ou **OnUnauthenticated**. O WebRAD cria o método TypeScript e salva a associação no Project Model. Os eventos com dados do usuário também recebem o import do tipo de detalhe. A conexão precisa estar ativada em Project Settings para receber notificações.

`OnLogin` recebe `event.detail.user` quando o login é concluído ou quando uma página é exibida com uma sessão autenticada já existente. `event.detail.restored` é `true` neste segundo caso. A validação e a renovação de token da mesma sessão não repetem o evento. `OnLogout` recebe o último usuário autenticado quando o SDK confirma logout ou revogação. Uma falha de rede não dispara logout. Páginas escondidas, fechadas ou descartadas param de observar a sessão; elementos reutilizáveis com esses eventos associados observam enquanto estão montados.

Os dois eventos fornecem apenas a identidade, sem tokens:

| Campo                 | Tipo             | Valor                    |
| --------------------- | ---------------- | ------------------------ |
| `user.id`             | `string`         | ID do usuário            |
| `user.fullName`       | `string`         | Nome completo            |
| `user.email`          | `string`         | E-mail                   |
| `user.avatarUrl`      | `string \| null` | URL do avatar, se houver |
| `user.active`         | `boolean`        | Conta ativa              |
| `user.emailConfirmed` | `boolean`        | E-mail confirmado        |

### Detectar ausência de usuário automaticamente

`OnUnauthenticated` dispara quando uma página é exibida sem sessão autenticada confirmada ou quando o SDK confirma que a sessão terminou, incluindo logout e revogação. Ele funciona mesmo quando a página nunca recebeu `OnLogin`. O evento recebe somente `sender`, sem exigir um usuário anterior.

Nas páginas que exigem login, crie o evento por **Interaction > RestGO > OnUnauthenticated** e coloque no corpo do método:

```ts
Navigate('PageLogin');
```

Substitua `PageLogin` pelo nome da página de login do projeto. Ela permite a entrada sem sessão; associe o redirecionamento às páginas que precisam de autenticação.

O runtime consulta a sessão ao exibir a página, a cada 30 segundos enquanto a aba está visível e ao retornar o foco ou a visibilidade da aba. Há um único timer por cliente compartilhado, e consultas concorrentes compartilham a validação do SDK. Logout confirmado dispara imediatamente; revogações no servidor são detectadas na próxima verificação ou operação autenticada. A renovação continua sendo tentada antes de concluir que uma credencial rejeitada encerrou a sessão.

O evento é emitido uma vez por período sem autenticação naquela página. Verificações repetidas não repetem o evento; um novo login permite uma nova notificação se a sessão terminar novamente. Esconder e exibir a página inicia uma nova observação. A página libera a assinatura ao esconder, fechar ou ser descartada; o monitor compartilhado termina quando o último observador sai. Integração desativada e erros de rede/429/5xx não são confirmação de ausência de sessão e não disparam o evento. Uma validação inicial que falha por rede também não gera um falso redirecionamento.

### Guardar os dados do usuário em variáveis

Para usar os valores somente dentro do evento, crie variáveis locais:

```ts
const { user } = event.detail;
const usuarioId = user.id;
const usuarioNome = user.fullName;
const usuarioEmail = user.email;
Message(`Olá, ${usuarioNome}`);
```

Para acessá-los em outros métodos da mesma página, declare campos dentro da classe, fora dos métodos, e preencha-os no evento. Exemplo completo para uma página chamada `PageMain`:

```ts
import type { WebPage, WebPageLoginEventDetail, WebPageLogoutEventDetail } from '@webrad/runtime';
import { PageMainGenerated } from './PageMain.generated';

export class PageMain extends PageMainGenerated {
  private usuarioId = '';
  private usuarioNome = '';
  private usuarioEmail = '';

  public async PageMainLogin(
    sender: WebPage,
    event: CustomEvent<WebPageLoginEventDetail>,
  ): Promise<void> {
    const { user } = event.detail;
    this.usuarioId = user.id;
    this.usuarioNome = user.fullName;
    this.usuarioEmail = user.email;
  }

  public async PageMainLogout(
    sender: WebPage,
    event: CustomEvent<WebPageLogoutEventDetail>,
  ): Promise<void> {
    this.usuarioId = '';
    this.usuarioNome = '';
    this.usuarioEmail = '';
  }
}
```

Edite os métodos criados por Interaction no arquivo da página; mantenha os outros métodos existentes. Os nomes dos métodos precisam coincidir com as associações em Interaction. Campos da classe duram enquanto aquela instância da página existe e são recriados ao navegar. O SDK compartilha a sessão entre páginas e preenche o `OnLogin` da próxima página com o usuário atual.

Para consultar o usuário em qualquer outro evento ou atualizar os valores a partir do servidor:

```ts
const { data: user, error } = await RestGO.getUser();
if (error) {
  Message(error.message);
  return;
}
if (!user) return; // Não existe sessão autenticada.

this.usuarioId = user.id;
this.usuarioNome = user.fullName;
this.usuarioEmail = user.email;
```

## Acesso direto ao usuário atual

Use `RestGO.CurrentUser` para ler a identidade atual sem `await`:

```ts
const usuario = RestGO.CurrentUser;
if (usuario) {
  Message(usuario.nome);
  // usuario.email, usuario.id, usuario.emailconfirmed, usuario.ativo
}
```

As propriedades são somente leitura: `nome`, `email` e `id` são strings;
`emailconfirmed` e `ativo` são booleanos. O objeto é uma cópia imutável da
última identidade confirmada pelo servidor. Cada leitura acompanha o estado
atual do SDK; uma variável já capturada mantém os valores daquele momento.
Login, restauração validada, renovação e validação da sessão atualizam a
identidade; logout ou revogação confirmada a limpam. Falhas de rede preservam
a última identidade confirmada.

Sem sessão ou enquanto a restauração inicial está pendente, retorna `null`.
Para aguardar a restauração, use `await RestGO.auth.ready`. A leitura não faz
requisições nem comprova que a sessão ainda é válida no servidor; para buscar
dados atualizados e validar a sessão, use `await RestGO.getUser()`.
O mesmo acesso está disponível nos clientes criados por `createClient()`.

## Renovação da sessão

Login e refresh retornam `token`, `expiresAt`, `refreshToken`, `refreshExpiresAt` e `user`. O SDK salva as quatro propriedades da credencial em um único registro e renova automaticamente antes da expiração do JWT. Também renova antes de uma chamada protegida com JWT expirado ou após uma rejeição autoritativa com 401. A chamada rejeitada pode ser repetida uma vez com o novo JWT, preservando JSON, multipart e download binário. Falhas de rede ou 5xx não provocam repetição de operações de escrita.

```ts
const { data: renewedSession, error } = await RestGO.refreshSession();

const subscription = RestGO.onAuthStateChange((event, session) => {
  if (event === 'TOKEN_REFRESHED' && session) {
    // A identidade atual também vem do servidor durante a renovação.
  }
});
```

`POST /auth/refresh` recebe somente `{ refreshToken }` no corpo JSON, sem senha, JWT ou token administrativo. Cada renovação consome o refresh token anterior e fornece um novo. As chamadas concorrentes no mesmo cliente compartilham a renovação. Clientes e abas que usam armazenamento local com a mesma URL/chave são coordenados por Web Locks e releem a credencial depois de obter o lock.

Armazenamento local compartilhado exige Web Locks em um contexto seguro, como HTTPS ou localhost. Sem essa API, a renovação retorna `REFRESH_LOCK_UNAVAILABLE` e preserva a sessão; escolha armazenamento da aba ou memória nesse ambiente. Se copiar um refresh token para outros processos ou contextos com armazenamento separado, coordene o uso externamente: o servidor não permite reutilização.

Falhas de rede, 429 e 5xx usam intervalos de tentativa crescentes, de 1 até 60 segundos, respeitando um `Retry-After` maior. Um refresh expirado, consumido ou revogado retorna 401 e exige novo login. Se o servidor concluir a rotação e a resposta se perder, o token antigo já terá sido consumido. Sessões anteriores sem refresh continuam sendo validadas como antes; um novo login obtém o par completo. O RestGO mantém sessões e digests em memória, portanto um reinício do backend também exige novo login.

`remember` continua sendo determinado pelo servidor, incluindo a validade do refresh token. Logout aguarda uma rotação em andamento e revoga a sessão atual. Em clientes independentes, `autoRefreshToken: false` permite controlar a renovação manualmente. `client.dispose()` encerra timers e listeners sem fazer logout; o runtime chama esse método ao substituir a conexão.

## Cadastro, recuperação, confirmação e avatar

| Método                                                                    | Contrato RestGO                                                                                 |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `auth.signUp({ email, password, fullName?, active? })`                    | `POST /auth/users` sem `Authorization`; requer cadastro público no servidor e não inicia sessão |
| `auth.setSession({ token, expiresAt, refreshToken?, refreshExpiresAt? })` | Valida em `GET /auth/session`; pode renovar um JWT expirado quando o par de refresh é informado |
| `auth.resetPasswordForEmail(email, { url? })`                             | `POST /auth/password-reset/request`                                                             |
| `auth.confirmPasswordReset({ token, password })`                          | `POST /auth/password-reset/confirm`                                                             |
| `auth.confirmEmail(token)`                                                | `POST /auth/email-confirmation/confirm`                                                         |
| `auth.uploadAvatar(blob, { name?, signal? })`                             | `PUT /auth/avatar`, multipart com `file`                                                        |
| `auth.deleteAvatar()`                                                     | `DELETE /auth/avatar`                                                                           |

`auth.signUp()` não exige token de aplicação e não envia o JWT atual. A instância RestGo deve aceitar cadastro público de usuários comuns em `POST /auth/users`. Até esse ajuste no servidor, o SDK envia a solicitação e retorna o erro HTTP recebido, como 401, sem bloquear localmente com `API_TOKEN_REQUIRED`. O cadastro retorna `{ data, error }` e não faz login automático. A gestão administrativa de contas e o reenvio administrativo de confirmação continuam nas rotas administrativas do RestGo.

```ts
const { data: usuario, error } = await RestGO.auth.signUp({
  email: 'ana@exemplo.com',
  password: 'senha-do-usuario',
  fullName: 'Ana',
});
if (error) Message(error.message);
```

A recuperação permite `url` HTTP(S) opcional para o destino do link; sem ela, utiliza a URL configurada no RestGO. O envio de e-mail depende do SMTP do servidor. Os tokens de recuperação e confirmação têm uso único. O avatar aceita JPEG, PNG e WebP; o RestGO produz uma imagem pública JPEG de 512 × 512 pixels e retorna `avatarUrl`.

## Storage

Para seleção e envio por código, use o componente não visual
[File Upload](file-upload.md). `OpenFile()` retorna os metadados locais;
`SendToRestGO()` retorna todos os campos de arquivo da API e a URL absoluta.
O evento `OnProgress` permite atualizar outros componentes pelo Monaco.

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

`storage.upload()` e `storage.update()` aceitam `onUploadProgress`, com
`loaded`, `total`, `percentage` e `lengthComputable`. O SDK mede o multipart
pelo XHR em envios entre origens HTTP(S), sem cookies. Na mesma origem, sem XHR
ou com `fetch` personalizado, conserva `credentials: 'omit'` e informa
`percentage: null`. Use a URL final do RestGo: XHR pode seguir redirecionamentos
antes de o SDK rejeitar uma URL final diferente. Sem acompanhamento de progresso,
o transporte `fetch` continua usando `redirect: 'error'`. Consulte as
[regras de progresso do SDK](../packages/restgo-sdk/README.md#storage).

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

## API Client vinculado ao usuário autenticado

No configurador do componente **API Client**, selecione **Connection > RestGo JWT Authentication**. A integração nativa deve estar habilitada. A URL base é a mesma de **RestGo integration**, incluindo um eventual prefixo de proxy, e não pode ser alterada nesse componente. O endpoint é relativo à base; por exemplo, `/v1/clientes/listar` com a base `https://api.exemplo.com/backend` chama `https://api.exemplo.com/backend/v1/clientes/listar`.

```ts
const login = await RestGO.login(email, senha);
if (login.error) throw login.error;

// LoadCustomers é uma operação configurada no componente.
const clientes = await this.ApiClient1.execute('LoadCustomers', {
  query: { ativo: true },
});
```

Antes de cada chamada, o API Client consulta a sessão compartilhada pelo SDK e envia o JWT vigente em `Authorization: Bearer <JWT>`. A validação pode renovar a sessão pelo contrato normal de refresh. Logout ou ausência de sessão impedem a chamada; esse vínculo não utiliza o token bruto de API. Uma resposta 401 do endpoint é entregue como erro HTTP, sem repetir automaticamente uma operação que pode alterar dados.

Headers personalizados não substituem o JWT. URLs absolutas, mudança de base, escape do prefixo e redirecionamentos são bloqueados. Os métodos, headers adicionais, query, corpo e timeout continuam configuráveis. GET e HEAD não aceitam corpo; CONNECT, TRACE e TRACK são proibidos pelo navegador. `head()`, `options()` e `request()` também estão disponíveis no componente.

O editor da IDE tem um campo **Test authentication > Test JWT** para testes diretos. Esse JWT e arquivos escolhidos para multipart existem apenas em memória durante o diálogo, sem serem salvos no projeto ou incorporados ao código gerado. O Preview e a aplicação usam a sessão real de `RestGO`. Para upload na aplicação, passe um `FormData` como `body` da operação; o navegador define o boundary multipart.

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

As chamadas são feitas diretamente pelo navegador, com autenticação por headers. O transporte `fetch` utiliza `credentials: 'omit'`; o progresso de upload entre origens utiliza XHR com `withCredentials: false`, conforme as regras de Storage acima. O CORS do RestGO aceita origens HTTP/HTTPS válidas, responde ao preflight `OPTIONS` antes da autenticação e expõe `Retry-After`; origens `null`, `file://` ou com esquemas personalizados são rejeitadas. O Preview e a IDE empacotada usam origens HTTP locais separadas em `127.0.0.1` para permitir esses fluxos sem um proxy de requisições ou desativar a segurança do Electron. A porta é definida por execução da IDE. APIs com uma lista restrita de origens precisam permitir a origem local recebida; proxies na frente do RestGO também precisam preservar os headers de CORS. Publique a aplicação gerada em HTTP/HTTPS. OAuth, MFA, Realtime e consulta arbitrária a tabelas exigiriam novos contratos no backend.
