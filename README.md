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
- Abra **Responsive** para visualizar a página nas larguras Desktop, Tablet e Mobile. O zoom na barra superior altera a escala de visualização.
- No Inspector, **Visual** reúne as propriedades em seções recolhíveis e **Interaction** permite configurar os eventos existentes do componente.
- Use **Project Explorer** para gerenciar páginas e componentes reutilizáveis, **Styles** para editar estilos e **Project Settings** para configurar o projeto. O botão **Output** abre o painel de Problems, Output e Build, inicialmente recolhido; a compilação e os diagnósticos também o abrem.

Os componentes não visuais continuam disponíveis na bandeja abaixo do canvas. A organização do workspace preserva o modelo versionado do projeto, os IDs dos componentes e o histórico de comandos.

## Integração nativa com RestGO

Em **Project Settings > RestGo integration**, configure em uma única seção a URL da instância, a versão da API, o banco padrão e a persistência da sessão. **Cadastro e login não enviam `Authorization`**, mesmo quando existe uma sessão ou token configurado. Para esse fluxo, deixe **Authorization token** vazio. O cadastro depende de o RestGO permitir acesso público a `POST /auth/users`; o login usa `POST /auth/token`.

O **Authorization token** é opcional para APIs dinâmicas que precisam de um token de aplicação antes do login. Essas chamadas automáticas enviam `Authorization: <token>`, sem `Bearer`, quando não existe sessão, e `Authorization: Bearer <JWT>` quando o usuário está autenticado. Após logout, voltam ao token configurado.

A configuração é salva no arquivo do projeto e aplicada ao Preview e à aplicação web gerada. O token informado fica acessível no navegador: use um token de API da aplicação com as permissões apropriadas, mantendo credenciais administrativas no servidor. Refresh e operações explicitamente públicas continuam sem `Authorization`.

O SDK TypeScript `@webrad/restgo-sdk` oferece autenticação de usuários, validação de sessão, recuperação de senha, confirmação de e-mail, avatar, Storage e chamadas aos endpoints dinâmicos publicados. O cliente nativo `RestGO` fica disponível nos eventos TypeScript, com tipos e autocompletar no editor. A aplicação gerada executa esse mesmo SDK diretamente no navegador.

Use atalhos com parâmetros diretos, como `await RestGO.login(email, senha)`, `await RestGO.getUser()` e `await RestGO.logout()`. As operações retornam `{ data, error }` e compartilham a sessão em todas as páginas.

Na página, **Interaction > RestGO** oferece **OnLogin**, **OnLogout** e **OnUnauthenticated**. Dê dois cliques para criar o método. Nos dois primeiros, obtenha a identidade por `event.detail.user`; por exemplo, `this.usuarioId = user.id` guarda o ID em um campo declarado na classe. `OnLogin` também entrega uma sessão restaurada à página exibida. `OnUnauthenticated` detecta entrada sem sessão e encerramento da sessão, permitindo usar `Navigate('PageLogin')` no evento. O runtime verifica a sessão a cada 30 segundos na aba visível e ao retornar à aba; falhas de rede não disparam desconexão. Consulte os [exemplos de eventos e variáveis](docs/restgo-sdk.md#eventos-de-autenticação-em-interaction).

Consulte o [guia do SDK RestGO](docs/restgo-sdk.md) para exemplos e detalhes dos contratos. O SDK renova o JWT automaticamente por `POST /auth/refresh`, persiste o par de credenciais rotacionado e coordena renovações simultâneas. Novo login é necessário quando o refresh token expira ou é revogado. As sessões continuam sendo validadas pelo servidor; cadastrar uma conta não inicia uma sessão automaticamente.

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

O uso de `npm.cmd` evita o erro de segurança que informa que `npm.ps1` não pode ser carregado porque a execução de scripts está desabilitada. Não é necessário alterar a política de execução do Windows.

O arquivo recomendado para entregar ao usuário é `out/make/squirrel.windows/x64/WebRad-<versão> Setup.exe` — atualmente, `WebRad-0.1.0 Setup.exe`. Esse é o instalador. O arquivo `.nupkg` presente na mesma pasta não deve ser aberto diretamente pelo usuário final.

Para distribuir uma versão portátil, sem instalação, compacte e transfira o diretório completo `out/WebRad-win32-x64`. No outro computador, execute `WebRad.exe` dentro dessa pasta. Não transfira apenas o arquivo `WebRad.exe`, pois ele depende dos demais arquivos e diretórios de recursos que ficam ao lado dele.

Os artefatos de distribuição são específicos de cada plataforma e devem ser gerados no sistema operacional de destino.

## Guia do repositório

- `apps/ide`: processo principal e preload do Electron, além do renderer em React.
- `packages`: módulos independentes de modelo de projeto, registro de componentes, designer, linguagem, runtime e compilador.
- `examples/hello-webrad`: projeto de exemplo utilizado pelo fluxo vertical.
- `docs`: documentação da arquitetura, do formato, do modelo de componentes e do compilador.
- `PLANS.md`: estado atual dos marcos do projeto.

Consulte o [guia de arquitetura](docs/architecture.md) antes de alterar os limites entre os pacotes.
