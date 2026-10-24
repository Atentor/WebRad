# Aurora Workspace

Sem conexão RestGO, o Menu exibe o perfil de exemplo **Demo user**, editável em
**Brand & user**. Com RestGO configurado, ele acompanha o usuário autenticado
ou mostra **Guest** quando não há sessão. Clique no perfil para abrir a conta.

Em **Reusable Components**, abra **AuroraMenu** para editar o menu compartilhado
pelas 13 páginas. Cada página usa uma instância `Navigation`; alterações na
definição refletem em todas elas. **FeatureCard** continua sendo o cartão
reutilizável independente, com seu próprio progresso.

Os cartões reutilizáveis usam ProgressBar em anel (`dunnet`). Na página Data,
as linhas alternam barra (`bars`), anel e círculo preenchido (`circus`), usando
o campo `progressFormat` do JSON por meio do binding de Current row. Os valores
continuam ligados ao progresso de cada projeto.

A largura responsiva da página considera o espaço da barra vertical, evitando
uma barra horizontal causada pela rolagem vertical no Preview e na aplicação
gerada.

Abra [AuroraWorkspace.wrproj](AuroraWorkspace.wrproj) pela IDE e pressione **F9**
para explorar o projeto. O mesmo exemplo está disponível em **New Project >
Aurora Workspace**; cada criação recebe IDs e arquivos próprios.

O projeto usa os 20 componentes visuais e os cinco não visuais do catálogo,
em 13 páginas, e somente os estilos
**Default** originais. Group não possui estilo; as instâncias reutilizáveis
projetam o Default Panel e os estilos dos filhos de sua definição.

O Menu fica na lateral esquerda, na vertical. O grupo `PageContent` mantém o
conteúdo ao lado dele; a Unit `AuroraSidebar` ajusta o espaço no Preview quando
o Menu usa seu controle mobile. Os controles preservam seu layout nativo, os
painéis principais ocupam a largura disponível e as mensagens longas usam Text
Areas somente de leitura, com o estilo Default.

| Página                             | Demonstração                                                                                                                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview (`index`)                 | Page, Menu, Panel, Group, Label, Button, Icons, ProgressBar e duas instâncias de Reusable Component. O botão de cada FeatureCard altera apenas seu próprio progresso.                                                  |
| Forms                              | Edit, Text Area, Check Box, Toggle, Combo Box e List Box. **Review profile** abre o Popup com os valores atuais; **Restore example values** restaura os exemplos. Nenhum perfil é enviado a um servidor.               |
| Data                               | Data Grid e Repeating Group alimentados pelo mesmo JSON local através de um API Client. Clique em uma célula ou em **Select this project** para mostrar o projeto selecionado. **Reload example data** relê o arquivo. |
| Media                              | Image com ilustração SVG local, Icons com favorito interativo e Video Player. **Load sample video** carrega o trecho DASH; use os controles do player e **Stop playback**.                                             |
| Nonvisual > API Client / PokeAPI   | Consome a [PokéAPI v2](https://pokeapi.co/docs/v2) com operações tipadas, listagem paginada de 12 Pokémon, busca por nome/ID, detalhes e cache em memória. Requer internet.                                            |
| Nonvisual > Timer                  | Intervalo e Loop editáveis, Start/Stop/Restart, contador e progresso atualizados pelos eventos reais. Para ao sair da página.                                                                                          |
| Nonvisual > File / Video Upload    | Seleção local de arquivos/vídeos, envio privado explícito ao RestGO, progresso real e pausa/retomada/cancelamento de vídeo. Configure sua conexão RestGO e entre com uma conta para enviar.                            |
| Nonvisual > Report Builder         | Parâmetros de título, destinatário e observações; prévia modal e download de um PDF real, gerado no navegador.                                                                                                         |
| RestGO > Registration / Sign in    | Cadastro real, senhas confirmadas, login e Remember; cadastro não inicia sessão automaticamente.                                                                                                                       |
| RestGO > Email / Password recovery | Confirmação de e-mail por token, pedido de recuperação e redefinição com nova senha.                                                                                                                                   |
| RestGO > Profile / Avatar          | Perfil protegido por OnUnauthenticated, consulta do usuário e envio/remoção do avatar.                                                                                                                                 |
| RestGO > Session / Logout          | CurrentUser, validação, renovação, expiração, eventos e logout sem exibir tokens.                                                                                                                                      |
| `404`                              | Página de rota desconhecida com Menu e retorno à visão geral.                                                                                                                                                          |

Os fontes em `pages/*.ts` e `reusables/FeatureCard.ts` são editáveis e separados
dos arquivos `*.generated.ts`. O modelo visual permanece em `.wrproj` e `.wrpage`.

Os dados, a imagem, o manifesto DASH, os quatro segmentos de mídia e a atribuição
estão em `assets/imported/`. São recursos do projeto, incluídos também no export.
Data e Media usam recursos locais; a página Pokemon acessa a PokéAPI pública e
mantém as respostas bem-sucedidas em memória durante a sessão da página. Nenhuma
consulta a essa API inicia sem um clique. A seleção de arquivos funciona sem
servidor; o envio usa sua própria conexão RestGO e a sessão do usuário. A senha
de login é limpa após a tentativa e não faz parte do modelo salvo. Timer e Report
Builder funcionam sem servidor. As novas páginas ficam na seção **Nonvisual**.

A seção exclusiva **RestGO** usa sua configuração em **RestGo integration >
Connection**. Seus cadastros, e-mails e sessões são reais; o servidor precisa
permitir cadastro público e estar configurado para enviar e-mails. O menu passa
a refletir a identidade autenticada, compartilhada também com os uploads. Nome
e e-mail do perfil são somente leitura; o SDK permite alterar o avatar. Veja
[o fluxo completo da conta](../../docs/aurora-restgo-account.md).

O trecho de dez segundos do Sintel é creditado à Blender Foundation sob CC BY 3.0.
Preserve [aurora-media-license.txt](assets/imported/aurora-media-license.txt) com a
mídia ao compartilhar ou exportar esta demonstração. A ilustração e os registros
JSON foram criados para este repositório, sob a licença MIT.

Este exemplo foi materializado pelos mesmos geradores usados na criação de
projetos. Testes, smokes, typecheck e builds não foram executados nesta alteração.
