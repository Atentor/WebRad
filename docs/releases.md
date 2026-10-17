# Releases e atualizações do WebRad

O workflow `.github/workflows/release.yml` responde ao envio de tags estáveis `vMAJOR.MINOR.PATCH` ao repositório público **Atentor/WebRad**. Ele gera Windows x64 (Setup/Squirrel), Linux x64 (`.deb` e `.rpm`), macOS Intel x64 e macOS Apple Silicon arm64 (ZIP contendo `WebRad.app`) e publica os arquivos em [Releases do próprio WebRad](https://github.com/Atentor/WebRad/releases). Não há build para iOS.

## Configuração inicial do GitHub

1. Mantenha **Atentor/WebRad** público e o GitHub Actions habilitado. As tags, o código e os instaladores ficam no mesmo repositório; os arquivos fonte ZIP/TAR oferecidos pelo GitHub correspondem à própria tag do WebRad.
2. O workflow usa o **`GITHUB_TOKEN`** fornecido automaticamente pelo GitHub Actions. A permissão padrão é **Contents: Read**; somente o job `publish` recebe **Contents: Write** para criar a Release e anexar os instaladores. Não é necessário criar um token fine-grained para essa publicação.
3. O destino vem de **`${{ github.repository }}`**, e o mesmo valor é incorporado ao processo principal durante o build. Nenhum token é incorporado ao aplicativo. A variável de Actions antiga `WEBRAD_RELEASE_REPOSITORY` não altera mais o destino; ela e o Secret `WEBRAD_RELEASE_TOKEN` podem ser removidos, pois este workflow não os utiliza.

O job inicial verifica a tag, o acesso do token e a visibilidade pública do próprio repositório antes de iniciar os quatro builds. Nenhum repositório separado de instaladores é necessário.

## Verificar os quatro sistemas antes de publicar

O mesmo workflow também executa sem publicação em branches `codex/verify-release-*` e pelo botão **Run workflow** do GitHub Actions. Esse modo usa a versão temporária `0.0.0` somente no checkout do CI, executa os quatro builds, os smokes do aplicativo e do atualizador, gera todos os instaladores e confere a montagem completa dos artefatos. O resultado fica no artifact `release-assembled`; nenhuma tag ou Release é criada. A execução manual estará disponível quando a definição atualizada estiver na branch padrão.

A montagem usa um token somente de leitura. O job de publicação recebe permissão de escrita apenas em pushes de tags, depois da montagem aprovada; o script também recusa publicação quando `WEBRAD_RELEASE_VERIFY_ONLY` está ativo. Um novo commit em uma branch de verificação substitui sua execução anterior. Tags diferentes compilam de forma independente; somente os jobs de publicação são serializados, com uma fila de até 100 execuções pendentes, sem descartar a publicação anterior quando outra tag chega. Uma reexecução de uma tag antiga mantém o commit original e não aplica correções posteriores.

## Publicar uma versão

O histórico público da `main` tem um novo ponto inicial em 17 de outubro de 2026, com a versão do código preservada em `0.1.11`. Crie novas tags a partir dessa `main`; não restaure tags ou branches do histórico anterior. Veja [o ponto inicial e as orientações para clones existentes](history-baseline.md).

Depois de enviar o commit contendo o workflow e a implementação do atualizador, crie e envie uma nova tag:

```powershell
git tag v0.1.12
git push origin v0.1.12
```

Use uma versão maior que a última publicada, considerando também versões já distribuídas pelo repositório anterior. O preflight exige que a tag aponte para a `main` ou um ancestral dela e rejeita tags fora desse histórico. A tag determina a versão do aplicativo: `scripts/release-tools.mjs prepare` altera `package.json` e a entrada raiz do lockfile **somente no checkout temporário do CI**, antes de instalar dependências e compilar. O workflow não incrementa a versão novamente, não cria commits e não executa `npm run release`.

Cada build executa as verificações de ícones/fontes geradas, typecheck estrito, lint, formatação, testes, empacotamento e smoke do aplicativo empacotado. Há também um smoke específico da interface/IPC de atualização usando um backend de teste, sem instalar software no runner. No Linux, o workflow instala o executável de desenvolvimento do Electron sob demanda antes de localizar e configurar os dois helpers `chrome-sandbox`, de desenvolvimento e do pacote. Os smokes escrevem logs fora do bundle, preservando assinaturas macOS.

O empacotamento inclui os avisos de terceiros em `THIRD_PARTY_LICENSES.txt`. Os pacotes nativos `@img/sharp-libvips-*` usados no Linux e no macOS publicam sua tabela de licenças na seção `Licensing` do `README.md`, sem um arquivo `LICENSE` separado; o gerador preserva esse README quando não há outro texto de licença no pacote. Dependências instaladas sem um aviso reconhecido continuam interrompendo o build. A falha `No license text found for @img/sharp-libvips-...` na tag `v0.0.11` veio dessa coleta de avisos, depois dos testes e antes da publicação.

Os testes do release e de `npm run validate` usam `npm run test:portable`: a suíte completa roda com `TEMP`, `TMP` e `TMPDIR` apontando para um symlink/junction temporário. Isso verifica em todos os sistemas os casos em que o caminho lógico difere do caminho físico, como `/var` e `/private/var` no macOS. Fixtures e smokes usam o caminho físico para operações que atravessam processos; as proteções de Deploy contra links permanecem ativas. O limite continua em dois workers. Para reproduzir somente a montagem/publicação simulada, execute `npm run test:portable -- tests/releases.test.ts`.

O smoke também verifica cursor, rolagem e código preservados ao alternar entre Design e Code. O wrapper React cria o Monaco em um contêiner oculto: a restauração primeiro mede o contêiner já visível, depois renderiza as linhas iniciais e aplica o viewport salvo. Isso mantém a extensão horizontal de linhas que ficarão fora da área visível. A comparação do código renderizado ordena as linhas pela posição visual, pois o Monaco pode reciclar os elementos do DOM. A regressão `tests/monaco-view-state.browser.test.ts` reproduz essa montagem oculta com layout automático, fontes e Monaco reais em três larguras; pode ser executada separadamente ao definir `WEBRAD_BROWSER_PATH` para um executável Chromium/Chrome.

As variantes responsivas da API Client mantêm a largura solicitada e aguardam o renderer acompanhar a altura real permitida pela janela nativa. Assim, uma tela menor no runner macOS continua verificando colunas, empilhamento, conteúdo, rodapé e ausência de overflow, sem exigir uma altura que o sistema operacional limita. Nos testes da API Client e Data Grid, o mínimo temporário da janela é explicitamente positivo (`1x1`): no Electron 43, `0x0` não remove o mínimo anterior da janela Cocoa, embora a consulta lógica reporte zero. Falhas de redimensionamento registram as dimensões solicitadas, nativas, do renderer e o mínimo informado pelo Electron.

`npm run smoke:viewport` verifica diretamente o redimensionamento em um Electron com sandbox, sem compilar o IDE. O workflow executa essa checagem nos dois Macs logo após `npm ci`, antes da suíte completa, para detectar restrições nativas cedo. O smoke completo continua verificando as larguras exatas de 1080 e 740 pixels.

O smoke de desenvolvimento separa a inicialização fria do Forge/Vite da execução das verificações: até 120 segundos para carregar o renderer e, depois, 120 segundos para o fluxo funcional (180 no debugger). Os limites de cada interação e as evidências obrigatórias permanecem ativos; falhas informam a fase, o prazo e o último progresso. O setup granular do Monaco registra estaticamente o recurso público `dropOrPasteInto` antes do primeiro editor, preservando os serviços necessários quando o TypeScript é carregado sob demanda e o editor é recriado.

Nos smokes Linux, cada execução do Xvfb recebe um arquivo de autenticação privado criado por `mktemp` em `RUNNER_TEMP`, removido ao encerrar o passo. Isso evita a limpeza do diretório temporário interno do `xvfb-run` que falhou no runner, preservando a autorização X11, o sandbox do Electron e o código de saída do teste. Erros do servidor virtual são enviados ao log do passo.

A publicação exige os quatro builds completos e confere tamanho e SHA-256 dos pacotes recebidos dos jobs. Depois da transferência dos artefatos para o job de publicação, repete a validação dos pacotes e exige o conjunto exato de arquivos e o `SHA256SUMS` correspondente, incluindo Setup, feeds e metadados auxiliares. Confirma que a tag já existe no repositório, cria uma Release em rascunho, envia todos os arquivos e só então a torna pública. Uma falha de upload deixa o rascunho para uma nova execução; uma Release já pública não é sobrescrita. Uma tag antiga não substitui a versão mais recente; essa comparação consulta todas as páginas de Releases existentes.

## Comportamento na aplicação

- O WebRad instalado verifica metadados públicos aproximadamente 15 segundos após iniciar e a cada seis horas. **Help → Check for Updates...** permite consultar imediatamente, inclusive sem projeto aberto. A consulta não baixa instaladores.
- Somente após confirmar uma versão maior no GitHub, aparece **Update** na barra superior, junto ao indicador Beta. O botão fica oculto durante a consulta, quando a versão já está atualizada ou quando a consulta falha. O clique inicia o download; o nome permanece **Update**, com progresso no tooltip e bloqueio de novos cliques durante download/instalação. Antes da instalação, o IDE salva o estado mais recente do projeto, incluindo edições feitas durante o download, e solicita a instalação pelo processo principal. Alterações pendentes em qualquer janela impedem o reinício. Se salvar falhar, a atualização pronta permanece disponível para tentar novamente.
- **Windows instalado por Setup/Squirrel:** o atualizador nativo baixa o pacote NuGet, valida o protocolo Squirrel, instala e reinicia pelo `quitAndInstall()`. Uma cópia portátil deve ser instalada pelo Setup antes de usar esse mecanismo.
- **Linux instalado por pacote:** o executável precisa pertencer ao pacote `webrad`. São suportados APT para `.deb` e DNF/Zypper para `.rpm`, com `pkexec` e um agente de autenticação polkit disponíveis no desktop. O WebRad baixa o pacote correspondente, confere SHA-256/tamanho, solicita autorização do sistema, aguarda o gerenciador de pacotes e reinicia após sucesso. Cancelar a autorização ou falhar a instalação informa o erro e mantém o IDE aberto. Não é executado shell nem um script baixado com privilégios.
- **macOS com Developer ID:** quando a versão instalada e a nova versão são assinadas, usa Squirrel.Mac para baixar, instalar e reiniciar. São selecionados ZIP e feed próprios de cada arquitetura.
- **macOS sem Developer ID:** **Update** oferece download manual, explicado no tooltip. O ZIP é baixado e verificado, e sua localização é exibida no Finder. Substitua `WebRad.app` em Applications manualmente. O macOS pode bloquear a execução de um aplicativo não assinado. Não há alteração das proteções do sistema pelo WebRad.
- **Linux portátil ou sem gerenciador suportado:** oferece download do instalador para instalação manual. Execuções em desenvolvimento e smokes normais não verificam atualizações reais.

As versões anteriores a esta implementação precisam receber a primeira atualização pelo instalador, pois ainda não possuem o atualizador.

Versões já instaladas que consultam `Atentor/WebRad-Releases` continuam usando o endereço incorporado naquele build. Para migrar, instale uma vez a nova versão disponível nas Releases de **Atentor/WebRad**. A partir desse build, as verificações e os downloads usam o próprio repositório WebRad. O workflow não transfere nem apaga Releases antigas do repositório anterior.

## Assinatura macOS opcional

Sem conta Apple, os dois builds macOS geram ZIPs não assinados, e a Release informa essa condição. Para habilitar distribuição assinada e atualização automática nativa, obtenha um certificado **Developer ID Application** pelo Apple Developer Program e configure estes Secrets em **Atentor/WebRad**:

| Secret                        | Conteúdo                                                                 |
| ----------------------------- | ------------------------------------------------------------------------ |
| `APPLE_CERTIFICATE_BASE64`    | Certificado com chave privada, exportado em `.p12`, codificado em base64 |
| `APPLE_CERTIFICATE_PASSWORD`  | Senha do `.p12`                                                          |
| `APPLE_SIGNING_IDENTITY`      | Identidade completa `Developer ID Application: ... (TEAMID)`             |
| `APPLE_ID`                    | Conta Apple usada para notarização                                       |
| `APPLE_APP_SPECIFIC_PASSWORD` | Senha específica de aplicativo da conta Apple                            |
| `APPLE_TEAM_ID`               | Identificador do time Apple                                              |

O workflow importa o certificado em um keychain temporário e o remove ao terminar. Forge assina com hardened runtime, usa os entitlements versionados e solicita notarização. Se um certificado for fornecido sem as outras credenciais, o build falha com indicação da configuração faltante. A passagem de uma instalação não assinada para uma assinada exige uma primeira substituição manual.

## Contrato de distribuição

A Release pública contém os instaladores, `RELEASES`, o pacote Squirrel `.nupkg`, `webrad-darwin-x64.json`, `webrad-darwin-arm64.json`, `webrad-update.json` e `SHA256SUMS`. O manifest `webrad-update.json`, versão de formato 1, identifica versão estável, data e targets por plataforma, arquitetura, formato, nome de arquivo, tamanho, SHA-256 e indicador de assinatura macOS. Os feeds macOS usam o formato estático Squirrel (`currentRelease`/`releases`/`updateTo`). O aplicativo consulta `https://github.com/Atentor/WebRad/releases/latest/download/webrad-update.json` e fixa os downloads na tag concreta encontrada.

A ponte preload expõe somente `getState()`, `check()`, `download()`, `install()` e uma assinatura de estados. IPC valida a origem e o frame principal confiável; não aceita URL, caminho, token ou comando vindo do renderer. Downloads próprios aceitam HTTPS e validam cada redirecionamento para os hosts de assets do GitHub, com limites de tempo/tamanho. Windows e macOS assinados usam as verificações dos atualizadores nativos. Esse recurso pertence ao IDE desktop; os projetos e as aplicações web exportadas não recebem dependências do Electron ou do atualizador.

Referências: [Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater), [assinatura macOS no Forge](https://www.electronforge.io/guides/code-signing/code-signing-macos), [feed Squirrel.Mac](https://github.com/Squirrel/Squirrel.Mac#update-file-json-format).
