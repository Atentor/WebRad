# API Client no código

O API Client configurado no Designer é uma instância real no código da página ou do componente reutilizável. O Monaco completa requisições, parâmetros e campos da resposta com base no modelo salvo. Tanto `ApiClient1` quanto `this.ApiClient1` funcionam dentro da instância; variáveis locais com o mesmo nome continuam respeitando o escopo normal do TypeScript.

## ComboBox conectado ao API Client

Para opções fixas, os botões **Edit Items…** e **Edit Values…** abrem um modal simples. Insira um texto por linha em **Items** e uma chave por linha em **Values**, na mesma ordem. Se **Values** ficar vazio, o texto do item será sua chave. **Save** salva as duas listas em uma única alteração; **Cancel** e Escape descartam o rascunho. A propriedade singular **Value** continua sendo a chave selecionada.

No Designer, dê duplo clique no ComboBox ou abra **API Client binding → Configure ComboBox** no Inspector. Selecione o API Client, a operação, a lista da resposta, o **Display field** (texto exibido) e o **Key field** (valor selecionado). As escolhas vêm do esquema de resposta salvo no editor do API Client. **Static items** remove o vínculo e permite usar a propriedade `Items` novamente.

O ComboBox acompanha o resultado da operação selecionada. Execute a requisição no código da página ou do reutilizável, por exemplo no `OnCreate`:

```ts
await ApiClient1.ListCustomers.execute();
const customerKey: string = ComboBox1.value;
```

Com texto `/name` e chave `/id`, uma opção pode mostrar `Ana` e retornar `"42"` em `ComboBox1.value`. Chaves numéricas e booleanas são convertidas para string. `OnChange` continua disponível e a seleção é preservada pela chave quando os resultados mudam de ordem. `value` também pode receber uma chave antes de a lista carregar. Listas de valores simples usam **Item value** nos dois campos. O vínculo não executa requisições automaticamente e não salva os dados retornados no projeto.

## Preencher e executar pelo nome

Configure uma requisição chamada `PutKey`, com o corpo abaixo e os tipos `integer` para `idinstancia` e `string` para `chave`:

```json
{
  "idinstancia": <idinstancia>,
  "chave": <chave>
}
```

No evento de um botão:

```ts
ApiClient1.PutKey.parameter.idinstancia = 42;
ApiClient1.PutKey.parameter.chave = 'valor';

const resultado = await ApiClient1.PutKey.execute();
const ultimoResultado = ApiClient1.PutKey.Response.Value;
```

Não é necessário selecionar `Operation`: o nome da requisição identifica diretamente seu objeto. A sintaxe é TypeScript: atribuição com `=` e execução com `await execute()`. Apenas ler `ApiClient1.PutKey.parameter.idinstancia` retorna o valor atual; executar exige a chamada do método.

`parameter` reúne os parâmetros do corpo e da query da requisição nomeada. Placeholders obrigatórios devem ser preenchidos antes do envio; os tipos são validados também em runtime. Campos de corpos JSON e form de endpoints importados também podem ser preenchidos por nome. Valores de parâmetros ficam separados por requisição e por instância, sem modificar o arquivo do projeto.

## Acessar uma requisição pelo nome

```ts
const requisicao = ApiClient1.PutKey;
requisicao.parameter.idinstancia = 42;
requisicao.parameter.chave = 'valor';
requisicao.Options.Timeout = 10000;
requisicao.Headers['X-Source'] = 'application';

const resultado = await requisicao.execute();
const estado = requisicao.Response.Status;
```

Cada requisição possui seu próprio objeto, parâmetros, opções e resposta. Os nomes configurados aparecem diretamente no cliente e em `parameter`, com diagnósticos para propriedades inexistentes e valores incompatíveis. `ApiClient1.Requests.PutKey` oferece acesso pelo catálogo de requisições. Parâmetros de query admitem valores escalares e arrays para campos repetidos. Atribuir um valor ativa o campo, incluindo a paginação opcional; `undefined` ou `null` omite o campo da query. Headers exigem texto.

`parameter` e `execute()` são os nomes únicos para esses acessos, tanto nas requisições quanto no cliente. `Parameter` e `Execute()` não fazem parte da API.

Nomes que coincidem com membros existentes do cliente ou do objeto, como `execute`, `get`, `constructor` e `then`, são acessíveis por `Requests.Nome` ou `RequestByName(nome)`. Renomear uma requisição em runtime atualiza seu acesso direto e preserva seu objeto e valores pelo ID estável. Clientes criados manualmente com `new WebApiClient<Saidas, Entradas>(configuracao).withRequests()` obtêm a mesma visão tipada; páginas e componentes reutilizáveis recebem essa visão automaticamente.

Para obter uma requisição por um nome conhecido somente em runtime, use `ApiClient1.RequestByName(nome)`. O autocomplete usa os nomes e tipos configurados no Designer; alterar nomes ou contratos em runtime não reescreve esse modelo nem os arquivos TypeScript.

## Propriedades disponíveis

| Acesso                                              | Comportamento                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| `Operation`                                         | Seleciona a requisição ativa; inicialmente é a primeira configurada.        |
| `Request` / `Requests.Nome`                         | Objeto da requisição ativa ou de uma requisição específica.                 |
| `Connection.Mode`                                   | `custom`, `restgo-session`, `restgo-api-token` ou `restgo-public`.          |
| `Connection.BaseURL`                                | URL base do cliente personalizado; RestGo mantém a URL da integração.       |
| `Connection.Timeout`                                | Timeout padrão em milissegundos.                                            |
| `Connection.Headers.Nome`                           | Headers padrão, compartilhados pelas requisições do cliente.                |
| `Connection.DefaultHeaders`                         | Leitura ou substituição das definições de headers padrão.                   |
| `Method`, `Endpoint`, `ApiVersion`                  | Leitura e alteração da requisição ativa. Também existem em `Requests.Nome`. |
| `Body.Kind` / `Body.Value`                          | Tipo do corpo e conteúdo/template da requisição ativa.                      |
| `Body.Parameters`                                   | Definições dos parâmetros do corpo.                                         |
| `parameter.Nome`                                    | Leitura e atribuição direta do valor de um parâmetro.                       |
| `ParamByName(nome).Value` / `.Type`                 | Acesso dinâmico ao valor e ao tipo do parâmetro.                            |
| `Query.Nome`                                        | Leitura, inclusão ou alteração de um campo de query.                        |
| `Headers.Nome`                                      | Leitura, inclusão ou alteração de um header da requisição.                  |
| `Options.Credentials`                               | Política de cookies para APIs personalizadas. RestGo omite cookies.         |
| `Options.Timeout`                                   | Timeout da requisição; `null` herda o padrão do cliente.                    |
| `Options.ResponseType`                              | `auto`, `json`, `text`, `blob` ou `arrayBuffer`.                            |
| `Response.Value`, `.Status`, `.Error`, `.UpdatedAt` | Resultado e estado calculados, disponíveis para leitura.                    |
| `Response.Schema`                                   | Leitura ou substituição do contrato dos campos da resposta.                 |
| `Request.Definition`                                | Leitura ou substituição validada de uma definição, preservando seu ID.      |
| `Configuration` / `apiClientConfig`                 | Leitura de um snapshot imutável ou substituição validada da configuração.   |
| `operations`                                        | Leitura ou substituição das definições de requisições.                      |
| `ClearParameters()`                                 | Limpa os valores da requisição ativa e desativa os campos de query.         |

Alterações de settings feitas pelo código pertencem à instância da aplicação. O Designer continua sendo a origem da configuração persistida. Snapshots de definições são imutáveis; use os setters dos objetos ou substitua uma definição/configuração para aplicar uma alteração. IDs de componentes e requisições permanecem estáveis.

## Execução pelo cliente e RestGo

Também é possível executar uma requisição pelo nome informado no cliente ou usar sua seleção ativa:

```ts
ApiClient1.Operation = 'PutKey';
ApiClient1.parameter.idinstancia = 42;
ApiClient1.parameter.chave = 'valor';
await ApiClient1.execute();

await ApiClient1.execute('PutKey', {
  parameters: { idinstancia: 42, chave: 'valor' },
});

await ApiClient1.execute('PutKey', {
  body: { idinstancia: 42, chave: 'corpo completo' },
});
```

Valores fornecidos nas opções valem somente para aquela execução e prevalecem sobre os valores atribuídos em `parameter`. Um `body` explícito substitui o template. Os métodos `request`, `get`, `post`, `put`, `patch`, `delete`, `head`, `options`, `getOutputById`, `getList`, `getOperationState` e `subscribe`, além dos eventos registrados no Designer, permanecem disponíveis.

Em RestGo, a URL fica vinculada à configuração nativa e o endpoint deve permanecer sob esse prefixo. O SDK fornece o JWT atual ou o token de aplicação conforme o modo escolhido; requisições públicas omitem autenticação e cookies. Atribuir `Authorization` pelos objetos de headers é recusado nesse modo. Nenhum desses objetos recebe a credencial administrativa do IDE.
