# Report Builder

`WebReportBuilder` é um componente não visual da categoria **Nonvisual**. Dê dois cliques nele no Designer, ou use **Report template** no Inspector, para abrir o construtor maximizado.

O modelo é um documento JSON versionado, salvo em `props.reportTemplate` pelo Project Model. **Save template** aplica a edição ao projeto como uma operação com undo/redo; **Cancel** descarta o rascunho. O arquivo do projeto persiste o modelo ao salvar normalmente. **Export JSON** salva um arquivo `.report.json` independente, que pode ser importado em outro relatório ou carregado pela aplicação em execução. **Import JSON** e **Import URL** validam o modelo antes de substituir o rascunho.

## Construtor

O conjunto inicial contém **Text**, **Image**, **Line** e **Repeater**. O texto pode ser fixo, um parâmetro, um campo da resposta de um ApiClient, um campo do registro atual ou o número/total de páginas. Imagens aceitam uma URL fixa, um parâmetro ou um campo; a geração suporta PNG e JPEG, incluindo data URLs. Linhas são elementos gráficos.

As bandas **Title**, **Detail** e **Summary** aparecem uma vez no fluxo. **Page header** e **Page footer** são reservadas e repetidas em cada página. Os campos do Repeater se repetem para os registros de uma lista, dentro de uma única linha de modelo; não há repetidores aninhados, agrupamentos ou totalizadores nesta versão.

No canvas, **Page footer** fica no fim da folha, junto à margem inferior, mesmo quando as outras bandas ocupam pouco espaço. Sua posição acompanha o tamanho do papel, a orientação, o zoom e a altura configurada para a banda, como no PDF.

Arraste um componente da paleta e solte sobre uma banda do canvas para inseri-lo na posição escolhida. Clicar na paleta não insere componentes. Para adicionar campos a um Repeater, solte os componentes dentro da sua linha; **Edit row template** permite selecionar essa linha no Inspector. O destino recebe um destaque durante o arraste. Repeater não pode ser solto dentro de outro Repeater nem em Page header/Page footer. A posição respeita o zoom, a rolagem e os limites da banda ou linha, com passos de 0,5 mm. A origem da lista e os campos são escolhidos entre os schemas salvos dos ApiClients do documento. Essa seleção não executa requisições. É possível mover/redimensionar no canvas, editar posição e tamanho no Inspector e usar as setas para mover em passos de 0,5 mm; Shift usa 5 mm. A edição tem undo/redo próprio até salvar.

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

O PDF é gerado no navegador com pdf-lib 1.17.1, incluído no bundle de Preview/Deploy, sem CDN. A aplicação continua sendo uma aplicação web comum. Títulos, resumo e linhas do repetidor são colocados respeitando a área útil; uma linha não é dividida entre páginas. Cabeçalho, rodapé e contagem de páginas são calculados sobre o resultado paginado.

Textos quebram em linhas dentro de sua largura. Conteúdo que excede a altura configurada retorna um erro explícito: aumente a altura ou reduza a fonte. Linhas de repetidor maiores que a área útil também são rejeitadas. Coloque elementos fixos acima ou abaixo do Repeater; elementos de uma linha repetida pertencem à sua árvore de filhos. A fonte inicial Helvetica suporta os caracteres da Europa Ocidental, incluindo português; caracteres fora desse conjunto exigem suporte adicional de fontes.

O formato inicial suporta até 100 mil registros por Repeater e 10 mil páginas por relatório. Modelos externos não executam scripts. Respostas HTTP, PDFs gerados, parâmetros preenchidos pelo código e estado de preview são transitórios e não entram no Project Model.

## Validação

`npm run smoke:report-builder` executa o teste nativo com janelas ocultas do Electron, geração de PDF e verificação de isolamento da janela do relatório. Os testes de browser `tests/report-builder.browser.test.ts` e `tests/report-builder-editor.browser.test.ts` usam `WEBRAD_BROWSER_PATH` para um executável Chrome/Chromium e cobrem o PDF compilado e o construtor visual.
