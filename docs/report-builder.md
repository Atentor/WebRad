# Report Builder

`WebReportBuilder` é um componente não visual da categoria **Nonvisual**. Dê dois cliques nele no Designer, ou use **Report template** no Inspector, para abrir o construtor maximizado.

O modelo é um documento JSON versionado, salvo em `props.reportTemplate` pelo Project Model. **Save template** aplica a edição ao projeto como uma operação com undo/redo; **Cancel** descarta o rascunho. O arquivo do projeto persiste o modelo ao salvar normalmente. **Export JSON** salva um arquivo `.report.json` independente, que pode ser importado em outro relatório ou carregado pela aplicação em execução. **Import JSON** e **Import URL** validam o modelo antes de substituir o rascunho.

## Construtor

O conjunto contém **Text**, **Image**, **Line**, **Group** e **Repeater**. O texto pode ser fixo, um parâmetro, um campo da resposta de um ApiClient, um campo do registro atual ou o número/total de páginas. Imagens aceitam uma URL fixa, um parâmetro ou um campo; a geração suporta PNG e JPEG, incluindo data URLs. Linhas são elementos gráficos.

As bandas **Title**, **Detail** e **Summary** aparecem uma vez no fluxo. **Page header** e **Page footer** são reservadas e repetidas em cada página. Os campos do Repeater se repetem para os registros de uma lista. Cada Repeater pode conter outros Repeaters e suas próprias seções **Header**, **Row template** e **Footer**. Agrupamentos por chave e totalizadores não fazem parte deste componente.

No canvas, **Page footer** fica no fim da folha, junto à margem inferior, mesmo quando as outras bandas ocupam pouco espaço. Sua posição acompanha o tamanho do papel, a orientação, o zoom e a altura configurada para a banda, como no PDF.

No editor, **Summary** fica logo após **Detail**, no fluxo do relatório. O espaço livre fica entre **Summary** e **Page footer**.

Arraste um componente da paleta e solte sobre uma banda ou seção do Repeater para inseri-lo na posição escolhida. Clicar na paleta não insere componentes. **Edit row template**, **Edit header**, **Edit footer** e a árvore **Report outline** selecionam as seções, inclusive nos níveis internos. O destino recebe um destaque durante o arraste. Repeaters continuam indisponíveis nas bandas Page header/Page footer. A posição respeita o zoom, a rolagem e os limites da banda ou seção. O canvas mantém o magnetismo de **8 px a 100%**, acompanhando o zoom, sem exibir a grade de fundo. Inserção e movimento encaixam a posição na grade local; o redimensionamento encaixa as bordas direita e inferior, respeitando os limites disponíveis. A geometria continua salva em milímetros (8 px equivalem a 8/3 mm na escala do editor). A origem da lista e os campos são escolhidos entre os schemas salvos dos ApiClients do documento. Essa seleção não executa requisições. É possível mover/redimensionar no canvas, editar posição e tamanho livremente no Inspector e usar as setas para ajustes finos em passos de 0,5 mm; Shift usa 5 mm. A edição tem undo/redo próprio até salvar.

### Group

**Group** organiza componentes em um contêiner único. Arraste Text, Image, Line, Repeater ou outro Group para dentro dele; as posições X/Y são relativas ao Group. Ele também pode ser inserido nas colunas de Header/Footer e no modelo de linha de um Repeater. Os filhos herdam o registro atual e seus campos, sem criar uma nova fonte de dados. As restrições de Repeater em Page header/Page footer continuam válidas dentro de Groups.

Em **Group appearance**, configure fundo ou transparência, cor, espessura e estilo sólido/tracejado da borda e **Group corner radius**. Espessura e raio usam milímetros e acompanham o zoom. A borda ocupa a área interna do Group sem deslocar os filhos. O raio é limitado visualmente à metade da largura/altura; os componentes internos mantêm suas próprias caixas, sem recorte pelos cantos. **Edit group contents**, a etiqueta no canvas e a árvore selecionam o conteúdo; **Back to group** retorna ao contêiner. Movimentação, redimensionamento, duplicação e undo/redo preservam a árvore e os vínculos.

O JSON usa `type: 'group'`, `children` e `appearance` opcional (`backgroundColor`, `borderColor`, `borderWidth`, `borderStyle`, `borderRadius`), mantendo `schemaVersion: 1`. Sem aparência explícita, o fundo é transparente, a borda é sólida de 0,2 mm e o raio é zero. O PDF desenha fundo e cantos como vetores, antes dos filhos. Se houver Repeater dentro do Group, sua altura no PDF cresce com os registros; esse Group completo é mantido na mesma página e precisa caber na área imprimível.

### Seções, aparência e registros do Repeater

Ative **Header** e **Footer** no Inspector e configure suas alturas. O Header é impresso uma vez antes dos registros daquele Repeater; o Footer, uma vez depois, inclusive quando a lista está vazia. Eles são diferentes do cabeçalho/rodapé de página. A altura principal do componente continua sendo a altura do modelo de um registro; o canvas soma as alturas das três seções e amplia os contêineres necessários ao adicionar seções.

**Header columns** e **Footer columns** definem de 1 a 24 colunas independentes, cada seção com seu próprio **column gap** em milímetros. Arraste os componentes para a coluna desejada; cada coluna tem conteúdo próprio, impresso uma única vez na seção. No Inspector de um componente dessas seções, **Column** permite transferi-lo para outra coluna. As coordenadas X/Y são locais à coluna. Alterar a quantidade ou o espaçamento ajusta as larguras dos filhos; ao reduzir a quantidade, o conteúdo das colunas removidas é preservado abaixo das colunas restantes, com ampliação da altura quando necessária. Undo/redo preserva toda a operação.

**Columns** define de 1 a 24 colunas. **Row gap** e **Column gap** controlam os espaçamentos. **Fill order** permite preencher por linhas ou descer pelas colunas. **Rows per block** limita as linhas de cada bloco antes de iniciar o próximo; zero distribui todos os registros pelas colunas configuradas. Todas as colunas do corpo mostram projeções editáveis do mesmo modelo de registro. É possível arrastar componentes para qualquer coluna; a posição é calculada dentro da célula escolhida, e a edição atualiza o modelo comum. O projeto mantém uma única árvore de filhos com IDs estáveis, usada pelos registros no PDF. Header/Footer continuam com conteúdos próprios por coluna. Alterar a quantidade de colunas ou seu espaçamento ajusta proporcionalmente a geometria dos filhos da linha, preservando IDs e vínculos.

Em **Appearance**, configure fundo ou transparência, cor, espessura e estilo sólido/tracejado da borda, divisórias de linhas/colunas, cor e espessura das divisórias. Espessuras e espaçamentos do Repeater usam milímetros. Os valores são projetados no canvas e desenhados como vetores no PDF.

Um Repeater interno pode usar uma resposta de API independente ou **Parent row list**, com um JSON Pointer relativo ao registro pai, por exemplo `/orders`. Os campos de sua linha usam o registro da lista interna. Os campos de seu Header/Footer podem usar o registro externo, por exemplo o nome do cliente acima de seus pedidos. O editor oferece as listas e campos do schema correspondente a cada nível. Nenhuma dessas escolhas executa requisições.

O JSON de template continua em `schemaVersion: 1`, com os campos opcionais `header`/`footer` (`height`, `elements`, `columns`, `columnGap`), `layout` (`columns`, `rows`, `columnGap`, `fill`), `appearance` e `source.scope` (`api`/`row`). Filhos diretos de Header/Footer podem definir `column`, um índice a partir de zero; sua ausência seleciona a primeira coluna. `children` aceita qualquer elemento de relatório, inclusive Repeater. A ausência dos campos mantém a apresentação anterior: uma coluna, sem seções adicionais, sem pintura ou divisórias. Duplicação, renomeação de parâmetros e remapeamento de ApiClients ao copiar componentes percorrem todas as seções e níveis.

Em **Parameters**, declare nome, tipo e valor padrão. Os tipos são texto, número, booleano e data. Datas usam texto ISO, como `2026-10-14`; valores nulos são aceitos. Renomear um parâmetro atualiza suas vinculações no rascunho. Em **Page setup**, configure A4/Letter, orientação e margens. A geometria usa milímetros; tamanho de fonte e espessura de linha usam pontos PDF.

## Geração pelo código

Execute explicitamente a operação do ApiClient antes de gerar. O ReportBuilder usa uma cópia das respostas concluídas com sucesso e dos parâmetros no início da geração; ele não executa nem atualiza os ApiClients.

Supondo parâmetros `Title` (texto) e `Period` (data) declarados no modelo:

```typescript
await ApiClient1.Load.execute();

ReportBuilder1.Parameters.Set('Title', 'Clientes de São Paulo');
this.ReportBuilder1.Parameters.Set('Period', '2026-10-14');

ReportBuilder1.previewMode = 'modal';
ReportBuilder1.fileName = 'clientes.pdf';
const result = await ReportBuilder1.Generate();
// result.blob: Blob, result.pageCount: number, result.fileName: string
```

O Inspector oferece `previewMode`: `modal`, `new-tab` ou `download`. É possível escolher o destino por chamada:

```typescript
await ReportBuilder1.Generate({ previewMode: 'download', fileName: 'clientes.pdf' });
```

Para gerar os bytes sem abrir a interface:

```typescript
const result = await ReportBuilder1.GeneratePDF();
const bytes = await result.blob.arrayBuffer();
```

`Generate()` deve ser chamado diretamente de uma ação do usuário para abrir uma nova aba. O navegador pode bloquear popups quando o código aguarda outra operação antes da chamada. O runtime reserva a aba antes de gerar o PDF. `ClosePreview()` fecha o modal. Fechar o modal ou descartar o componente libera suas URLs e recursos.

`Generate()` e `GeneratePDF()` aceitam `signal: AbortSignal` e `parameters`, com valores apenas para aquela geração. `Parameters.Get(name)` lê o valor atual; `Parameters.Clear(name)` restaura o padrão daquele parâmetro e `Parameters.Clear()` restaura todos.

`OnGenerate` recebe as opções de geração e permite cancelar sincronicamente com `event.preventDefault()`. `OnSuccess` recebe `WebReportResult` em `event.detail`; `OnError` recebe um `Error`. Erros também rejeitam a Promise da geração.

## Modelos externos e troca em execução

`LoadTemplate()` aceita uma URL HTTP/HTTPS, um `Blob`/`File`, um objeto `WebReportTemplate` ou texto JSON. A carga é validada antes da troca; um erro mantém o modelo atual. Se duas cargas concorrem, prevalece a mais recente. O componente limita documentos JSON a 5 MiB. URLs externas estão sujeitas ao CORS do servidor.

```typescript
await ReportBuilder1.LoadTemplate('https://example.com/templates/clientes.report.json');
ReportBuilder1.Parameters.SetValue('ExternalTitle', 'Clientes ativos');
await ReportBuilder1.Generate();
```

`Set`/`Get` têm completion e validação de nomes/tipos derivados dos parâmetros do modelo salvo na IDE. Para parâmetros de um template externo com nomes diferentes, use **`SetValue(name, value)`** e **`GetValue(name)`**: os nomes são dinâmicos e continuam sendo validados pelo modelo carregado em execução. Valores preenchidos pelo código são preservados na troca apenas se o nome e o tipo do parâmetro continuarem iguais.

`SaveTemplate()` retorna o modelo atual como texto JSON; valores transitórios preenchidos pelo código não substituem os padrões do template.

Os vínculos usam IDs estáveis de ApiClients e operações. Para modelos portáveis, `apiClientId` também aceita o nome do componente, e `operationId` aceita o nome da operação. O código gerado registra ambos no escopo da página ou da instância reutilizável. Um template externo também pode ser associado explicitamente:

```typescript
ReportBuilder1.bindApiClient('Customers', ApiClient1);
```

Use URLs absolutas para imagens de modelos hospedados externamente; caminhos relativos são resolvidos a partir da aplicação.

## Paginação e limites iniciais

O PDF é gerado no navegador com pdf-lib 1.17.1, incluído no bundle de Preview/Deploy, sem CDN. A aplicação continua sendo uma aplicação web comum. Títulos, resumo e linhas do repetidor são colocados respeitando a área útil; uma linha completa, incluindo suas listas internas expandidas, não é dividida entre páginas. Com várias colunas, a altura da linha usa o maior registro nela. Cabeçalho, rodapé e contagem de páginas são calculados sobre o resultado paginado.

Textos quebram em linhas dentro de sua largura. Conteúdo que excede a altura configurada retorna um erro explícito: aumente a altura ou reduza a fonte. Linhas de repetidor maiores que a área útil também são rejeitadas. Coloque elementos fixos acima ou abaixo do Repeater; elementos de uma linha repetida pertencem à sua árvore de filhos. A fonte inicial Helvetica suporta os caracteres da Europa Ocidental, incluindo português; caracteres fora desse conjunto exigem suporte adicional de fontes.

O formato suporta até 16 níveis de aninhamento, 100 mil registros expandidos por banda e 10 mil páginas por relatório. Se uma linha com seus grupos internos exceder a área imprimível, a geração retorna um erro explícito. Modelos externos não executam scripts. Respostas HTTP, PDFs gerados, parâmetros preenchidos pelo código e estado de preview são transitórios e não entram no Project Model.

## Validação

`npm run smoke:report-builder` executa o teste nativo com janelas ocultas do Electron, geração de PDF e verificação de isolamento da janela do relatório. Os testes de browser `tests/report-builder.browser.test.ts` e `tests/report-builder-editor.browser.test.ts` usam `WEBRAD_BROWSER_PATH` para um executável Chrome/Chromium e cobrem o PDF compilado e o construtor visual.

`tests/report-repeater.browser.test.ts` cobre seções aninhadas, campos do pai/filho, aparência, inserção nativa da paleta dentro de um Repeater, salvar/reabrir e geração do mesmo template na Preview compilada. As capturas e o PDF ficam em `out/report-builder-review/nested-*`.
