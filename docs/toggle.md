# Toggle

`WebToggle` é um controle visual sem label ou `caption`, disponível em **Standard → Toggle**. O estado `checked` é salvo no Project Model; `enabled`, visibilidade, foco, tabulação, geometria, layout responsivo e bindings de Current Row seguem o contrato dos componentes WebRad.

No browser, uma classe `WebToggle` real encapsula um botão nativo com `role="switch"`, `aria-checked` e nome acessível derivado do nome do componente. Clique, Espaço e Enter alternam o estado e disparam `OnChange`; controles desabilitados não alternam. `OnClick`, `OnFocus` e `OnBlur` também estão registrados. Alterar `checked` por código não dispara `OnChange`.

```ts
Toggle1.checked = true;
this.Toggle1.enabled = false;
Toggle1.focus();
Toggle1.onChange = (sender) => {
  this.Status1.caption = sender.checked ? 'Ligado' : 'Desligado';
};
```

As referências simples e `this.Toggle1` são tipadas em páginas e reutilizáveis, com escopo independente por placement. `click()` executa a ativação nativa. Os wrappers de montagem e de código gerado compartilham a ativação do elemento para evitar alternâncias/eventos duplicados; `dispose()` libera seus eventos e a última referência libera a ativação.

O style protegido **Default Toggle** usa a biblioteca Aurora, raio de 6 px, superfície suave, borda em gradiente, sombra e estados hover/focus/active/disabled. Styles próprios podem configurar fundo desligado, borda, raio, sombra, foco e as propriedades `toggleCheckedColor` (track ligado) e `toggleThumbColor` (botão deslizante), inclusive por estado e com links à paleta. O indicador desliza conforme o estado e respeita a preferência de redução de movimento.

As duas propriedades de style são adições ao formato v2. Projetos e manifests que ainda não têm o default recebem o style com IDs/nomes determinísticos e resolução de colisões, preservando styles salvos e vínculos existentes.

O configurador do DataGrid também oferece **Cell type → Toggle**. Essa célula exibe o booleano do campo, sem caption ou ícone; um campo não selecionado aparece desligado. Assim como a célula Checkbox, ela projeta os dados da resposta sem alterá-los, mantendo `OnCellClick` no grid para a lógica da aplicação. As cores `toggleCheckedColor` e `toggleThumbColor` também estão disponíveis nos styles de `WebDataGrid`, com defaults Aurora e links à paleta.

O Registry declara `WebToggle` em `WebDataGrid.styleDependencies`. O compilador mantém essas dependências transitivas de CSS mesmo quando o projeto não contém um Toggle independente, preservando a aparência das células no Preview e Deploy.
