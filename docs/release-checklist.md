# Checklist de release para agentes e mantenedores

Uma alteração só está pronta para release quando o commit que será marcado passou pelo fluxo real de distribuição nos quatro ambientes. Testes locais não substituem essa evidência. As regras desta página complementam [AGENTS.md](../AGENTS.md) e [a documentação de releases](releases.md).

## Ao alterar código ou interface

1. Preserve o contrato de produto solicitado. Mudanças em controles, rótulos, navegação, atalhos ou layout exigem revisar também as interações em `apps/ide/main/*smoke*.ts`, o smoke em `main.ts` e as evidências exigidas pelos dois runners em `scripts/smoke-development.mjs` e `scripts/smoke-packaged.mjs`.
2. Atualize o teste para o comportamento atual. Controles removidos de propósito devem ter sua ausência verificada; mantenha as verificações de funcionalidades que continuam disponíveis. Não restaure interface antiga para fazer um teste passar.
3. Se alterar APIs do runtime ou fontes incorporadas, execute `npm run runtime:sources` e versione as fontes geradas correspondentes. Nunca enfraqueça o typecheck, o isolamento do Electron ou as verificações de integridade para liberar um build.
4. Execute os comandos abaixo no checkout final. No PowerShell, use `npm.cmd` no lugar de `npm`.

```sh
npm run validate
npm run smoke:development
npm run smoke:packaged
npm run smoke:packaged -- --webrad-smoke-updates
```

`validate` inclui ícones, fontes incorporadas, TypeScript estrito, lint, testes com diretórios temporários ligados, formatação e empacotamento. Ele não executa os smokes Electron: execute-os separadamente. Os testes compartilham o máximo de dois workers definido em `vitest.config.ts`; não adicione um limite diferente no workflow nem aumente a concorrência para acelerar uma validação local. A comunicação entre workers também deve terminar corretamente: asserções aprovadas com erro de infraestrutura e grupos não executados reprovam a suíte.

Preserve também o setup de turnos reais do event loop entre os casos. Um arquivo com muitos testes TypeScript síncronos pode impedir o atendimento de mensagens RPC pendentes, mesmo com cada asserção aprovada. Não substitua esse limite de escalonamento por uma Promise já resolvida ou por timers simulados, nem amplie o timeout do transporte para contornar a falha.

Os runners isolam o perfil Chromium e o projeto de cada execução. Em uma falha, consulte a mensagem original e `artifacts/smoke/`: são preservados o log bruto, os dados do erro e o projeto de teste, sem copiar o perfil Chromium. No GitHub, esses arquivos ficam no artifact de diagnóstico do job que falhou. Não repita um teste até obter verde sem investigar a falha anterior.

## Renderização das janelas ocultas de smoke

Mantenha a renderização offscreen nas janelas ocultas dos smokes da IDE, tanto em desenvolvimento quanto no aplicativo empacotado. Desativar `backgroundThrottling` não garante a entrega normal de animation frames: a falha de qualidade do commit `8080ca5` foi reproduzida com esperas de aproximadamente um segundo por frame, enquanto a entrada nativa de texto levou apenas dezenas de milissegundos. O smoke de Deploy já utilizava offscreen. Preserve entrada nativa real, geometria do cursor e dos caracteres renderizados, restauração do código, screenshots e verificações de saúde do renderer ao alterar essa configuração. A evidência do cursor registra duração total, tempo de entrada, tempo de frames e maior espera por frame para distinguir atraso de renderização de entrada lenta. Não compense o problema aumentando prazos ou removendo evidências.

A correção local de 22/10/2026 concluiu o smoke de desenvolvimento completo em aproximadamente 35 segundos, dentro dos mesmos 120 segundos. As 24 amostras do cursor passaram de cerca de 32 para 2,6 segundos, mantendo a tolerância de 1,5px e a restauração do código; a maior espera por frame foi de 18ms. `validate` passou com 1.673 testes e 38 skips opcionais, assim como os smokes empacotado e do atualizador no Windows. Esses resultados não substituem a confirmação nativa em Linux/macOS no commit final.

## Antes de criar uma tag

A inspeção de requisitos do Native Build deve passar `RUSTUP_AUTO_INSTALL=0` aos subprocessos. Os proxies Rustup podem instalar uma toolchain ausente até em consultas de versão; consultar requisitos não deve iniciar downloads nem depender da rede. Preserve a regressão com Rustup real e configuração isolada, os logs de comando/duração dos smokes e os prazos existentes. Nos jobs Windows de `cf26fa9`, ambos os smokes pararam em `Checking requirements`; os logs originais não identificavam o comando pendente. Uma aprovação local com Rust já instalado não cobre esse cenário.

O smoke de restauração Design/Code também deve preservar a altura rolável depois de inserir e remover uma linha longa. O Monaco pode manter a largura anterior em cache até recriar o editor; não deixe a barra horizontal alterar a geometria vertical. A regressão Chromium cobre esse histórico em três larguras, mantendo as verificações de cursor, primeira linha e rolagem. Fixtures de ferramentas ausentes devem isolar também os diretórios do Visual Studio e Windows SDK, para não consultar instalações reais do runner.

Na tentativa `v0.0.12` (`39923680356`), o macOS Intel observou o cursor lógico restaurado com a tela ainda no topo do arquivo. A rotina deve pintar novamente após `restoreViewState`, inclusive na restauração adiada por fontes. A regressão Chromium não pode fornecer essa pintura por conta própria: verifique a primeira linha e o cursor renderizados imediatamente, além do estado após frames. No remount React/Electron, aguarde a primeira linha e a geometria reais do cursor dentro dos mesmos 15 segundos de prontidão; a notificação lógica e dois frames arbitrários não garantem a pintura. Preserve as asserções finais de rolagem e geometria. Os dois runners exigem a evidência `renderer Monaco workspace restored view:` sem relaxar a tolerância geométrica.

1. Envie o commit para `main`, uma branch `codex/verify-release-*` ou abra um pull request. O workflow `release` executa os quatro builds, smokes do aplicativo e atualizador, geração de instaladores e montagem sem publicar. `workflow_dispatch` também permite verificar uma branch existente.
2. Espere os quatro builds e `assemble` terminarem com sucesso. O job `publish` deve estar ignorado nesse modo. Confira também `validate` e `security` e registre o SHA e os links das execuções.
3. A verificação que libera uma tag deve ser um push de `main`/`codex/verify-release-*` ou uma execução manual no **mesmo SHA**. Um pull request detecta falhas antecipadamente, mas seu commit de merge temporário não certifica o SHA final. Após merge/rebase ou qualquer edição, aguarde uma nova verificação do commit final.
4. Somente com autorização do usuário, crie uma nova tag estável `vMAJOR.MINOR.PATCH` no commit aprovado e envie a referência explícita. Não mova uma tag existente. Reexecutar uma tag antiga compila o código antigo; correções exigem um commit que as contenha.

O preflight da tag confere a ancestralidade em `main` e consulta as verificações completas do SHA exato. Sem uma verificação aprovada, ele interrompe o fluxo antes dos quatro builds e informa como obter a evidência. Essa proteção é deliberada: não a remova para contornar um release bloqueado.

## Ao investigar uma falha

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
