# WebRAD

O WebRAD é uma IDE visual RAD multiplataforma para criar aplicações web com formulários, componentes, propriedades, eventos, TypeScript e um fluxo real de compilação e visualização. A IDE desktop utiliza Electron e React; as aplicações geradas utilizam somente tecnologias do navegador.

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

## Validação

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke:packaged
```

Execute toda a sequência com `npm run validate`. Formate o código-fonte com `npm run format` e verifique a formatação com `npm run format:check`. O comando `npm run runtime:sources:check` verifica se o runtime de navegador incorporado ao compilador corresponde ao pacote-fonte.

No PowerShell que bloqueia `npm.ps1`, substitua `npm` por `npm.cmd` nesses comandos. Por exemplo: `npm.cmd run validate`.

## Empacotamento e distribuição

O comando `npm run package` cria uma aplicação não instalada para a plataforma atual. O comando `npm run smoke:packaged` inicia exatamente esse artefato, abre pela IDE uma cópia temporária do projeto Hello, executa F9 pelo fluxo de compilação com IPC tipado, interage com o Preview isolado e verifica o resultado do evento gerado antes de encerrar. O comando `npm run make` aciona os geradores do Electron Forge para produzir os artefatos distribuíveis compatíveis com a plataforma atual.

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
