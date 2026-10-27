# Checklist de release para agentes e mantenedores

Uma alteração só está pronta para release quando o commit que será marcado passou pelo fluxo real de distribuição nos quatro ambientes. Testes locais não substituem essa evidência. As regras desta página complementam [AGENTS.md](../AGENTS.md) e [a documentação de releases](releases.md).

## Execução por agentes

Testes e comandos de validação local só devem ser executados quando o usuário
pedir explicitamente, conforme a [política do AGENTS.md](../AGENTS.md#agent-validation-policy).
Uma solicitação comum de implementação, correção ou documentação não autoriza
testes, smokes, `validate`, typecheck, lint, verificações de formatação, builds ou
empacotamento. Não peça confirmação para executá-los como etapa automática:
entregue as alterações e informe brevemente que a validação não foi solicitada.

Quando o usuário solicitar validação, respeite o escopo pedido. Os comandos
completos abaixo se aplicam a uma solicitação explícita de validação completa
de um candidato a release. As exigências de evidência e os gates de CI/release
continuam obrigatórios para declarar uma versão pronta e publicar uma tag.

## Ao alterar código ou interface

1. Preserve o contrato de produto solicitado. Mudanças em controles, rótulos, navegação, atalhos ou layout exigem revisar também as interações em `apps/ide/main/*smoke*.ts`, o smoke em `main.ts` e as evidências exigidas pelos dois runners em `scripts/smoke-development.mjs` e `scripts/smoke-packaged.mjs`.
2. Atualize o teste para o comportamento atual. Controles removidos de propósito devem ter sua ausência verificada; mantenha as verificações de funcionalidades que continuam disponíveis. Não restaure interface antiga para fazer um teste passar.
3. Se alterar APIs do runtime ou fontes incorporadas, execute `npm run runtime:sources` e versione as fontes geradas correspondentes. Nunca enfraqueça o typecheck, o isolamento do Electron ou as verificações de integridade para liberar um build.
4. Somente quando o usuário solicitar validação completa de um candidato a release, execute os comandos abaixo no checkout final. No PowerShell, use `npm.cmd` no lugar de `npm`.

```sh
npm run validate
npm run smoke:development
npm run smoke:packaged
npm run smoke:packaged -- --webrad-smoke-updates
```

`validate` inclui ícones, fontes incorporadas, TypeScript estrito, lint, testes com diretórios temporários ligados, formatação e empacotamento. Ele não executa os smokes Electron; quando incluídos no escopo solicitado, execute-os separadamente. Os testes compartilham o máximo de dois workers definido em `vitest.config.ts`; não adicione um limite diferente no workflow nem aumente a concorrência para acelerar uma validação local. A comunicação entre workers também deve terminar corretamente: asserções aprovadas com erro de infraestrutura e grupos não executados reprovam a suíte.

Preserve também o setup de turnos reais do event loop entre os casos. Um arquivo com muitos testes TypeScript síncronos pode impedir o atendimento de mensagens RPC pendentes, mesmo com cada asserção aprovada. Não substitua esse limite de escalonamento por uma Promise já resolvida ou por timers simulados, nem amplie o timeout do transporte para contornar a falha.

Os runners isolam o perfil Chromium e o projeto de cada execução. Em uma falha, consulte a mensagem original e `artifacts/smoke/`: são preservados o log bruto, os dados do erro e o projeto de teste, sem copiar o perfil Chromium. No GitHub, esses arquivos ficam no artifact de diagnóstico do job que falhou. Não repita um teste até obter verde sem investigar a falha anterior.

## Renderização das janelas ocultas de smoke

Mantenha a renderização offscreen nas janelas ocultas dos smokes da IDE, tanto em desenvolvimento quanto no aplicativo empacotado. Desativar `backgroundThrottling` não garante a entrega normal de animation frames: a falha de qualidade do commit `8080ca5` foi reproduzida com esperas de aproximadamente um segundo por frame, enquanto a entrada nativa de texto levou apenas dezenas de milissegundos. O smoke de Deploy já utilizava offscreen. Preserve entrada nativa real, geometria do cursor e dos caracteres renderizados, restauração do código, screenshots e verificações de saúde do renderer ao alterar essa configuração. A evidência do cursor registra duração total, tempo de entrada, tempo de frames e maior espera por frame para distinguir atraso de renderização de entrada lenta. Não compense o problema aumentando prazos ou removendo evidências.

A correção local de 22/10/2026 concluiu o smoke de desenvolvimento completo em aproximadamente 35 segundos, dentro dos mesmos 120 segundos. As 24 amostras do cursor passaram de cerca de 32 para 2,6 segundos, mantendo a tolerância de 1,5px e a restauração do código; a maior espera por frame foi de 18ms. `validate` passou com 1.673 testes e 38 skips opcionais, assim como os smokes empacotado e do atualizador no Windows. Esses resultados não substituem a confirmação nativa em Linux/macOS no commit final.

## Antes de criar uma tag

Na verificação `39987745678` (`be52986`), o smoke empacotado do macOS Intel parou esperando o primeiro iframe F9 no teste de título da página; os outros três ambientes passaram. A espera deve verificar o estado atual do renderer ao retomar depois de uma compilação síncrona no processo principal, inclusive quando o prazo venceu entre duas amostras. Não encerre usando apenas o resultado falso anterior à compilação. A regressão `tests/page-title-smoke.test.ts` reproduz esse cenário e mantém a falha quando o Preview continua ausente. Antes de disparar F9 uma única vez, confira o botão disponível e o Save concluído. Preserve os mesmos prazos e registre saída do compilador, estado do Preview, Save e diálogos no timeout. Essa correção de espera exige confirmação no runner macOS Intel; o diagnóstico original não continha a saída do compilador e não prova sozinho que o iframe terminou de carregar.

A inspeção de requisitos do Native Build deve passar `RUSTUP_AUTO_INSTALL=0` aos subprocessos. Os proxies Rustup podem instalar uma toolchain ausente até em consultas de versão; consultar requisitos não deve iniciar downloads nem depender da rede. Preserve a regressão com Rustup real e configuração isolada, os logs de comando/duração dos smokes e os prazos existentes. Nos jobs Windows de `cf26fa9`, ambos os smokes pararam em `Checking requirements`; os logs originais não identificavam o comando pendente. Uma aprovação local com Rust já instalado não cobre esse cenário.

O smoke de restauração Design/Code também deve preservar a altura rolável depois de inserir e remover uma linha longa. O Monaco pode manter a largura anterior em cache até recriar o editor; não deixe a barra horizontal alterar a geometria vertical. A regressão Chromium cobre esse histórico em três larguras, mantendo as verificações de cursor, primeira linha e rolagem. Fixtures de ferramentas ausentes devem isolar também os diretórios do Visual Studio e Windows SDK, para não consultar instalações reais do runner.

Na tentativa `v0.0.12` (`39923680356`), o macOS Intel observou o cursor lógico restaurado com a tela ainda no topo do arquivo. A rotina deve pintar novamente após `restoreViewState`, inclusive na restauração adiada por fontes. A regressão Chromium não pode fornecer essa pintura por conta própria: verifique a primeira linha e o cursor renderizados imediatamente, além do estado após frames. No remount React/Electron, aguarde a primeira linha e a geometria reais do cursor dentro dos mesmos 15 segundos de prontidão; a notificação lógica e dois frames arbitrários não garantem a pintura. Preserve as asserções finais de rolagem e geometria. Os dois runners exigem a evidência `renderer Monaco workspace restored view:` sem relaxar a tolerância geométrica.

1. Envie o commit para `main`, uma branch `codex/verify-release-*` ou abra um pull request. O workflow `release` executa os quatro builds, smokes do aplicativo e atualizador, geração de instaladores e montagem sem publicar. `workflow_dispatch` também permite verificar uma branch existente.
2. Espere os quatro builds e `assemble` terminarem com sucesso. O job `publish` deve estar ignorado nesse modo. Confira também `validate` e `security` e registre o SHA e os links das execuções.
3. A verificação que libera uma tag deve ser um push de `main`/`codex/verify-release-*` ou uma execução manual no **mesmo SHA**. Um pull request detecta falhas antecipadamente, mas seu commit de merge temporário não certifica o SHA final. Após merge/rebase ou qualquer edição, aguarde uma nova verificação do commit final.
4. Somente com autorização do usuário, crie uma nova tag estável `vMAJOR.MINOR.PATCH` no commit aprovado e envie a referência explícita. Não mova uma tag existente. Reexecutar uma tag antiga compila o código antigo; correções exigem um commit que as contenha.

O preflight da tag confere a ancestralidade em `main` e consulta as verificações completas do SHA exato. Exige também sucesso na execução elegível mais recente de `validate` e `security`, sem aceitar um resultado verde antigo para encobrir uma execução posterior pendente ou reprovada. O scan agendado de `security` na `main` conta para esse gate; pushes de tags e pull requests não substituem as verificações de branch ou manuais. Os três gates são consultados novamente antes de publicar. Sem essas aprovações, o script interrompe o fluxo e informa qual workflow precisa ser concluído. O modo de verificação sem publicação continua independente dessas consultas. Essa proteção é deliberada: não a remova para contornar um release bloqueado.

## Ao investigar uma falha

Nas execuções `40480883364` (validate) e `40480883287` (release) do commit
`d62b462`, a correção anterior de arraste/formatação passou pelas suítes
hospedadas: 1.725 testes aprovados e 41 skips opcionais por job. O validate
completo passou em Windows/Linux; os quatro empacotamentos de release também.
Os dois smokes de desenvolvimento falharam na verificação de foco da busca do
Menu. Os quatro smokes empacotados pararam no mesmo trecho desktop, mas seus
logs não preservaram a exceção original; isso não prova qual predicado falhou.

Antes de verificar `:focus-visible` e `:focus-within`, direcione o foco do
webContents para o novo iframe compilado, como no smoke dos ícones. Um
`activeElement` armazenado não substitui a checagem do documento e das
pseudoclasses de foco. Registre esses estados, os contornos interno/externo,
o viewport e os retângulos antes/depois, mantendo os 2px externos, zero contorno
interno, tolerância de 0,5px e limpeza no blur. Os dois runners exigem
`renderer Menu search focus passed: focused Preview iframe,`. Serialize a
mensagem e o stack da asserção dentro do frame antes de devolvê-los ao processo
principal; uma rejeição genérica do Electron pode omitir a causa. O log também
deve preservar valores lançados que não sejam `instanceof Error`. A alteração
local ainda exige confirmação nos quatro runners, sem aumentar prazos,
adicionar tentativas ou alterar o CSS apenas para acomodar um smoke sem foco.

Na validação local de 25/10/2026, o commit `07398e9` parou no lint do preview
do Menu: o estado local deve reiniciar pela identidade do tema, sem um
`setState` síncrono no efeito. Os testes dos novos padrões devem exigir as
referências semânticas de tema; projetos antigos continuam preservando seus
estilos salvos. No smoke de Styles, a fixture antiga HelloWebRad não tem
estilos de Edit, Text Area, Combo Box e List Box: crie amostras temporárias pela
interface quando faltarem e remova-as ao terminar. A amostra de tipografia deve
selecionar Roboto antes de exigir essa fonte; o botão sem fonte explícita também
herda o novo padrão Roboto. Para verificar a troca de tema de um Popup aberto,
associe o estilo padrão à instância da fixture antes da compilação, mantendo as
verificações de identidade, estado e geometria.

O script de inicialização do tema agora precede o bundle no HTML do Preview.
O teste de source maps deve identificar o script pelo `sourceURL` e continuar
comparando seu conteúdo integral. As verificações de remoção de CSS de
componentes ausentes devem procurar seletores de classe, distinguindo-os das
variáveis globais de tema, como `--wr-data-grid-header-background-color`.

No commit `f41d4fc`, a execução `40195347739` esgotou o heap de 2GB nos dois
macOS durante `packages/compiler/tests/compiler.test.ts`. O host do compilador
capturava o Program anterior e formava uma cadeia entre todas as compilações.
Essa referência deve ser liberada em `finally` após `createProgram`, mantendo
a checagem estrita e o reaproveitamento de árvores sem reter o histórico.
Não aumente o heap, o número de workers ou os prazos para contornar essa falha.

Na mesma revisão, `40195347759` falhou no smoke Linux ao medir o painel antes
de criar e estabilizar a área rolável (`scroll: 0`, `delta: -62`). Prepare o
conteúdo, aguarde carregamento/fontes/layout, estabeleça a posição inicial e
role uma única vez; preserve as exigências exatas de 120px e o prazo existente.
O smoke restaura o conteúdo e a posição em `finally`. No Windows, o Save falhou
com `EPERM` na substituição atômica de `index.ts`: a rotina de gravação deve
tratar bloqueios transitórios de compartilhamento com backoff limitado e
propagar bloqueios persistentes, preservando o arquivo anterior e o rollback.

Na execução `40121913310` (`2b2897e`), somente o macOS Intel falhou no primeiro
F9 do título da página. O diagnóstico registrou `Saved`, Run desabilitado e
`Build started` ainda presente; o build permanecia em andamento. Esse estado
difere do Preview concluído com uma leitura antiga no polling. Preserve o
prazo de 20 segundos e consulte as durações de cada etapa registradas como
`[COMPILER] Preview`: gravação, validação, seleção, estilos, geração, typecheck,
bundle, assets, saída e publicação. A checagem TypeScript reaproveita somente
árvores de sintaxe inalteradas do último Program compatível e recalcula os
diagnósticos estritos. O log original não discrimina a etapa lenta; a otimização
de parsing exige confirmação no runner, sem atribuir a ela um ganho medido
localmente ou aumentar prazos para obter aprovação.

No commit `3c3d1b1`, as execuções `40119219411` (release) e `40119219511`
(validate) pararam na geometria do Menu em Windows/Linux. O preset Default usa
a largura disponível do canvas e pode ativar o modo mobile; o smoke deve calcular
esse estado pela largura simulada, verificar também Tablet (768px, não mobile)
e Mobile (390px) e restaurar Default, preservando geometria visual, hitbox e
altura de 48px no modo mobile. Não presuma desktop pelo nome interno do preset.

A execução seguinte, `40120762152` (`8d95388`), passou essa geometria, mas o
Preview compilado continuou mobile em Windows/Linux: seu iframe tem largura
própria, independente do preset do Designer. O smoke controla o viewport da IDE
em 1920x1080 para os cenários desktop vertical/horizontal e em 390x844 para o
drawer mobile. Confira a largura real e o estado responsivo dentro do iframe,
exija a evidência `renderer Menu compiled viewports passed:` nos dois runners e
restaure as métricas em `finally`, inclusive ao falhar. Encontrar o frame não
substitui a aprovação da sua condição de prontidão.

No job Linux de desenvolvimento de `40120762132`, o Monaco exibiu apenas a
classe neutra `mtk1` em todos os tokens de sintaxe durante o prazo existente.
A gramática oficial TypeScript/Monarch deve estar registrada antes de criar os
modelos; mantenha somente o serviço semântico carregado de forma assíncrona.
Preserve as exigências de classes de tokens, cores e palavras-chave do smoke.

O macOS Intel parou antes, esperando o iframe F9 dos ícones. Assim como no smoke
de título, a espera deve ler o renderer novamente após uma compilação síncrona
antes de avaliar o prazo. Aguarde Saved, Run habilitado e ausência de diálogo,
dispare F9 uma vez e registre compilador/Preview no timeout. O log original não
contém esses diagnósticos e não comprova sozinho a causa exclusiva do timeout;
a confirmação no runner permanece necessária.

O job de segurança `40119219393` apontou quatro ocorrências. O exemplo Aurora
contém quatro bindings `apiClientId` com o mesmo UUID do Project Model em
`Data.generated.ts` e `Data.wrpage`. A configuração `.gitleaks.toml` estende todas
as regras padrão e permite somente esse UUID quando associado à propriedade e
a esses caminhos, inclusive no histórico. Preserve o scan completo, a redação
integral dos valores e a saída detalhada para diagnosticar futuras ocorrências;
não ignore commits, diretórios inteiros ou credenciais reais.

Na verificação `39963098127` do commit `b6e1ba4`, somente o Windows falhou: o smoke empacotado aguardou 15 segundos pelo checklist enquanto a consulta final de `rustc.exe --version` ainda estava pendente. Cada processo podia consumir 20 segundos e as consultas eram sequenciais. O log não determina por que esse executável deixou de responder. Preserve o orçamento compartilhado de 10 segundos da inspeção e o limite de 5 segundos por processo, os diagnósticos de ferramentas não verificadas e o cancelamento de descendentes. Não amplie o prazo do smoke nem marque consultas expiradas como ferramentas disponíveis. A regressão cobre processos sem resposta, esgotamento do orçamento e preservação das versões já consultadas.

A regressão com um processo real sem resposta falha no código original após 20,1 segundos e passa com a correção em aproximadamente 5 segundos. A validação local Windows passou com 1.697 testes e 39 skips opcionais, assim como os smokes de desenvolvimento, empacotado e do atualizador. A confirmação do código corrigido nos runners do GitHub permanece pendente do envio do commit.

- Leia o primeiro passo que falhou, o erro funcional no log e o projeto/diagnóstico preservados. Uma lista de evidências ausentes depois do primeiro erro normalmente representa verificações que não chegaram a executar.
- Diferencie falha funcional, seletor desatualizado, corrida assíncrona, limite nativo de janela, falta de dependência e problema externo de rede. Corrija a causa observada; não aumente tolerâncias, workers ou prazos sem evidência.
- Reproduza a causa quando possível e acrescente uma regressão significativa. Preserve as validações de cursor, código, Preview, tipagem, segurança e artefatos que continuam fazendo parte do produto.
- Após a correção, verifique o commit atualizado nos quatro ambientes. Uma execução local Windows não prova Linux/macOS; uma verificação sem publicação não prova que uma Release foi publicada ou que uma atualização instalada funcionou.

## Evidência da correção de 19/10/2026

Na tag `v0.0.7`, a compilação e os testes passaram, mas os smokes falharam procurando `.wr-toolbar select[aria-label="Zoom"]`. A simplificação anterior tinha removido Zoom e Arrange da barra e os testes Electron ainda exigiam ambos. O smoke passou a verificar uma única aba do documento atual, a ausência dos controles removidos e a escala padrão do Designer, mantendo navegação, seleção, responsividade, Monaco, Preview e demais fluxos.

Falhas anteriores de restauração do Monaco, manipulação de texto no macOS e prazo do smoke foram corrigidas em commits anteriores, com releases `v0.0.5` e `v0.0.6` bem-sucedidos. O aprendizado persistente é verificar o caminho completo de release antes da tag, inclusive para mudanças pequenas de interface.

## Diagnóstico da tentativa v0.0.9 de 19/10/2026

A execução `39356337911` falhou no Windows ao aguardar `return;` no handler `PageMainUnauthenticated`: a existência do DOM do Monaco não garante que a navegação, o cursor e o foco nativo já estejam prontos para `insertText`. O smoke passa a aguardar também o handler esperado, o foco no textarea e o cursor do corpo antes de digitar, mantendo as verificações de texto e persistência.

No macOS Intel, o teste de término do runner antecipava o deadline para 250ms e podia matar o processo simulado antes de ele escrever o log. A fixture agora sinaliza prontidão por IPC depois de escrever as evidências e instalar o tratamento de sinal; o teste inclui uma inicialização deliberadamente mais lenta que esse deadline simulado. O prazo de produção de 240 segundos permanece igual.

Os logs e o diagnóstico Windows dessa execução foram examinados sem disparar outro workflow ou gerar/testar um novo release, conforme solicitado pelo usuário. A correção tem cobertura local focada; a confirmação nativa nos quatro ambientes permanece pendente.

## Correção complementar do commit b628fcb em 20/10/2026

As execuções `39404320016` e `39404320095` mostraram que exigir somente `textarea.inputarea` impedia o smoke de continuar em todos os sistemas: o Monaco também usa `.native-edit-context`, habilitado por padrão nessa versão. A expressão compartilhada de prontidão deve aceitar ambos, preservando o handler, o cursor e o foco esperados. O teste Chromium instancia o Monaco real nos dois modos, insere texto pela entrada nativa e verifica o corpo do método pela AST. O teste simulado também deve cobrir ambos os modos; passar apenas com um textarea artificial não comprova compatibilidade com o editor real.

Na validação Windows, as 1.553 asserções passaram, mas a limpeza da suíte Shaka encontrou `EBUSY`. O esbuild captura o cwd quando seu módulo é carregado; `stop()` solicita o encerramento sem aguardar a liberação nativa. Carregue essa dependência antes de simular o cwd do projeto, mantenha uma instância por suíte e confirme que a pasta temporária é removível enquanto o serviço ainda está ativo. Recarregar o módulo a cada caso e parar apenas a última instância não estabelece esse isolamento.

A correção passou localmente pela suíte completa com caminhos temporários ligados (1.554 testes), regressão Chromium nos dois modos de entrada e fluxo Electron completo em desenvolvimento, incluindo persistência do handler e saúde do renderer. Não houve geração ou teste de novo release; a confirmação empacotada e nativa nos demais sistemas permanece pendente.
