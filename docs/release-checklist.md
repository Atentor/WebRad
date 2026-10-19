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

`validate` inclui ícones, fontes incorporadas, TypeScript estrito, lint, testes com diretórios temporários ligados, formatação e empacotamento. Ele não executa os smokes Electron: execute-os separadamente. Os testes compartilham o limite definido em `vitest.config.ts`; não adicione um limite diferente no workflow.

Os runners isolam o perfil Chromium e o projeto de cada execução. Em uma falha, consulte a mensagem original e `artifacts/smoke/`: são preservados o log bruto, os dados do erro e o projeto de teste, sem copiar o perfil Chromium. No GitHub, esses arquivos ficam no artifact de diagnóstico do job que falhou. Não repita um teste até obter verde sem investigar a falha anterior.

## Antes de criar uma tag

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
