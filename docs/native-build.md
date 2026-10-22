# Native Build com Tauri 2

A IDE WebRAD continua em Electron. **Native Build** usa o compilador WebRAD existente e a CLI oficial do Tauri 2 para preparar e compilar os aplicativos dos projetos. O frontend mantém os componentes e eventos TypeScript do runtime de navegador; o aplicativo gerado não inclui Electron, o Designer ou as APIs administrativas da IDE. Tauri apresenta esse frontend em uma WebView, sem convertê-lo em controles Win32, UIKit, AppKit ou Android Views.

Esta implementação contém configuração persistida, geração do projeto Tauri, verificações de dependências, execução dos comandos oficiais, logs, cancelamento, exportação para CI e coleta de artefatos. **Ainda não há evidência de build nativo real nesta implementação**: a validação inicial de 21/10/2026 registrou a ausência de toolchains no Windows; Linux, macOS e iOS requerem outros ambientes. O checklist consulta as ferramentas atualmente instaladas, mas checks atendidos e testes de geração/processos não certificam uma compilação nem o funcionamento em uma WebView. Consulte a matriz de validação ao final.

## Arquitetura

```text
Project Model + TypeScript do usuário
  -> WebRAD Compiler (target: native)
     -> index.html + assets/app.js + assets/app.css + assets utilizados
  -> Electron main / Native Build
     -> verificação de host, arquitetura, ferramentas e assinatura
     -> projeto Tauri isolado + frontend local
     -> cargo tauri / Rust / Gradle / Xcode
     -> validação e cópia dos artefatos para uma nova pasta de saída
```

`packages/native-build` recebe arquivos compilados em memória e configurações tipadas. Ele não importa o compilador ou o Designer. `apps/ide/main/native-build-ipc.ts` faz a integração com o projeto aberto, o compilador e os diretórios autorizados. O renderer chama somente o bridge tipado e acompanha eventos associados à solicitação; não inicia processos nem recebe acesso genérico ao filesystem.

O projeto intermediário fica no cache da IDE, separado dos arquivos `.wrproj`, páginas, Models, Units e TypeScript autoral. Dependências Cargo e cache de compilação podem ser reutilizados; o cache de targets do Cargo fica em uma pasta curta sob os dados da IDE, separada do workspace por projeto, para evitar caminhos de saída longos no linker do Windows. Cada resultado utiliza uma nova subpasta no diretório escolhido, preservando saídas anteriores. A publicação de um aplicativo não altera a versão ou o release da IDE.

O gerador escreve `frontend/`, `src-tauri/tauri.conf.json`, Cargo e os pequenos pontos de entrada Rust, capabilities, ícones e `native-settings.json`. A interface é carregada do `frontendDist` local. Baixar dependências durante uma compilação Cargo/Gradle pode exigir internet; o carregamento da interface não exige hospedagem web.

## Configuração visual

Abra **Project Settings → Native Application**. Essas opções pertencem a `settings.nativeApplication` e são salvas no projeto. Projetos existentes recebem valores padrão sem alterar `formatVersion: 2`.

| Grupo              | Campos                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Identification     | Application Name, Application Identifier, Version, Description, Publisher, Application Icon                             |
| Desktop            | Initial Width/Height, Minimum Width/Height, Resizable, Fullscreen, Maximizable                                          |
| Mobile             | Orientation (Portrait/Landscape/Auto), Mobile Fullscreen, Status Bar, Safe Area, Mobile Application Icon, Splash Screen |
| Build              | Target Platform, Target Architecture, Output Directory, Build Configuration (Debug/Release), Bundle Format              |
| Network            | Allowed Network Origins, uma origem HTTP(S) ou WS(S) exata por linha                                                    |
| Signing references | Identidades do sistema e nomes de variáveis de ambiente; nenhum segredo embutido                                        |

O identificador é portátil entre desktop e mobile, como `com.example.portal`: segmentos iniciados por letras, com letras e números, separados por pontos. A versão usa três números, como `1.2.3`. Tamanhos mínimos não podem exceder os iniciais. Os limites adicionais impostos por um empacotador continuam sujeitos aos diagnósticos da toolchain.

O ícone aceita SVG/PNG de até 1 MB. O gerador converte a imagem para PNG e usa `cargo tauri icon` para os formatos da plataforma. Um ícone mobile substitui o ícone geral nesse destino; sem um ícone configurado, há um ícone padrão. A apresentação final e os ícones adaptativos precisam ser inspecionados na plataforma de destino.

Quando o ícone nativo está vazio, a integração da IDE usa o ícone de General como fallback. A tela inicial segue o padrão da plataforma e os ícones gerados. **Splash Screen personalizado ainda não está implementado**, por isso a interface não oferece um seletor de imagem. O modelo mantém o campo para validar projetos importados: uma imagem customizada existente recebe um aviso com ação de remoção, e a compilação mobile a rejeita explicitamente em vez de ignorá-la.

## Build Application

Abra **Build Application** pelo menu Project. Selecione o destino e revise nome, versão, arquitetura, formato, configuração e saída. **Web/PWA** reutiliza o fluxo de exportação web. **Export for GitHub Actions** prepara um projeto independente para outro computador ou runner, sem executar uma compilação nativa local.

O painel **Build Requirements** verifica as ferramentas deste computador ao abrir o diálogo e ao mudar plataforma, arquitetura, formato ou configuração. Cada requisito atendido recebe um check verde; os demais mostram a versão mínima aplicável e **How to resolve**, com instruções de configuração. O resumo informa quantos requisitos estão atendidos. **Check again** refaz a consulta, por exemplo após instalar uma ferramenta e reiniciar a IDE para atualizar seu ambiente. A consulta não salva o projeto, não compila e não instala ferramentas. Respostas de seleções anteriores são descartadas. O resultado da verificação executada durante o build também atualiza a lista.

Para **Web/PWA**, o checklist verifica o compilador incluído no WebRAD, sem exigir Rust ou Tauri. Para um destino incompatível com o host, a lista identifica essa restrição; a exportação para CI continua disponível. Os checks indicam disponibilidade dos pré-requisitos, sem certificar a compilação, assinatura ou execução do aplicativo resultante.

O modal apresenta Preparing, Compiling WebRAD, Generating Tauri Project, Checking Dependencies, Compiling Native Application, Packaging e Completed/Failed/Cancelled conforme as etapas realmente executadas. stdout/stderr das ferramentas são apresentados nos logs. **Cancel Build** solicita o encerramento do processo e de seus descendentes; uma saída parcial não representa um build concluído.

Configuração, requisitos e status têm áreas próprias. **Build logs** e **Diagnostics** podem ser expandidos para consultar a saída completa sem repetir todos os erros no corpo do diálogo. O rodapé permanece acessível enquanto o conteúdo rola; em janelas menores, os painéis se organizam verticalmente.

Após um build válido, **Open Output Folder**, **Copy Artifact Path** e **Build Again** usam os resultados dessa solicitação. Encerramento com código zero sem o artefato esperado continua sendo falha. Exportar o projeto para CI conclui a exportação, sem afirmar que um instalador foi produzido.

**Output Directory** guarda a pasta de destino escolhida pelo usuário. Cada execução cria sua própria subpasta e apresenta o caminho efetivo dos artefatos. Se o seletor aberto durante o build autorizar outro destino, a IDE atualiza essa preferência no modelo e no formulário, preservando-a em Save, Build Again e na próxima abertura do projeto. Uma falha ao salvar essa preferência gera um aviso e mantém disponíveis os artefatos produzidos.

## Ferramentas e hosts

A instalação das ferramentas é responsabilidade do desenvolvedor. WebRAD não instala Rust, SDKs, certificados ou componentes do sistema silenciosamente. Antes de compilar, a verificação mostra ferramentas ausentes, versões detectadas, mínimos aplicáveis e instruções de correção. Instalações adicionais de dependências podem ser feitas pelas ferramentas oficiais durante o build solicitado.

Todos os destinos nativos exigem Rust/Cargo, `rustup`, o target Rust necessário e **Tauri CLI major 2**. O verificador exige Rust pelo menos 1.77.2 e rejeita outra major da CLI; dependências resolvidas pelo Cargo podem exigir uma versão superior. Instale explicitamente a CLI seguindo a [documentação oficial de pré-requisitos](https://v2.tauri.app/start/prerequisites/) e a [referência de comandos Tauri 2](https://v2.tauri.app/reference/cli/):

```sh
cargo install tauri-cli --version "^2" --locked
```

| Destino | Host aceito                  | Arquiteturas oferecidas                           | Formatos                                    |
| ------- | ---------------------------- | ------------------------------------------------- | ------------------------------------------- |
| Web/PWA | Windows, Linux, macOS        | Independente da CPU                               | Diretório com index.html e assets           |
| Windows | Windows                      | Host, x64, x86, ARM64                             | Executable (EXE), NSIS installer (EXE), MSI |
| Linux   | Linux                        | Host, x64, ARM64                                  | DEB, RPM, AppImage                          |
| macOS   | macOS                        | Host, Intel x64, Apple Silicon ARM64, Universal   | APP, DMG                                    |
| Android | Host com SDK/NDK compatíveis | ARM64, ARMv7, x64, x86                            | APK, AAB                                    |
| iOS     | macOS                        | ARM64 dispositivo, ARM64 simulador, x64 simulador | iOS application, IPA somente dispositivo    |

Essa matriz descreve as opções geradas e validadas pelo software. Não afirma builds já realizados. Linux exige um runner com a arquitetura selecionada; cross-compilation com linker/sysroot arbitrário não é configurada automaticamente. Windows exige as bibliotecas de compilação da arquitetura escolhida. Universal macOS exige os dois targets Rust. Um host incompatível recebe erro antes do comando de compilação.

### Windows

Instale Microsoft C++ Build Tools com **Desktop development with C++**, Windows SDK, WebView2 e os targets Rust necessários. MSI também depende do suporte VBScript usado pela cadeia WiX. Dependências adicionais do empacotador aparecem nos logs da CLI. Consulte [Windows Installer](https://v2.tauri.app/distribute/windows-installer/).

O checklist mostra **MSVC C++ Build Tools** e **Windows SDK** separadamente para a arquitetura escolhida. A detecção exige compilador, linker e biblioteca de runtime MSVC, além de headers Win32/UCRT, bibliotecas do destino e Resource Compiler de uma mesma versão do SDK. Instalações de SDK fora do caminho padrão podem ser indicadas por `WindowsSdkDir`; `WindowsSDKVersion` seleciona uma versão específica.

Escolha **Executable (EXE)** para o executável do aplicativo, **NSIS installer (EXE)** para um instalador NSIS ou **MSI** para o instalador Windows Installer. Um executável sozinho não é um instalador e não é anunciado como tal. O fluxo desktop executa `cargo tauri build --no-bundle` antes do empacotamento separado do formato selecionado.

Sem `Windows Certificate Thumbprint`, a saída de desenvolvimento pode ser não assinada e está sujeita a avisos e restrições de distribuição. Para assinar, instale o certificado no store do usuário e disponibilize `signtool` do Windows SDK; salve somente o thumbprint no projeto. A emissão e a confiança do certificado ficam fora da IDE.

### Linux

Instale o compilador/linker e as bibliotecas de desenvolvimento WebKitGTK 4.1, GTK3, OpenSSL e Ayatana AppIndicator. Debian/Ubuntu usam, por exemplo, `build-essential`, `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libayatana-appindicator3-dev` e `librsvg2-dev`. O verificador usa `pkg-config`; AppImage também verifica `patchelf`. Os nomes e versões variam por distribuição.

Selecione DEB, RPM ou AppImage em um host Linux compatível. Verificar dependências não garante portabilidade entre todas as distribuições. Valide instalação e execução na distribuição mínima pretendida. Não há compilação Linux a partir de Windows/macOS neste fluxo.

### macOS

Instale Xcode Command Line Tools e os targets Rust Intel/Apple Silicon escolhidos. Selecione APP para o application bundle ou DMG para a imagem de distribuição. Um APP é um diretório de aplicativo, não um único executável.

**Apple Signing Identity** aponta para uma identidade já instalada no keychain. **Apple Notarization Keychain Profile** referencia um perfil existente do `notarytool`; não contém senha nem chave privada. Quando configurado, o build submete o APP compactado ou DMG ao `notarytool`, exige o resultado `Accepted` e executa `stapler staple`/`validate` antes de copiar o resultado. Esse fluxo ainda não foi executado em um Mac nesta implementação. Assinatura e notarização exigem configuração válida na máquina/CI e conectividade com a Apple. Consulte [assinatura macOS no Tauri](https://v2.tauri.app/distribute/sign/macos/). Builds sem Developer ID/notarização podem sofrer bloqueios do Gatekeeper; sucesso de compilação não certifica distribuição pública.

### Android: APK e AAB

Instale JDK 17 ou superior, Android SDK (Platform, Platform-Tools, Build-Tools e Command-line Tools), NDK e os targets Rust. Configure `JAVA_HOME`, `ANDROID_HOME` (ou `ANDROID_SDK_ROOT`) e `NDK_HOME`. O verificador exige instalações legíveis e componentes presentes, sem presumir que um diretório vazio constitui SDK válido.

A geração usa `cargo tauri android init --ci --skip-targets-install`, aplica as configurações suportadas e executa `cargo tauri android build` com arquitetura, `--apk` ou `--aab` e a configuração escolhida. APK Debug permite testes com o certificado de desenvolvimento da ferramenta. AAB para distribuição exige referências completas de assinatura e keystore válido; não é um arquivo instalável diretamente como APK.

As quatro opções Android guardam **nomes de variáveis**, por exemplo `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` e `ANDROID_KEY_PASSWORD`. Defina seus valores no ambiente que inicia a IDE ou no runner. O caminho real, o certificado e as senhas não são gravados no projeto nem no frontend. Consulte o [processo oficial de assinatura Android](https://v2.tauri.app/distribute/sign/android/).

O script gerado `configure-mobile.mjs`, compartilhado entre a IDE e o CI, aplica a orientação ao manifest Android e gera a configuração Kotlin de status bar, fullscreen e insets da janela. A preferência Safe Area também controla CSS com `env(safe-area-inset-*)`. Examine os arquivos gerados e valide rotação, recortes e barras em dispositivo/emulador; essa projeção ainda não foi validada em WebView nativa.

### iOS: simulador, dispositivo e IPA

iOS exige **macOS com Xcode completo**, SDK iOS, CocoaPods, targets Rust e seleção correta em `xcode-select`. Windows/Linux podem exportar o projeto para CI; não compilam nem simulam iOS localmente. O fluxo utiliza `cargo tauri ios init --ci --skip-targets-install` e `cargo tauri ios build`.

ARM64 dispositivo é diferente de ARM64 simulador (`arm64-simulator`); x64 atende simuladores Intel compatíveis. IPA somente aceita destino ARM64 de dispositivo e depende de assinatura/provisionamento válidos. **Apple Team ID** e **iOS Export Method** (`debugging`, `release-testing`, `app-store-connect`) configuram o processo oficial; o Team ID também pode vir de `APPLE_DEVELOPMENT_TEAM`. Consulte [assinatura iOS](https://v2.tauri.app/distribute/sign/ios/).

O gerador cria o `Info.ios.plist` de orientação/status bar. Safe Area usa o viewport com `viewport-fit=cover` e CSS de padding baseado em `env(safe-area-inset-*)`; não há uma adaptação UIKit própria nem validação em dispositivo nesta mudança. Não há promessa de aprovação ou publicação na App Store. Certificados, entitlements e provisionamento devem ser revisados na conta Apple e no runner. Compilar para simulador não certifica instalação física ou exportação IPA.

## Rede, RestGO e segurança

O runtime mantém `fetch`, API Client e RestGO SDK existentes. O backend RestGO continua hospedado pelo desenvolvedor; nenhum backend local ou token administrativo é incluído. Nome da aplicação, versão e preferências de build não mudam login, logout, JWT, refresh, CurrentUser ou as APIs dos componentes.

Existem duas verificações independentes para a rede:

1. A **CSP do aplicativo** permite as origens exatas em Allowed Network Origins e as origens estáticas de conexões RestGO/API Client que a IDE consegue identificar. Inclua também CDNs, vídeo, upload/download e URLs construídas em TypeScript. Uma origem adicional de redirecionamento pode precisar de configuração própria.
2. O **servidor** precisa aceitar a origem e os headers usados pela WebView no CORS. Permitir a URL na CSP não configura o CORS do backend. Não desligue web security, CORS ou a validação de origem para contornar uma falha.

Os esquemas locais do Tauri podem produzir `http://tauri.localhost` em Windows/Android e `tauri://localhost` em outras plataformas; confirme a origem efetivamente observada no destino/configuração adotados e autorize-a de forma restrita no backend. O uso de HTTP/HTTPS, cookies, mixed content e políticas do sistema pode variar. Consulte a [configuração oficial do Tauri](https://v2.tauri.app/reference/config/), especialmente a origem do protocolo local.

A persistência de sessão continua obedecendo `settings.restGo.persistSession`, `sessionStorage` e `storageKey`. A WebView tem seu próprio armazenamento/origem: sessões do Preview/Chrome não são transferidas para o aplicativo. Atualizações e reinstalações precisam ser testadas no dispositivo; não há nova camada de armazenamento de credenciais nativas.

A capability padrão tem `permissions: []`, não expõe comandos customizados, shell, filesystem ou APIs administrativas da IDE. `withGlobalTauri` está desabilitado e o asset protocol fica desativado. A CSP restringe scripts locais e origens de conexão/mídia/imagens; estilos inline são mantidos para a projeção visual existente. Não há permissão genérica para hosts remotos. Futuras integrações nativas devem adicionar permissões específicas, código e testes próprios. Veja [CSP no Tauri 2](https://v2.tauri.app/security/csp/).

Os processos de build ficam no Electron main, com executável/argumentos explícitos e sem shell genérico. A validação de caminhos rejeita traversal e links indevidos, e o gerador escreve em diretórios isolados. Logs de ferramentas externas podem conter caminhos locais e dados fornecidos pela própria ferramenta; revise-os antes de compartilhar.

## PWA e compatibilidade de WebViews

O destino `native` do compilador preserva o bundle web e os assets utilizados, sem emitir registro/worker/manifest de PWA. O gerador também recusa HTML que ainda registre um service worker. O destino web mantém o comportamento PWA existente. O cache Cargo é um cache de compilação, separado de cache/armazenamento do aplicativo.

DOM, navegação, Models, Units, componentes reutilizáveis e eventos TypeScript permanecem no runtime atual. Isso preserva a arquitetura e a tipagem, mas **não comprova compatibilidade de execução em todas as WebViews**. Antes de distribuir, valide pelo menos:

- Páginas, navegação, Button/Edit, RepeatingGroup, DataGrid, Popup, layouts e eventos autorais.
- Login/logout, refresh, CurrentUser, persistência de sessão e erros de rede no RestGO.
- API Client, uploads de arquivo/vídeo e downloads com o CORS e a CSP reais.
- Video Player, codecs, HLS/DASH, autoplay, MSE/DRM e URLs Blob usadas pelo projeto.
- Report Builder: geração PDF, preview em modal/nova janela e download. PDF incorporado, popups e download podem exigir adaptação específica da WebView.
- APIs de contexto seguro, recortes/safe area, teclado e rotação em mobile.

O aplicativo gerado não inclui um plugin nativo de arquivos, download, câmera, notificações ou navegador externo. Uma API web indisponível não recebe automaticamente uma implementação nativa. Use os diagnósticos/logs para identificar a operação e registre a limitação antes de anunciar o destino como validado.

## Exportar para GitHub Actions

**Export for GitHub Actions** grava o frontend já compilado e o projeto Tauri em uma pasta nova, sem exigir Rust na máquina de exportação. A exportação contém `.github/workflows/native-application.yml` para rodar no **repositório do aplicativo do usuário**. O disparo manual permite selecionar desktop, Android, simulador iOS ou dispositivo iOS, e APK/AAB no caso Android. Os jobs mobile usam `configure-mobile.mjs` após a inicialização oficial, aplicando o mesmo contrato da IDE. Revise os runners, ferramentas, arquiteturas, caminhos e variáveis de assinatura antes de habilitá-lo.

Use Windows runner para Windows, Linux compatível para Linux, macOS para macOS/iOS e um runner com SDK/NDK/JDK para Android. O projeto exportado contém o resultado atual do compilador; depois de editar o projeto WebRAD, exporte novamente. Ele não inclui nem requer uma cópia da IDE Electron para executar o frontend.

Certificados e chaves pertencem aos GitHub Secrets/Environments e ao keychain/store temporário do runner. Materialize o keystore/certificado em arquivo temporário durante o job e remova-o ao final. Passe senhas por variáveis de ambiente; mantenha somente os nomes dessas variáveis na configuração versionada. A aprovação do ambiente de distribuição e a publicação em lojas devem ser configuradas pelo proprietário do aplicativo.

O workflow exportado compila/coleta artefatos e não publica aplicativos dos usuários em `Atentor/WebRad`. Os workflows `.github/workflows/release.yml` da IDE, o atualizador Electron e as tags de release do WebRAD permanecem separados. Exportar um workflow não estabelece que ele tenha sido executado ou que todos os runners estejam certificados.

## Troubleshooting

| Sintoma                                        | Verificação e correção                                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rust/Cargo/Tauri CLI ausente                   | Instale explicitamente as ferramentas e reinicie a IDE com PATH/CARGO_HOME corretos. A major da CLI deve ser 2.                                               |
| Windows linker `LNK1104` ao criar build script | Atualize a IDE para usar o cache Cargo em caminho reduzido. Se persistir, verifique espaço em disco e permissão de escrita na pasta de dados da IDE.          |
| Target Rust ausente                            | Execute a instrução `rustup target add` exibida pelo verificador. Isso não instala SDK/linker da plataforma.                                                  |
| Host incompatível                              | Use o sistema exigido ou exporte para o runner adequado. Não selecione iOS em Windows esperando emulação.                                                     |
| SDK Android encontrado, mas build não inicia   | Confira JDK, NDK_HOME, SDK Platform, Build-Tools, Command-line Tools e licenças; leia o primeiro erro Gradle/Tauri.                                           |
| Falha de assinatura                            | Confira identidade/thumbprint, validade, acesso ao store/keychain, nomes/valores das variáveis, Team ID e provisionamento. Não copie segredos para o projeto. |
| Interface abre, mas API/mídia falha            | Confira CSP, origens de redirecionamento, CORS, TLS/mixed content e API da WebView; teste o backend com a origem efetiva.                                     |
| Sessão do Preview não aparece                  | O aplicativo possui outra origem e outro armazenamento. Faça login no aplicativo e teste a política de persistência escolhida.                                |
| Compilador terminou sem instalador             | Verifique o formato selecionado e os logs. Executable (EXE), APP e exportação CI não são instaladores equivalentes a NSIS/MSI/DMG.                            |
| Código zero, mas artefato ausente              | O build permanece Failed. Preserve os logs; confira paths e saída da CLI em vez de apresentar sucesso.                                                        |
| Cancelamento                                   | Aguarde a conclusão Cancelled. Não distribua conteúdo parcial do diretório intermediário/saída.                                                               |

## Estado da validação

| Camada                                                          | Evidência atual                                                                                                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Project Model e retrocompatibilidade                            | Validado: 203 testes do pacote, incluindo 16 casos novos de configuração nativa                                                               |
| Project Settings                                                | Validado: 13 testes de UI, incluindo edição, validação, persistência e ícone nativo                                                           |
| Hello WebRAD                                                    | Validado: compilação real do exemplo e evento TypeScript do bundle em JSDOM; execução em WebView nativa não validada                          |
| Geração Tauri, proteção de caminhos, processos e integração IDE | Validado na suíte completa: 1.649 testes aprovados e 35 testes opcionais ignorados; inclui 36 casos do engine nativo e 15 de pré-requisitos   |
| Configuração Tauri 2                                            | 12 configurações geradas passaram pelo schema JSON oficial; isso não substitui a CLI/toolchain nativa                                         |
| IDE Electron no Windows                                         | Typecheck, lint, formatação, pacote e smokes de desenvolvimento, empacotado e atualizador aprovados                                           |
| Checklist e polimento do Build Application (22/10/2026)         | Smokes focados de desenvolvimento/empacotado aprovados; nove capturas reais, dois temas e duas larguras; Windows x64 com 7/7 checks atendidos |
| Build nativo Windows                                            | Não executado na validação inicial de 21/10/2026 por ausência de toolchain; consultas posteriores não certificam um build                     |
| Build Android                                                   | Não executado na validação inicial de 21/10/2026 por ausência de toolchain Android e Rust                                                     |
| Build Linux/macOS/iOS                                           | Não executado por restrição de host; os runners correspondentes não foram executados nesta mudança                                            |
| WebViews nativas, assinatura, notarização, instalação e lojas   | Não validados; exigem artefatos reais nos destinos apropriados                                                                                |

Para concluir a validação nativa, use `examples/hello-webrad`, retenha os artefatos/versões das ferramentas e execute os fluxos de componentes e RestGO acima nos hosts/dispositivos representativos. Os testes executam processos Node reais para verificar argumentos, logs, timeout e cancelamento de descendentes; essas fixtures não substituem uma compilação Tauri real. A ausência de toolchain deve permanecer identificada como **não executado**, nunca como teste aprovado de distribuição.

O comando de validação reproduzível compila o exemplo, exporta projetos dos 12 formatos/destinos e verifica os pré-requisitos. Quando encontra a toolchain adequada, também tenta o build nativo e valida os artefatos reais:

```powershell
npm.cmd run validate:native-build
```

O relatório fica em `out/native-build-validation/latest-report.json`, com uma cópia por execução em um subdiretório UUID. Cada destino recebe `validated`, `failed`, `not-run-missing-toolchain` ou `not-run-platform`. O relatório diferencia a geração do projeto da compilação nativa e marca a execução em WebView e RestGO nativo como não validadas. **Código de saída zero com destinos não executados não representa sucesso de build nativo**. Na execução inicial de 21/10/2026, os formatos Windows e Android ficaram em `not-run-missing-toolchain`, Linux/macOS/iOS em `not-run-platform` e nenhum artefato nativo foi produzido. As verificações do diálogo em 22/10/2026 detectaram as ferramentas Windows posteriormente instaladas; não reexecutaram esse comando nem produziram um build nativo.
