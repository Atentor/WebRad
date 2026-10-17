# File Upload

**File Upload** é um componente **não visual**, disponível na paleta
**Nonvisual** e na bandeja do Designer. Ele utiliza o cliente compartilhado
do SDK RestGO. Configure **RestGo integration > Connection** e autentique o
usuário com `RestGO.login()` antes de enviar arquivos.

## Abrir um arquivo

Em um evento de clique, com o componente chamado `FileUpload1`:

```ts
const arquivo = await FileUpload1.OpenFile();
if (!arquivo) return; // Seleção cancelada.

const nome: string = arquivo.name;
const caminho: string | null = arquivo.path;
const tamanho: number = arquivo.size; // Bytes.
const extensao: string = arquivo.extension; // Por exemplo, '.pdf'.
```

`OpenFile()` abre o seletor nativo, sem enviar o arquivo. Deve ser chamado
diretamente de uma interação do usuário, conforme as regras do navegador.
Cancelar retorna `null` e preserva uma seleção anterior. `this.FileUpload1`
oferece a mesma API tipada, inclusive em componentes reutilizáveis.

O retorno `WebFileUploadSelection` contém `name`, `path`, `size` e `extension`.
`path` é o caminho relativo informado pelo navegador, ou `null`. Na seleção
comum de um arquivo, o caminho absoluto do computador não é disponibilizado;
o componente não retorna um caminho fictício. Essa restrição pertence ao
[seletor de arquivos do navegador](<https://html.spec.whatwg.org/multipage/input.html#file-upload-state-(type=file)>).
A extensão inclui o ponto e é convertida para minúsculas; arquivos sem extensão
retornam `''`. `accept` filtra o seletor, por exemplo `.pdf,image/*`.

## Enviar ao RestGO

Depois de selecionar, chame o envio no mesmo evento ou em outro botão:

```ts
try {
  const arquivo = await FileUpload1.SendToRestGO({ isPublic: false });
  Message(`Arquivo ${arquivo.id}: ${arquivo.url}`);
} catch (error) {
  Message(error instanceof Error ? error.message : String(error));
}
```

Use `isPublic: true` para público e `false` para privado. Quando omitido,
utiliza a propriedade **Public file** do Inspector, cujo padrão é `false`.
As opções também aceitam `name` para o nome no Storage e `signal` para cancelamento.
Chamadas simultâneas compartilham o envio em andamento.

`SendToRestGO()` retorna `WebFileUploadResult`, com **todos os campos de arquivo
da API RestGO**: `id`, `ownerId?`, `ownerEmail?`, `originalName`, `contentType`,
`sizeBytes`, `isPublic`, `createdAt`, `updatedAt` e `downloadUrl`. O componente
preserva os metadados recebidos e acrescenta `url`, a URL absoluta de download,
incluindo um eventual prefixo de proxy na conexão. Não altera `downloadUrl`.

Arquivos privados continuam exigindo autorização do dono para download.
Possuir a URL não concede acesso. Use `RestGO.storage.download(arquivo.id)`
para ler o conteúdo pela sessão atual. O token de APIs dinâmicas não substitui
o JWT exigido pelo Storage.

## Progresso no Object Inspector e no Monaco

Selecione o componente na bandeja, abra **Interaction** e dê duplo clique em
**OnProgress**. O editor cria um método tipado com `percentage`, `loaded`,
`total` e `lengthComputable` disponíveis no evento. Por exemplo, se existir
um componente `Label1` na página:

```ts
public async FileUpload1Progress(
  sender: WebFileUpload,
  event: CustomEvent<WebFileUploadProgressEventDetail>,
): Promise<void> {
  const { percentage } = event.detail;
  Label1.caption = percentage === null
    ? 'Enviando...'
    : `${Math.round(percentage)}%`;
}
```

O evento recebe bytes medidos pelo navegador. `loaded` é a quantidade enviada,
`total` é o total informado ou `null`, e `percentage` é um número de 0 a 100
ou `null` quando o total não puder ser medido. Os bytes incluem o multipart.
O valor também pode ser lido em `FileUpload1.progress`.

O SDK usa progresso real de `XMLHttpRequest.upload` em envios entre origens
HTTP(S), sem cookies da sessão administrativa. Na mesma origem, em ambientes
sem XHR ou com `fetch` personalizado, mantém o transporte `fetch` e informa
progresso indeterminado; não estima porcentagens intermediárias. Após a resposta
de sucesso do servidor, o componente confirma `100` no evento. Durante uma
transferência medida, 100% pode chegar antes dessa resposta; use **OnSuccess**
para confirmar que o arquivo foi armazenado.

Use a URL final da instância RestGO, sem redirecionamentos. O transporte XHR
rejeita uma resposta com URL final diferente, mas pode seguir o redirecionamento
antes dessa verificação. As regras completas estão no
[README do SDK](../packages/restgo-sdk/README.md#storage).

## Estado e eventos

| API            | Comportamento                                                             |
| -------------- | ------------------------------------------------------------------------- |
| `accept`       | Filtro do seletor; não substitui validação do servidor.                   |
| `enabled`      | Habilita a seleção e o início do envio.                                   |
| `isPublic`     | Visibilidade padrão, privada inicialmente.                                |
| `selectedFile` | `File` selecionado ou `null`, somente leitura.                            |
| `selection`    | Metadados da seleção ou `null`, somente leitura.                          |
| `fileName`     | Nome selecionado, somente leitura.                                        |
| `uploading`    | Envio em andamento, somente leitura.                                      |
| `progress`     | Porcentagem atual ou `null`, somente leitura.                             |
| `result`       | Último resultado de envio ou `null`, somente leitura.                     |
| `lastError`    | Último erro ou `null`, somente leitura.                                   |
| `Clear()`      | Limpa seleção e estado e aborta o envio; não exclui arquivos do servidor. |

**OnChange** recebe a seleção ou `null`; **OnProgress** recebe a medição;
**OnSuccess** recebe todos os metadados do resultado; **OnError** recebe o erro;
**OnComplete** recebe `{ result, error }`. Falhas de `SendToRestGO()` também
rejeitam a promessa. Seleção, requisição e progresso pertencem a cada instância;
arquivos e respostas não são salvos no projeto. O descarte da página ou do
reutilizável libera a seleção, cancela envios e remove as associações de eventos.

O contrato atual utiliza `OpenFile()`, `SendToRestGO()` e `Clear()`.
Propriedades visuais e estilos não integram o componente não visual.
Não há aliases, conversão de arquivos ou camada de compatibilidade com
o antigo File Upload visual. O código TypeScript autoral permanece separado
dos arquivos gerados.
