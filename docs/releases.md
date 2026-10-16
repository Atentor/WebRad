# Releases e atualizações do WebRad

O workflow `.github/workflows/release.yml` responde ao envio de tags estáveis `vMAJOR.MINOR.PATCH` ao repositório privado de código. Ele gera Windows x64 (Setup/Squirrel), Linux x64 (`.deb` e `.rpm`), macOS Intel x64 e macOS Apple Silicon arm64 (ZIP contendo `WebRad.app`). Não há build para iOS.

## Configuração inicial do GitHub

1. Crie **Atentor/WebRad-Releases**, **público**, inicializado com um README. Esse repositório recebe os instaladores e os metadados de atualização. O código-fonte continua em **Atentor/WebRad**, privado. Os arquivos fonte ZIP/TAR que o próprio GitHub oferece na Release são do repositório público de distribuição.
2. Crie um token fine-grained com acesso ao repositório público de distribuição e a permissão **Contents: Read and write**. Se a organização exigir aprovação de tokens, conclua essa aprovação.
3. No repositório **privado de código**, abra **Settings → Secrets and variables → Actions** e crie o Secret **`WEBRAD_RELEASE_TOKEN`** com esse token. O `GITHUB_TOKEN` normal do workflow não tem permissão de escrita em outro repositório.
4. Opcionalmente, crie a variável de Actions **`WEBRAD_RELEASE_REPOSITORY`** no formato `Owner/Repository` para usar outro repositório público. Sem essa variável, o destino é `Atentor/WebRad-Releases`. O mesmo valor é incorporado ao processo principal da aplicação durante o build; nenhum token é incorporado.

O job inicial verifica a tag, o token e a visibilidade pública do destino antes de iniciar os quatro builds. Esta configuração local não cria o repositório remoto nem configura Secrets na conta do GitHub.

## Publicar uma versão

Depois de enviar o commit contendo o workflow e a implementação do atualizador, crie e envie uma nova tag:

```powershell
git tag v0.1.12
git push origin v0.1.12
```

Use uma versão maior que a última publicada. A tag determina a versão do aplicativo: `scripts/release-tools.mjs prepare` altera `package.json` e a entrada raiz do lockfile **somente no checkout temporário do CI**, antes de instalar dependências e compilar. O workflow não incrementa a versão novamente, não cria commits no código privado e não executa `npm run release`.

Cada build executa as verificações de ícones/fontes geradas, typecheck estrito, lint, formatação, testes, empacotamento e smoke do aplicativo empacotado. Há também um smoke específico da interface/IPC de atualização usando um backend de teste, sem instalar software no runner. O Linux configura o sandbox do Electron; os smokes escrevem logs fora do bundle, preservando assinaturas macOS.

A publicação exige os quatro builds completos e confere tamanho e SHA-256 dos pacotes recebidos dos jobs. Cria uma Release em rascunho, envia todos os arquivos e só então a torna pública. Uma falha de upload deixa o rascunho para uma nova execução; uma Release já pública não é sobrescrita. Uma tag antiga não substitui a versão mais recente.

## Comportamento na aplicação

- O WebRad instalado verifica metadados públicos aproximadamente 15 segundos após iniciar e a cada seis horas. **Help → Check for Updates...** permite consultar imediatamente, inclusive sem projeto aberto. A consulta não baixa instaladores.
- Com uma versão maior, aparece **Update** na barra superior, junto ao indicador Beta. O clique inicia o download; antes da instalação, o IDE salva o estado mais recente do projeto, incluindo edições feitas durante o download, e solicita a instalação pelo processo principal. Alterações pendentes em qualquer janela impedem o reinício. Se salvar falhar, a atualização pronta permanece disponível para tentar novamente.
- **Windows instalado por Setup/Squirrel:** o atualizador nativo baixa o pacote NuGet, valida o protocolo Squirrel, instala e reinicia pelo `quitAndInstall()`. Uma cópia portátil deve ser instalada pelo Setup antes de usar esse mecanismo.
- **Linux instalado por pacote:** o executável precisa pertencer ao pacote `webrad`. São suportados APT para `.deb` e DNF/Zypper para `.rpm`, com `pkexec` e um agente de autenticação polkit disponíveis no desktop. O WebRad baixa o pacote correspondente, confere SHA-256/tamanho, solicita autorização do sistema, aguarda o gerenciador de pacotes e reinicia após sucesso. Cancelar a autorização ou falhar a instalação informa o erro e mantém o IDE aberto. Não é executado shell nem um script baixado com privilégios.
- **macOS com Developer ID:** quando a versão instalada e a nova versão são assinadas, usa Squirrel.Mac para baixar, instalar e reiniciar. São selecionados ZIP e feed próprios de cada arquitetura.
- **macOS sem Developer ID:** aparece **Download update**, sem prometer instalação automática. O ZIP é baixado e verificado, e sua localização é exibida no Finder. Substitua `WebRad.app` em Applications manualmente. O macOS pode bloquear a execução de um aplicativo não assinado. Não há alteração das proteções do sistema pelo WebRad.
- **Linux portátil ou sem gerenciador suportado:** oferece download do instalador para instalação manual. Execuções em desenvolvimento e smokes normais não verificam atualizações reais.

As versões anteriores a esta implementação precisam receber a primeira atualização pelo instalador, pois ainda não possuem o atualizador.

## Assinatura macOS opcional

Sem conta Apple, os dois builds macOS geram ZIPs não assinados, e a Release informa essa condição. Para habilitar distribuição assinada e atualização automática nativa, obtenha um certificado **Developer ID Application** pelo Apple Developer Program e configure estes Secrets no repositório privado:

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

A Release pública contém os instaladores, `RELEASES`, o pacote Squirrel `.nupkg`, `webrad-darwin-x64.json`, `webrad-darwin-arm64.json`, `webrad-update.json` e `SHA256SUMS`. O manifest `webrad-update.json`, versão de formato 1, identifica versão estável, data e targets por plataforma, arquitetura, formato, nome de arquivo, tamanho, SHA-256 e indicador de assinatura macOS. Os feeds macOS usam o formato estático Squirrel (`currentRelease`/`releases`/`updateTo`). O aplicativo consulta `releases/latest/download/webrad-update.json` e fixa os downloads na tag concreta encontrada.

A ponte preload expõe somente `getState()`, `check()`, `download()`, `install()` e uma assinatura de estados. IPC valida a origem e o frame principal confiável; não aceita URL, caminho, token ou comando vindo do renderer. Downloads próprios aceitam HTTPS e validam cada redirecionamento para os hosts de assets do GitHub, com limites de tempo/tamanho. Windows e macOS assinados usam as verificações dos atualizadores nativos. Esse recurso pertence ao IDE desktop; os projetos e as aplicações web exportadas não recebem dependências do Electron ou do atualizador.

Referências: [Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater), [assinatura macOS no Forge](https://www.electronforge.io/guides/code-signing/code-signing-macos), [feed Squirrel.Mac](https://github.com/Squirrel/Squirrel.Mac#update-file-json-format).
