# Revisão do próximo release — 26/10/2026

O checkout local ainda não está pronto para receber a próxima tag. O commit
`2881db8f8f0ded3ff30f4a5c0e8927ee4d84ccac` tem evidência de CI aprovada e já foi
publicado como `v0.0.15`, mas as mudanças posteriores de Menu, Designer e Preview
continuam fora de commit e sem verificação correspondente.

Esta revisão foi feita por leitura de código, diffs, documentação e resultados
existentes do GitHub Actions. Não foram executados testes, smokes, typecheck,
lint, formatação, builds, instalação de dependências ou geração de instaladores.
Os problemas abaixo foram identificados estaticamente, sem reprodução nesta
revisão. A etapa original não alterou código de produto ou gates; as correções
autorizadas posteriormente estão registradas a seguir.

## Validação posterior — reprovada

Após solicitação explícita para executar todos os testes, a rodada de
26/10/2026 concluiu a suíte portable com Chrome: 1.764 testes aprovados,
2 reprovados e nenhum ignorado, em 230 arquivos. Dos 13 smokes Electron,
9 passaram e 4 falharam ao verificar o retorno por Stop do Preview. O typecheck
apontou 2 erros e a formatação, 6 arquivos. Ícones, fontes incorporadas, lint
e empacotamento Windows x64 passaram. Não foram feitas correções nesta rodada.
O relatório completo e os diagnósticos estão em
`artifacts/test-run-2026-10-26-full/REPORT.md`. O checkout segue reprovado para
release; a evidência é local Windows, sem confirmação hospedada do commit final.

## Correções aplicadas antes da validação

Os três achados foram corrigidos localmente em 26/10/2026:

- F9 distingue a normalização limpa do Save de edições e trocas de projeto,
  verifica o contexto do projeto e estabelece a revisão do build após o Save.
  Stop e alterações posteriores continuam invalidando resultados tardios.
- O relay de eventos foi movido para `packages/runtime/src/menu-events.ts`,
  módulo interno sem exportação pela API pública ou pelos subpaths do pacote.
  As fontes incorporadas foram regeneradas com `npm.cmd run runtime:sources`.
- O preflight e a publicação exigem também a execução elegível mais recente de
  `validate` e `security` concluída com sucesso no SHA exato. A consulta inclui
  todas as páginas e bloqueia falhas, cancelamentos e execuções pendentes, sem
  usar uma aprovação anterior para mascará-los. O modo sem publicação e o gate
  existente dos quatro ambientes foram preservados.

Foram atualizadas a fixture existente do GitHub CLI e a expectativa existente
das consultas paginadas, sem criar ou ampliar suítes. Não foram executados testes,
smokes, verificações de fontes geradas, typecheck, lint, formatação, builds ou
instaladores. A implementação não estabelece prontidão de release: ainda falta
validar o checkout e obter aprovação dos workflows no commit final. Não houve
commit, push, alteração de versão, criação de tag ou publicação.

## Achados da revisão original

### 1. F9 pode cancelar o próprio Preview durante o Save

Prioridade P2. Em `apps/ide/renderer/src/App.tsx:1841`, o Preview é ativado e o
identificador do build é capturado antes de `projectController.save()`. O efeito
de revisão em `App.tsx:508` invalida esse identificador e desativa o Preview
quando a revisão muda, inclusive durante esse Save.

O Save pode mudar a revisão legitimamente: `ProjectController.#saveUntilCurrent`
remove handlers vazios com `pruneEmptyEventHandlers`, e `#acceptSavedSession`
incrementa a revisão quando o conteúdo retornado difere do conteúdo em memória
(`apps/ide/renderer/src/state/project-controller.ts:650`).

Exemplo: criar um handler na Interaction, deixá-lo vazio e pressionar F9 sem
salvar antes. A limpeza do handler altera a revisão; o Preview pode fechar e o
build ser abortado ou seu resultado ser descartado. O usuário precisa repetir F9.

Correção proposta: estabelecer a revisão de compilação depois do Save e
distinguir a normalização desse Save das edições ou trocas de projeto que devem
invalidar a execução. Preservar a proteção contra resultado tardio depois de Stop.

### 2. Nova exportação do runtime não existe no contrato do Monaco

Prioridade P2. `packages/runtime/src/menu.ts:33` exporta
`bindWebMenuEventHost`, e `packages/runtime/src/index.ts:3` reexporta todo o
módulo Menu. Porém, o filtro de declarações em
`scripts/sync-runtime-sources.mjs:347` aceita somente nomes `WebMenu*` e algumas
funções explicitamente listadas. A nova função não consta em
`packages/language/src/menu-typings.generated.json` nem nas declarações manuais.

Consequência: o pacote real expõe uma função que o código autoral no Monaco não
consegue importar com o mesmo contrato tipado. Regenerar as fontes sem ajustar
o filtro não resolve essa divergência.

Correção proposta: manter o relay como implementação interna, sem reexportá-lo
pela API pública, ou assumir sua API pública e incluir sua declaração no contrato
do Monaco e nas fontes geradas.

### 3. O preflight não impõe todos os gates exigidos pelo checklist

Prioridade P2; lacuna preexistente de automação. A função
`requireVerifiedCommit`, em `scripts/release-tools.mjs:106`, consulta somente
execuções aprovadas de `release.yml` para o SHA exato. O job `publish` depende de
`preflight` e `assemble`, sem consultar `validate.yml` e `security.yml`.

Assim, uma verificação de release aprovada pode liberar a tag mesmo que o smoke
de desenvolvimento de `validate` ou o scan de segredos de `security` falhe.
Essas verificações não são integralmente cobertas pelo workflow de release.
O checklist exige conferir os três workflows, mas parte dessa obrigação ainda
depende do mantenedor. Não há evidência de falha desses gates no commit atual.

Correção proposta: fazer o preflight exigir também os resultados apropriados de
`validate` e `security` no mesmo SHA, preservando os quatro builds, a montagem,
as permissões e a restrição de publicações a tags estáveis. Até lá, conferir os
três workflows manualmente antes de autorizar a tag.

## Evidência existente consultada

Todos os resultados desta tabela pertencem ao SHA
`2881db8f8f0ded3ff30f4a5c0e8927ee4d84ccac`, sem as mudanças locais posteriores.

| Evidência | Resultado observado |
| --- | --- |
| [Release sem publicação — 40222242490](https://github.com/Atentor/WebRad/actions/runs/40222242490) | Quatro builds e assemble aprovados; publish ignorado, conforme esperado. |
| [Validate — 40222242485](https://github.com/Atentor/WebRad/actions/runs/40222242485) | Jobs Windows e Linux aprovados. |
| [Security — 40222242515](https://github.com/Atentor/WebRad/actions/runs/40222242515) | Workflow aprovado. |
| [Publicação — 40225939952](https://github.com/Atentor/WebRad/actions/runs/40225939952) | Quatro builds, assemble e publish aprovados. |
| [Security agendado — 40347945722](https://github.com/Atentor/WebRad/actions/runs/40347945722) | Workflow aprovado em 26/10/2026. |
| [Release v0.0.15](https://github.com/Atentor/WebRad/releases/tag/v0.0.15) | Publicado em 25/10/2026 com 11 assets, incluindo instaladores das quatro plataformas, feeds e SHA256SUMS. |

O macOS permanece distribuído sem assinatura, conforme as notas da versão
publicada; sua atualização automática exige a configuração de assinatura já
documentada em [releases.md](releases.md).

## Empacotamento e preparação

Não foi identificado um defeito adicional por leitura em `forge.config.ts`.
As dependências nativas são copiadas no hook de empacotamento; os recursos de
compilação e licenças estão configurados; os fuses de isolamento e integridade
continuam habilitados. Isso não comprova um novo pacote do checkout atual.

`WebRAD-Dev Setup.exe` é o nome local intencional. O staging renomeia o Setup
oficial conforme a tag. A versão local `0.1.12` também é intencionalmente
independente: o workflow aplica a versão da tag ao checkout temporário. Nenhuma
dessas diferenças exige aumentar a versão local para preparar a publicação.

Para a próxima versão de patch, `v0.0.16` é uma proposta baseada na última
publicação consultada; confirmar a versão disponível quando houver autorização
para publicar. Nenhuma tag foi criada.

Antes da tag: validar as correções, incluir os arquivos novos de implementação
e smoke junto das alterações rastreadas, e obter evidência no commit final.
O conjunto novo inclui `PreviewWorkspace`, seu smoke e os módulos de feedback
de inserção do Designer e o módulo interno `menu-events.ts`; deixar esses arquivos
fora do commit quebra os imports.
O checklist de [release](release-checklist.md) define os comandos de validação
completa quando forem explicitamente solicitados. Depois do envio autorizado,
aguardar `validate`, `security`, os quatro builds de `release` e `assemble` no
SHA final antes de criar uma nova tag com autorização para publicação.
