# Menu responsivo

O componente **Navigation → Menu** oferece um menu lateral recolhível, uma barra
horizontal para desktop e uma gaveta modal para telas menores. Dê dois cliques
no componente ou abra **Menu configuration → Configure Menu** no Inspector.

O editor tem quatro seções:

- **Items**: itens com ícones Lucide, descrição, badge, página ou link, estados
  visível/desabilitado e submenus. Insira, remova, reordene, indente e desindente
  os itens sem alterar seus IDs.
- **Brand & user**: logo, título, subtítulo, destino da marca, foto, nome,
  descrição e presença do usuário. Sem foto, o perfil usa iniciais. Importe
  imagens em Project Assets e selecione seus caminhos nos campos de imagem.
- **Appearance**: presets claro/escuro e cores, dimensões, espaçamento, tamanho
  dos ícones, recuo e largura recolhida. Cores aceitam hexadecimal, nomes CSS e
  referências `var(--wr-palette-ID)`. O Style controla cantos, sombra e opacidade.
- **Behavior & mobile**: orientação, recolhimento, acordeão, busca, item inicial,
  textos, breakpoint, largura/lado da gaveta e fechamento após selecionar.

A prévia do editor permite experimentar desktop e mobile; seus links são
interceptados. **Save Menu** grava uma transação no histórico do Designer.
Cancel e Escape descartam o rascunho. F9 executa a navegação real.

## Layout e acessibilidade

O padrão mede 288 × 640 px, tem orientação vertical e muda para mobile abaixo
de 768 CSS pixels de largura da janela. O breakpoint é configurável; zero
mantém desktop. Ao escolher a orientação horizontal, ajuste largura/altura no
Inspector. Os modos responsivos de tamanho e as âncoras existentes continuam
disponíveis para compor o layout da página.

No desktop, recolher reduz a largura e preserva ícones e nomes acessíveis. No
mobile, aparece um botão com o nome da marca. A gaveta usa
`<dialog>.showModal()`, ocupa no máximo 92% da janela, contém o foco, bloqueia
a rolagem da página e fecha pelo botão, backdrop ou Escape. Fechar devolve o
foco ao botão de abertura. Movimento reduzido desativa a animação.

Os itens usam links/botões nativos em uma região de navegação. Submenus usam
`aria-expanded` e `aria-controls`; o item ativo recebe `aria-current="page"`.
Tab, Enter e Space preservam o comportamento nativo. Setas para cima/baixo,
Home e End percorrem itens visíveis; as laterais expandem/recolhem submenus.
A busca preserva os ancestrais dos resultados. Itens ocultos e subárvores
desabilitadas não executam ações.

## Reutilizável com script próprio

Em **Project → Add Reusable Component**, escolha **Responsive menu** no campo
**Template**. O projeto recebe uma definição visual com `Menu1` e um arquivo
editável `reusables/Nome.ts`, separado do arquivo gerado. O template inclui
procedimentos `setUser`, `setItems` e `selectItem` para uso na sua classe.
Abra **Code** para escrever a lógica e a aba **Interact** de `Menu1` para criar
handlers tipados.

Arraste a definição do Project Explorer para as páginas. A nova instância usa
as dimensões e os modos de tamanho do root da definição. O template sugere
`fit-content` para acompanhar o conteúdo e o recolhimento. Cada colocação tem seus próprios
objetos, eventos, seleção, submenus, perfil e ciclo de vida. A lógica é
compartilhada pelo arquivo TypeScript; o estado é isolado por instância.

O código inicial só é aplicado ao criar um arquivo novo; arquivos TypeScript
existentes são preservados. Os métodos da classe reutilizável pertencem ao seu
escopo de código, sem transformar membros internos em globais da página.

## API TypeScript

`WebMenu`, `WebMenuConfiguration`, `WebMenuItem`, `WebMenuUser`,
`WebMenuAppearance` e os detalhes dos eventos são exportados por
`@webrad/runtime`. `Menu1.member` e `this.Menu1.member` usam o contrato de
instâncias do Monaco, respeitando sombreamento léxico.

```ts
this.Menu1.user = {
  visible: true,
  name: 'Ana Silva',
  description: 'Administradora',
  avatar: 'assets/imported/ana.png',
  status: 'online',
};
this.Menu1.updateItem('projects', { badge: '12', disabled: false });
this.Menu1.selectedItemId = 'projects';
this.Menu1.expandItem('workspace');
this.Menu1.collapsed = false;
```

Propriedades: `configuration`, `items`, `brand`, `user`, `appearance`,
`orientation`, `selectedItemId`, `collapsed`, `searchText`; somente leitura:
`isOpen`, `isMobile`. Getters de configuração retornam cópias. Métodos:
`findItem`, `updateItem`, `expandItem`, `collapseItem`, `toggleItem`, `focusItem`,
`activateItem`, `open`, `close`, `toggle`. `activateItem` executa a ação;
`selectedItemId` apenas muda a seleção. Alterações por código são transitórias.

Eventos: `OnItemClick`, `OnSelectionChange`, `OnItemToggle`, `OnCollapseChange`,
`OnOpen`, `OnClose`, `OnBrandClick`, `OnUserClick`. `OnItemClick` recebe
`CustomEvent<WebMenuItemEvent>` com `item`, `itemId` e `path`. Chame
`event.preventDefault()` sincronamente para cancelar seleção/navegação antes de
uma ação assíncrona. `OnUserClick` permite implementar o fluxo do perfil.

Destinos de páginas usam IDs estáveis e `WebPageRouter`, preservando History
ou Hash. O item correspondente acompanha a rota ativa. Links podem abrir na
mesma janela ou em outra com `noopener,noreferrer`.

## Persistência e integração

Projetos criados com a primeira versão do template podem conter `borderWidth: 0`
nas propriedades do `WebPanel` raiz. Essa propriedade não pertence ao contrato
do Panel e bloqueava a compilação. A leitura do documento remove somente esse
valor no formato específico do template antigo (root transparente com um único
filho Menu), sem alterar estilos, IDs, itens ou TypeScript. Novos templates não
gravam a propriedade inválida.

`ComponentNode.props.configuration` usa `schemaVersion: 1`, sem alterar o
formato geral de projeto 2. Há até 1.000 itens e 12 níveis, com IDs únicos.
O mesmo parser valida persistência, editor e runtime. Referências a páginas
inexistentes, ícones inválidos e protocolos de URL executáveis são rejeitados.

O Registry declara metadados, propriedades, eventos e a ação do editor. Designer
e runtime projetam o mesmo DOM/CSS; o Designer usa sua viewport simulada. O
compilador retém o CSS quando o menu é usado e inclui imagens referenciadas.
`runtime:sources` incorpora os módulos browser e emite as declarações reais do
Monaco. `Default Menu` é materializado sem substituir estilos/vínculos existentes.
O runtime não depende de Designer, Electron ou Node.js.

O smoke existente foi estendido com edição, salvamento, submenus, recolhimento,
seleção, viewport mobile, foco modal, Escape e undo. Testes, smokes e builds não
foram executados nesta alteração, pois a validação não foi solicitada.
