# WebRAD

O WebRAD é uma IDE visual RAD multiplataforma para criar aplicações web com páginas, componentes, propriedades, eventos, TypeScript e um fluxo real de compilação e visualização. A IDE desktop utiliza Electron e React; as aplicações geradas utilizam somente tecnologias do navegador.

## Pré-requisitos

- Node.js 24 ou mais recente
- npm 11 ou mais recente
- Windows ou Linux (a arquitetura mantém possível o suporte ao macOS)

## Instalação e desenvolvimento

```sh
npm install
npm start
```

Se o PowerShell do Windows bloquear a execução de `npm.ps1`, utilize o executável `npm.cmd` sem precisar alterar a política de execução do sistema:

```powershell
npm.cmd install
npm.cmd start
```

Ao iniciar, o WebRAD reabre automaticamente o último projeto criado, aberto ou salvo, se os arquivos ainda estiverem disponíveis e válidos. Se não for possível reabri-lo, a tela inicial permite abrir ou criar outro projeto. A reabertura carrega a versão salva em disco.

## Designer

O workspace segue a organização visual do designer do Bubble: barra superior compacta, navegação por ícones à esquerda, árvore de elementos e paleta no painel Builder, canvas central e Inspector à direita. A barra superior reúne os documentos abertos, o elemento selecionado, o zoom e as ações de salvar, desfazer, refazer e executar Preview.

- Use **Design**, **Code** e **Preview** na barra lateral para alternar a visualização do documento; **F12** abre o código e **F9** compila e executa a aplicação.
- No **Builder**, selecione um elemento pela árvore ou pelo canvas. Ambos atualizam a mesma seleção e o Inspector. Pesquise os elementos ou os componentes da paleta e arraste um componente para inseri-lo.
- Abra **Responsive** para escolher a largura do canvas: **Default** acompanha dinamicamente o espaço disponível no Designer, **Tablet** usa 768 px e **Mobile** usa 390 px. O zoom na barra superior altera a escala de visualização; no modo Default, o canvas continua ocupando a largura disponível. A seleção não altera as dimensões salvas da página.
- No Inspector, **Visual** reúne as propriedades em seções recolhíveis e **Interaction** permite configurar os eventos existentes do componente.
- Use **Project Explorer** para gerenciar páginas e componentes reutilizáveis, **Styles** para editar estilos e **Project Settings** para configurar o projeto. O botão **Output** abre o painel de Problems, Output e Build, inicialmente recolhido; a compilação e os diagnósticos também o abrem.

Os componentes não visuais continuam disponíveis na bandeja abaixo do canvas. A organização do workspace preserva o modelo versionado do projeto, os IDs dos componentes e o histórico de comandos.

## Código dos componentes

Nos métodos da página ou do componente reutilizável, você pode acessar os componentes diretamente pelo nome, com autocomplete e verificação de tipos:

```ts
public BTNMostrarClick(): void {
  BTNMostrar.caption = EDTNome.value;
}
```

`this.BTNMostrar` continua disponível. Variáveis, parâmetros e imports com o mesmo nome seguem o escopo normal do TypeScript. Em callbacks, use funções de seta (`() => { ... }`) para manter a instância. O acesso direto também funciona em propriedades e accessors da instância e no construtor após `super(...)`; código estático e fora da classe não recebe componentes. O WebRAD resolve as referências na compilação sem reescrever o arquivo salvo.

## API Client REST

O ícone **RestGo integration** no menu vertical abre a configuração da conexão, o editor de endpoints e o catálogo de APIs publicadas. Informe um API Token administrativo separado para gerenciar endpoints e publicações na instância; essa credencial fica no IDE, fora do projeto e da aplicação gerada. Para usar uma API pronta, abra um componente API Client na página ou componente reutilizável e selecione **Import from RestGo**; método, versão e parâmetros são preenchidos automaticamente. JWT, token da aplicação e acesso público usam modos de conexão distintos. Consulte [a configuração e o fluxo de publicação](docs/restgo-sdk.md).

Em **Requests**, use **New** para criar uma requisição, **Import from RestGo** para carregar APIs prontas e **Delete request** para excluir a selecionada. Método, endpoint e **Send** ficam juntos no editor. A lista vazia pode ser salva e reaberta; a URL base e as demais configurações do cliente são preservadas.

Dê dois cliques no **API Client** da bandeja para configurar operações REST. O editor organiza **Query parameters**, **Headers**, **Body** e **Options** em abas. A lista inclui GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, CONNECT e TRACE, além de método personalizado. CONNECT, TRACE e TRACK são proibidos pelo navegador e não podem ser testados ou executados por `fetch`; GET e HEAD não enviam corpo.

Configure headers padrão e por operação, parâmetros de query repetidos, timeout, credenciais e corpo JSON, texto, URL encoded ou multipart. **API version** pertence a cada operação: `2` e o endpoint `/clientes/listar` geram `/v2/clientes/listar`; vazio preserva o endpoint informado. O teste mostra status, duração, headers e resposta; apenas o contrato dos campos é salvo. Arquivos selecionados no editor servem somente ao teste. Na aplicação, envie arquivos com um `FormData` em `execute('Operacao', { body: form })`.

No corpo, escreva parâmetros como `{"idinstancia": <idinstancia>, "chave": <chave>}`. O editor mostra automaticamente cada nome, seu tipo e um valor somente para teste. Os tipos e o template são salvos; os valores de teste não entram no projeto. Na aplicação, informe os valores com `ApiClient1.execute('PutKey', { parameters: { idinstancia: 42, chave: 'valor' } })`. JSON é escapado conforme o tipo escolhido; valores ausentes ou incompatíveis impedem o envio.

No Monaco, acesse a requisição pelo nome: atribua `ApiClient1.PutKey.parameter.idinstancia = 42` e `ApiClient1.PutKey.parameter.chave = 'valor'`, então execute `await ApiClient1.PutKey.execute()`. Cada requisição expõe seus parâmetros, corpo, query, headers, opções e resposta. Os nomes e tipos configurados recebem autocomplete, hover e diagnósticos; `this.ApiClient1` oferece o mesmo contrato. `parameter` e `execute()` são os nomes únicos para esses acessos. Consulte [o uso completo no código](docs/api-client.md).

Em **Connection > RestGo JWT Authentication**, a URL base vem de **RestGo integration > Connection** e fica fixa. Edite o endpoint relativo, como `/v1/clientes/listar`, e os demais parâmetros. O Preview e a aplicação enviam automaticamente `Authorization: Bearer <JWT>` da sessão atual de `RestGO`, incluindo renovação pelo SDK. Sem usuário autenticado, a chamada falha; o token de API configurado não substitui a sessão. O editor oferece **Test authentication > Test JWT** para testar com um JWT temporário, mantido somente em memória.

## Integração nativa com RestGO

Em **RestGo integration > Connection**, configure a URL da instância, o banco padrão e a persistência da sessão. A versão das requisições é configurada por operação no **API Client**. **Cadastro e login não enviam `Authorization`**, mesmo quando existe uma sessão ou token configurado. Para esse fluxo, deixe **Application API token** vazio. O cadastro depende de o RestGO permitir acesso público a `POST /auth/users`; o login usa `POST /auth/token`.

O **Authorization token** é opcional para APIs dinâmicas que precisam de um token de aplicação antes do login. Essas chamadas automáticas enviam `Authorization: <token>`, sem `Bearer`, quando não existe sessão, e `Authorization: Bearer <JWT>` quando o usuário está autenticado. Após logout, voltam ao token configurado.

A configuração é salva no arquivo do projeto e aplicada ao Preview e à aplicação web gerada. O token informado fica acessível no navegador: use um token de API da aplicação com as permissões apropriadas, mantendo credenciais administrativas no servidor. Refresh e operações explicitamente públicas continuam sem `Authorization`.

O Preview e a IDE empacotada usam servidores HTTP locais em `127.0.0.1`, com portas separadas, para enviar uma origem HTTP válida nas chamadas à API. Isso evita o `NETWORK_ERROR` causado pelo CORS quando a origem era `null` ou `webrad-preview:`. As requisições continuam sendo feitas pelo navegador; a API precisa permitir a origem, o método e os headers utilizados. Sirva a aplicação gerada por HTTP/HTTPS também.

O SDK TypeScript `@webrad/restgo-sdk` oferece autenticação de usuários, validação de sessão, recuperação de senha, confirmação de e-mail, avatar, Storage e chamadas aos endpoints dinâmicos publicados. O cliente nativo `RestGO` fica disponível nos eventos TypeScript, com tipos e autocompletar no editor. A aplicação gerada executa esse mesmo SDK diretamente no navegador.

Use atalhos com parâmetros diretos, como `await RestGO.login(email, senha)`, `await RestGO.getUser()` e `await RestGO.logout()`. As operações retornam `{ data, error }` e compartilham a sessão em todas as páginas. O `login()` também retorna `sucess: true | false`: use `if (log.sucess)` para acessar `log.data.user` ou, no ramo de falha, `log.error.message`.

Na página, **Interaction > RestGO** oferece **OnLogin**, **OnLogout** e **OnUnauthenticated**. Dê dois cliques para criar o método. Nos dois primeiros, obtenha a identidade por `event.detail.user`; por exemplo, `this.usuarioId = user.id` guarda o ID em um campo declarado na classe. `OnLogin` também entrega uma sessão restaurada à página exibida. `OnUnauthenticated` detecta entrada sem sessão e encerramento da sessão, permitindo usar `Navigate('PageLogin')` no evento. O runtime verifica a sessão a cada 30 segundos na aba visível e ao retornar à aba; falhas de rede não disparam desconexão. Consulte os [exemplos de eventos e variáveis](docs/restgo-sdk.md#eventos-de-autenticação-em-interaction).

Consulte o [guia do SDK RestGO](docs/restgo-sdk.md) para exemplos e detalhes dos contratos. O SDK renova o JWT automaticamente por `POST /auth/refresh`, persiste o par de credenciais rotacionado e coordena renovações simultâneas. Novo login é necessário quando o refresh token expira ou é revogado. As sessões continuam sendo validadas pelo servidor; cadastrar uma conta não inicia uma sessão automaticamente.

Para ler o usuário sem `await`, use `RestGO.CurrentUser?.nome`, `.email`, `.id`, `.emailconfirmed` e `.ativo`. `CurrentUser` é somente leitura e retorna `null` sem sessão ou durante a restauração inicial. Os dados acompanham a última identidade confirmada pelo SDK; a leitura não faz requisições. Use `await RestGO.getUser()` quando precisar validar a sessão e atualizar os dados no servidor.

## Validação

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke:development
npm run smoke:packaged
```

Execute toda a sequência com `npm run validate`. Formate o código-fonte com `npm run format` e verifique a formatação com `npm run format:check`. O comando `npm run runtime:sources:check` verifica se o runtime de navegador incorporado ao compilador corresponde ao pacote-fonte.

No PowerShell que bloqueia `npm.ps1`, substitua `npm` por `npm.cmd` nesses comandos. Por exemplo: `npm.cmd run validate`.

## Empacotamento e distribuição

O comando `npm run smoke:development` inicia o Forge e o Vite reais, confirma que o shell React foi montado e percorre o fluxo completo da IDE sem reutilizar bundles obsoletos dos pacotes internos. O comando `npm run package` cria uma aplicação não instalada para a plataforma atual. O comando `npm run smoke:packaged` inicia exatamente esse artefato, abre pela IDE uma cópia temporária do projeto Hello, executa F9 pelo fluxo de compilação com IPC tipado, interage com o Preview isolado e verifica o resultado do evento gerado antes de encerrar. O comando `npm run make` aciona os geradores do Electron Forge para produzir os artefatos distribuíveis compatíveis com a plataforma atual.

Os dois smokes também verificam a reabertura automática do último projeto com preferências temporárias isoladas, a seleção compartilhada entre árvore, canvas e Inspector, as larguras de visualização responsiva, o zoom e o painel Output. Para salvar uma captura real do Designer ao final do smoke, forneça um caminho absoluto:

```powershell
npm.cmd run smoke:development -- --webrad-smoke-screenshot=C:\GitHub\WebRad\.tmp\designer.png
```

Para gerar o instalador destinado a outro computador Windows x64, execute no PowerShell:

```powershell
npm.cmd run make
```

Para gerar um novo instalador com uma nova versão do aplicativo, execute:

```powershell
npm.cmd run release
```

Cada execução incrementa a versão de correção no `package.json` e no `package-lock.json` (por exemplo, `0.1.0` → `0.1.1` → `0.1.2`) e executa o empacotamento completo com o código atual salvo no repositório. O comando não cria commits ou tags Git. Em Linux, utilize `npm run release`.

O novo Setup fica em `out/make/squirrel.windows/x64/WebRad-<versão> Setup.exe`. Execute esse instalador para atualizar o aplicativo instalado; gerar o arquivo não atualiza a instalação automaticamente. `npm run make` continua gerando artefatos com a versão atual, sem incrementá-la. Se o empacotamento falhar depois do incremento, corrija o erro e execute `npm run make` para tentar novamente com a mesma versão.

No Windows, o instalador usa o ícone do WebRAD também no arquivo `app.ico` da pasta instalada e na lista de aplicativos do sistema. Esse ícone vem do `Icon.ico` incluído no pacote, sem download durante a instalação. Ao abrir a versão atualizada, instalações antigas substituem o ícone padrão do Electron pelo ícone do WebRAD.

O uso de `npm.cmd` evita o erro de segurança que informa que `npm.ps1` não pode ser carregado porque a execução de scripts está desabilitada. Não é necessário alterar a política de execução do Windows.

O arquivo recomendado para entregar ao usuário é `out/make/squirrel.windows/x64/WebRad-<versão> Setup.exe`. Esse é o instalador. O arquivo `.nupkg` presente na mesma pasta não deve ser aberto diretamente pelo usuário final.

Para distribuir uma versão portátil, sem instalação, compacte e transfira o diretório completo `out/WebRad-win32-x64`. No outro computador, execute `WebRad.exe` dentro dessa pasta. Não transfira apenas o arquivo `WebRad.exe`, pois ele depende dos demais arquivos e diretórios de recursos que ficam ao lado dele.

Os artefatos de distribuição são específicos de cada plataforma e devem ser gerados no sistema operacional de destino.

## Guia do repositório

- `apps/ide`: processo principal e preload do Electron, além do renderer em React.
- `packages`: módulos independentes de modelo de projeto, registro de componentes, designer, linguagem, runtime e compilador.
- `examples/hello-webrad`: projeto de exemplo utilizado pelo fluxo vertical.
- `docs`: documentação da arquitetura, do formato, do modelo de componentes e do compilador.
- `PLANS.md`: estado atual dos marcos do projeto.

Consulte o [guia de arquitetura](docs/architecture.md) antes de alterar os limites entre os pacotes.
