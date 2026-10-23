# Panel flutuante

No Object Inspector do **Panel**, configure **Placement** como `floating` para
sobrepor o conteúdo da página sem ocupar espaço no layout do container pai.
O Panel acompanha a rolagem da página. `in-flow` mantém o comportamento normal
do layout. Projetos antigos sem essa propriedade continuam em `in-flow`.

- **Floating alignment**: `none`, `top`, `bottom`, `left`, `right` ou `client`.
- **Floating horizontal anchor**: `left`, `center` ou `right`, quando o alinhamento não fixa esse eixo.
- **Floating vertical anchor**: `top`, `center` ou `bottom`, quando o alinhamento não fixa esse eixo.
- **Floating layer**: inteiro que controla o `z-index`, inicialmente `100`.

Com `top`, `bottom`, `left` ou `right`, o Panel se posiciona junto à borda
escolhida. O alinhamento define a posição, sem substituir **Responsive width**
e **Responsive height**: `fixed` usa a dimensão salva, `stretch` usa o espaço
disponível da página e `fit-content` acompanha o conteúdo, inclusive alterações
nos filhos. Limites mínimo/máximo, margens, offsets e layout dos filhos continuam
ativos. O tamanho final permanece ancorado à borda escolhida.

`client` usa a origem da área da página e também respeita essas configurações.
Para preencher a página inteira, configure os dois eixos como `stretch`; limites
e margens continuam sendo aplicados. Esses modos acompanham a rolagem e ficam
sobrepostos, sem reservar espaço para outros Panels. Grow/shrink continuam
pertencendo à distribuição de espaço entre irmãos no fluxo, portanto não
distribuem espaço na camada sobreposta.

No Designer, apenas eixos configurados como `fixed` oferecem alças de
redimensionamento; a borda alinhada permanece presa. `none` restaura o
posicionamento livre. Projetos sem `floatingAlignment` usam `none`.

No modo `none`, as coordenadas X/Y representam distâncias às bordas da página, ou deslocamentos
em relação ao centro, conforme as âncoras. Os modos responsivos continuam ativos
também no posicionamento livre. O Designer permite selecionar,
mover, redimensionar e editar seus filhos nessa posição sobreposta.

As propriedades também estão disponíveis nas instâncias tipadas do código de
página e de reusable, com acesso direto ou por `this`:

```ts
Panel1.placement = 'floating';
Panel1.floatingAlignment = 'top';

// Usa a área cliente; Stretch nos dois eixos preenche a página.
Panel1.floatingAlignment = 'client';

// Retorna ao posicionamento livre com âncoras.
Panel1.floatingAlignment = 'none';
this.Panel1.floatingHorizontalAnchor = 'right';
Panel1.floatingVerticalAnchor = 'bottom';
Panel1.floatingZIndex = 200;

// Devolve o mesmo Panel e seus filhos ao container original.
Panel1.placement = 'in-flow';
```

O modelo persiste essas opções em `ComponentNode.props`, sem alterar a versão
do formato. O Registry registra a capacidade `supportsFloatingPlacement` e as
propriedades do Inspector. O runtime projeta Panels flutuantes com
`position: absolute` em uma camada interna da página, fora dos containers
intermediários, evitando que seus transforms e overflow recortem o Panel.
O ciclo de vida da página mantém a camada junto de seu conteúdo. Reusable
Components conservam seu posicionamento flutuante fixo à viewport.

`tests/panel-floating.test.ts` cobre persistência, validação, compatibilidade,
API tipada, completion/hover/diagnósticos e execução compilada. O teste Chromium
`tests/panel-floating.browser.test.ts` cobre o Designer real, Preview e aplicação
exportada, com rolagem, âncoras e mudança de Placement. O smoke Electron cobre
inserção pela paleta, edição/salvamento no Inspector, projeção no Designer,
F9 e rolagem da página. O smoke foi atualizado para também percorrer os novos
alinhamentos no Inspector. Os novos modos foram implementados sem execução
de testes, smokes ou builds, conforme a política de validação por solicitação.
