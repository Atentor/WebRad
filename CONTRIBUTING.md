# Contribuindo com o WebRAD

Leia as [regras de engenharia](AGENTS.md) e a [arquitetura](docs/architecture.md)
antes de alterar os limites entre os pacotes. O modelo versionado do projeto é a
fonte de verdade; Designer e runtime devem permanecer separados.

## Preparar o ambiente

Use Node.js 26.12.1 ou mais recente e npm 12.2.1 ou mais recente, conforme
`engines` e `packageManager` do [package.json](package.json):

```sh
npm ci
npm start
```

No PowerShell, utilize `npm.cmd` se a política de execução bloquear `npm.ps1`.
O desenvolvimento e os testes locais não precisam de tokens do GitHub,
credenciais Apple ou uma instância do RestGo. Testes opcionais que dependem de
um navegador ou serviço externo informam os seus requisitos no próprio teste.

## Enviar uma alteração

1. Descreva o problema em uma issue ou no pull request e mantenha a alteração
   concentrada nesse problema.
2. Preserve arquivos TypeScript escritos pelo usuário. Alterações programáticas
   nesses arquivos devem utilizar a AST do TypeScript.
3. Atualize a documentação e `PLANS.md` quando o comportamento ou o formato
   persistente mudar. APIs de componentes precisam manter modelo, Registry,
   Designer, runtime, Monaco e compilador em paridade.
4. Execute as verificações antes de enviar:

   ```sh
   npm run runtime:sources
   npm run validate
   ```

   `validate` verifica ícones, fontes geradas, tipos, lint, testes, formatação e
   empacotamento para a plataforma atual. Para alterações de interface, runtime,
   compilação ou Electron, execute também os smokes relevantes descritos no
   [README](README.md). Informe separadamente o que foi verificado ao vivo e o
   que foi apenas analisado ou testado sem interface.

5. Informe no pull request o comportamento resultante, os testes executados e
   qualquer limitação de plataforma. Não gere instaladores, incremente versões
   nem publique releases como parte de uma contribuição comum.

Não envie credenciais, dados de clientes, arquivos `.env`, preferências locais,
capturas temporárias ou artefatos de build. Use exemplos fictícios. Relate
vulnerabilidades conforme a [política de segurança](SECURITY.md).

A proteção de branches, os checks obrigatórios e o relato privado de
vulnerabilidades são configurações do GitHub que o mantenedor precisa revisar.
Os workflows versionados não habilitam essas opções automaticamente.

## Licença

As contribuições ao código original do WebRAD são recebidas sob a
[licença MIT](LICENSE). Ao incorporar código ou arquivos de terceiros, preserve
os avisos e registre a origem em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
