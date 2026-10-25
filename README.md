# WebRAD

IDE visual para criar aplicações Web/PWA com páginas, componentes reutilizáveis,
layout responsivo, eventos e TypeScript. O Designer, o código tipado e o Preview
compilado trabalham sobre o mesmo modelo de projeto. A IDE desktop usa Electron;
as aplicações web geradas executam no navegador.

O código original, incluindo o runtime e o SDK RestGo, está disponível sob a
[licença MIT](LICENSE). Bibliotecas, fontes, ícones e mídias de terceiros mantêm
suas [próprias licenças](THIRD_PARTY_NOTICES.md).

## Instalar a IDE

Baixe o instalador na [última release](https://github.com/Atentor/WebRad/releases/latest):

| Sistema             | Distribuição                             |
| ------------------- | ---------------------------------------- |
| Windows x64         | `WebRad-<versão>-win32-x64-Setup.exe`    |
| Linux x64           | Pacote `.deb` ou `.rpm`                  |
| macOS Intel         | ZIP `darwin-x64` contendo `WebRad.app`   |
| macOS Apple Silicon | ZIP `darwin-arm64` contendo `WebRad.app` |

Os instaladores incluem as dependências para criar aplicações Web/PWA na IDE.
O desenvolvimento do WebRAD a partir das fontes e os builds nativos têm seus
próprios pré-requisitos, descritos abaixo. Builds macOS sem Developer ID podem
ser bloqueados pelo sistema e usam substituição manual do aplicativo.
Consulte [releases e atualizações](docs/releases.md) para os detalhes por plataforma.

## Primeira aplicação

1. Abra **New Project**, escolha **Blank project** ou **Examples & Tutorial** e o tema
   **Aurora**, **Prism** (colorido), **Flat** (superfícies sólidas) ou **WebRAD**
   (paleta e fonte da IDE, com cantos retos), todos com Light e Dark. Informe
   o nome e selecione a pasta que receberá a subpasta do projeto. O template Aurora
   demonstra os componentes visuais e não visuais usando apenas os styles Default,
   com formulário, Popup, dados e mídia locais, Menu e componentes reutilizáveis.
   Edite a navegação compartilhada em **Reusable Components > AuroraMenu**.
   A seção **Nonvisual** inclui PokéAPI, Timer, File/Video Upload e Report Builder.
   A seção **RestGO** demonstra cadastro, login, confirmação de e-mail,
   recuperação de senha, perfil/avatar, sessão e logout.
   A PokéAPI requer internet; envios exigem sua conexão e conta RestGO.
   Tudo pode ser editado no Designer e no código. Para explorar outro exemplo, abra
   [HelloWebRad.wrproj](examples/hello-webrad/HelloWebRad.wrproj) pela IDE.
2. No **Builder**, arraste componentes para o canvas. Selecione-os pela árvore ou
   pelo canvas e edite suas propriedades em **Visual**, no Inspector.
3. Em **Interaction**, dê dois cliques em um evento para abrir seu método no Monaco.
   Use **Design** e **Code**, acima da área de edição, ou **F12**, para alternar as vistas.
4. Salve com **Ctrl+S** (**Cmd+S** no macOS) e pressione **F9** para executar o Preview.
   Os diagnósticos aparecem no painel **Output / Problems**.
5. Em **Project Settings**, ajuste a compilação em **Build and publishing** e as
   opções PWA em **PWA and metadata**. Defina **Output Directory** em
   **Native Application → Build**.
6. Abra **Project → Build Application…** e selecione **Web/PWA**. Os arquivos de
   hospedagem são gerados em uma subpasta com o nome do projeto no destino escolhido.

Sirva os arquivos exportados por HTTP/HTTPS. O roteamento History usa URLs limpas
e exige que o servidor encaminhe as rotas de páginas para `index.html`; a opção
Hash atende hospedagens sem esse recurso. Veja [rotas e hospedagem](docs/browser-routing.md).

Ao iniciar, a IDE tenta reabrir a versão salva do último projeto. Se os arquivos
não estiverem disponíveis ou forem inválidos, a tela inicial permite abrir ou criar outro.

O projeto completo de demonstração também está pronto para abrir em
[AuroraWorkspace.wrproj](examples/aurora-workspace/AuroraWorkspace.wrproj).
Veja [as páginas e interações do exemplo](examples/aurora-workspace/README.md).

## Designer e programação

- **Builder** reúne a árvore dos elementos e a paleta de componentes. Os componentes
  não visuais ficam na bandeja abaixo do canvas.
- **Responsive** oferece **Default**, que acompanha a largura disponível, **Tablet**
  (768 px) e **Mobile** (390 px). Essas vistas não alteram as dimensões salvas da página.
- **Visual** edita propriedades e **Interaction** configura eventos. **Styles**
  gerencia estilos reutilizáveis; **Project Explorer** organiza páginas, componentes
  reutilizáveis, Models, Units e recursos.
- A barra superior mostra o documento atual, o estado de salvamento e as ações de
  projeto, histórico, Build Application, Debug e Preview. **F5** inicia o debugger;
  veja [depuração integrada](docs/debugger.md).

Os componentes são instâncias tipadas, com autocomplete, hover e diagnósticos:

```ts
public async BTNMostrarClick(): Promise<void> {
  Message(`Olá ${EDTNome.value}`);
}
```

`EDTNome.value` e `this.EDTNome.value` usam a mesma instância. Variáveis, parâmetros
e imports com o mesmo nome seguem o escopo normal do TypeScript. Use funções de
seta em callbacks para manter a instância. O compilador resolve os acessos sem
reescrever o TypeScript salvo. Consulte o [modelo de componentes](docs/component-model.md).

## APIs e RestGo

O **API Client** configura e testa operações REST, parâmetros, headers, corpos e
contratos tipados de resposta. Dê dois cliques no componente da bandeja para abrir
o editor. Requisições configuradas ficam disponíveis pelo nome:

```ts
ApiClient1.PutKey.parameter.idinstancia = 42;
ApiClient1.PutKey.parameter.chave = 'valor';
await ApiClient1.PutKey.execute();
```

O exemplo pressupõe uma operação `PutKey` com esses parâmetros. Veja o
[guia do API Client](docs/api-client.md) para configuração, autenticação e respostas.

**RestGo integration** reúne a conexão, o editor de endpoints e o catálogo para
importação de APIs. O SDK compartilhado `RestGO` oferece login, sessão, renovação
de JWT, recuperação de conta, avatar, Storage e APIs dinâmicas. Chamadas do tester,
Preview e aplicação gerada usam o navegador e respeitam o CORS do servidor.

Credenciais administrativas e a sessão de desenvolvimento permanecem na IDE.
Tokens de aplicação incluídos no projeto ficam acessíveis no navegador e devem
ter permissões apropriadas. Consulte o [guia do SDK RestGo](docs/restgo-sdk.md).

## Aplicações nativas — experimental

**Native Build / Tauri 2** oferece configurações em **Project Settings → Native
Application**, geração do projeto nativo, inspeção de ferramentas, logs,
cancelamento e exportação para CI. **Build Application** seleciona o destino de
exportação. A IDE permanece em Electron e o aplicativo Tauri usa o frontend
compilado pelo WebRAD.

A integração ainda não tem evidência de artefatos nativos reais e execução em
WebViews certificadas. Verificações de pré-requisitos e smokes da IDE não
certificam o aplicativo Tauri. Builds exigem a toolchain e o host do destino;
consulte [Native Build](docs/native-build.md) para a matriz de validação e limitações.

## Desenvolver a partir das fontes

Use **Node.js 26.12.1 ou mais recente** e **npm 12.2.1 ou mais recente**, conforme
`engines` e `packageManager` do [package.json](package.json). Execute na raiz:

```sh
npm ci
npm start
```

No PowerShell, use `npm.cmd ci` e `npm.cmd start` se a política de execução bloquear
`npm.ps1`; não é necessário alterar a política do sistema. As responsabilidades
do TypeScript 7 CLI e do TypeScript 6 embarcado estão descritas na
[documentação das dependências](docs/dependency-upgrade.md).

```sh
npm run validate
npm run smoke:development
npm run smoke:packaged
npm run smoke:packaged -- --webrad-smoke-updates
```

`validate` verifica ícones, paridade das fontes geradas, tipos estritos, lint,
testes com caminhos temporários portáveis, formatação e empacotamento para o host.
Os testes compartilham o limite de dois workers da configuração raiz. Após alterar
o runtime ou o SDK, regenere os snapshots com `npm run runtime:sources`.

Os smokes executam o Electron real com perfis e projetos temporários isolados.
Falhas preservam logs e projetos em `artifacts/smoke/`. Para capturar o Designer,
informe um caminho absoluto:

```powershell
npm.cmd run smoke:development -- --webrad-smoke-screenshot="$PWD\artifacts\designer.png"
```

## Empacotamento e releases

`npm run build` ou `npm run package` produz a aplicação não instalada em
`out/WebRad-<plataforma>-<arquitetura>`. Para compartilhar uma versão portátil,
transfira o diretório inteiro; o executável depende dos recursos que o acompanham.

Quando a geração de instaladores for desejada, `npm run make` cria os
distribuíveis do host. `npm run release` é um alias desse comando: usa a versão
local existente, sem criar commits, tags ou publicação. No Windows, o Setup local
é `out/make/squirrel.windows/x64/WebRAD-Dev Setup.exe`; arquivos `.nupkg` pertencem
ao atualizador e não são o instalador para o usuário final.

As versões oficiais vêm de tags estáveis `vMAJOR.MINOR.PATCH`. O workflow exige
verificação do mesmo commit para Windows x64, Linux x64 e macOS Intel/ARM64 antes
da publicação. Siga o [checklist de release](docs/release-checklist.md) e o
[guia de distribuição e atualização](docs/releases.md).

## Documentação e repositório

| Caminho                 | Conteúdo                                                                       |
| ----------------------- | ------------------------------------------------------------------------------ |
| `apps/ide`              | Processo principal, preload e renderer React da IDE                            |
| `packages`              | Modelo, Registry, Designer, linguagem, runtime, compilador, SDK e Native Build |
| `examples/hello-webrad` | Exemplo executável usado no fluxo de validação                                 |
| `tests` e `scripts`     | Integração, testes de navegador, geração e validação                           |
| `docs`                  | Guias técnicos e contratos persistentes                                        |
| [PLANS.md](PLANS.md)    | Marcos e evidências de implementação                                           |

Comece pela [arquitetura](docs/architecture.md), pelo [formato do projeto](docs/project-format.md)
e pelo [compilador](docs/compiler.md). Os componentes têm guias próprios, incluindo
[Icons](docs/icons.md), [Menu](docs/menu.md), [Timer](docs/timer.md), [Repeating Group](docs/repeating-group.md),
[Report Builder](docs/report-builder.md), [File Upload](docs/file-upload.md),
[Video Upload](docs/video-upload.md) e [Video Player](docs/video-player.md).

Para contribuir, consulte [CONTRIBUTING.md](CONTRIBUTING.md) e as
[regras de engenharia](AGENTS.md). Relate vulnerabilidades conforme a
[política de segurança](SECURITY.md).
