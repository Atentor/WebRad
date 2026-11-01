# Data Grid paging, sorting, search, and export

`WebDataGrid` can page, sort, search, and export the rows of its bound API
operation. All options live in the existing `dataGridConfig` v2 contract with
defaults that reproduce the earlier behaviour, so grids saved before these
options keep rendering every row with no toolbar or pager.

## Options

| Option                     | Default             | Meaning                                                                                              |
| -------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `pagination`               | `none`              | `none` shows every row; `client` pages the loaded list; `server` re-executes the operation per page. |
| `pageSize`                 | `10`                | Rows per page (1–1000). Always included in `pageSizeOptions`.                                        |
| `pageSizeOptions`          | `[10, 25, 50, 100]` | Choices of the page size selector (unique, up to 12).                                                |
| `showPageSizeSelector`     | `true`              | Shows the selector in the pager.                                                                     |
| `searchEnabled`            | `false`             | Shows the search box above the grid.                                                                 |
| `searchPlaceholder`        | `''`                | Empty uses the localized "Pesquisar…"/"Search…".                                                     |
| `sortEnabled`              | `false`             | Text, checkbox, and toggle headers with a Field become sort buttons.                                 |
| `exportEnabled`            | `false`             | Shows the CSV export button.                                                                         |
| `serverSearchParameter`    | `q`                 | Server mode: query parameter for the search text.                                                    |
| `serverSortParameter`      | `sort`              | Server mode: query parameter for the sorted Field name.                                              |
| `serverDirectionParameter` | `dir`               | Server mode: query parameter for `asc` or `desc`.                                                    |
| `totalPagesPath`           | `/total_pages`      | Server mode: JSON Pointer to the page count in the response.                                         |
| `totalRowsPath`            | `/total`            | Server mode: JSON Pointer to the row count (optional).                                               |

Each column also has `sortable` and `searchable` (both `true` by default) to
exclude it from sorting or from the search.

Server parameter names must start with a letter and may not be `page`,
`page_size`, or start with `_` (reserved by HexAPI for session values).

## Client mode

The grid never executes a request. It filters the latest list with a
case- and accent-insensitive search where every typed word must appear in one
of the searchable columns ("erica indaia" finds "Érica / Indaiatuba"). Sorting
is stable, uses the page locale with numeric collation, compares numbers
numerically, orders `dd/mm/yyyy` and `dd/mm/yyyy hh:mm[:ss]` dates
chronologically, and keeps empty values last in both directions.

## Server mode

On binding and whenever the user changes page, page size, sort, or search
(debounced while typing), the grid calls its operation with:

```
GET …?page=2&page_size=25&sort=data_abertura&dir=desc&q=impressora
X-RestGo-Pagination: exact
```

It reads `total_pages` and `total` from the RestGO/HexAPI envelope. HexAPI
validates `sort` as a plain column name, quotes it per database, and returns 400
for an unknown column. Search is an optional parameter of the endpoint script,
for example `WHERE (:q IS NULL OR assunto LIKE CONCAT('%', :q, '%'))`.

## Page code

```ts
this.Chamados.pageSize = 25;
this.Chamados.sortBy('Abertura', 'desc'); // column ID, header, or Field
this.Chamados.search('impressora');
await this.Chamados.refresh(); // server mode: reload the current page
const csv = this.Chamados.exportCsv(); // pass a file name to also download it
```

`OnPageChange`, `OnSortChange`, `OnSearch`, and the combined `OnQueryChange`
receive a `WebDataGridQueryState` with `page`, `pageSize`, `pageCount`,
`totalRows`, `sortColumnId`, `sortField`, `sortDirection`, and `search`.
`visibleRows` and `filteredRows` expose the current page and the full filtered
list.

## CSV export

Exports text, checkbox, and toggle columns of the searched and sorted rows (the
current page in server mode). Pages in Portuguese use `;` as separator for
Excel; others use `,`. The file starts with a UTF-8 BOM, booleans become
Sim/Não (Yes/No), and cells starting with `=`, `+`, `-`, `@`, tab, or carriage
return are prefixed with `'` so spreadsheets do not run them as formulas.

## Accessibility and localization

Sortable headers expose `aria-sort`, the pager is a labelled `nav` with
`aria-current="page"`, the row summary is `aria-live="polite"`, and the grid is
`aria-busy` while a server page loads. Labels follow the page `lang`
(Portuguese for `pt*`, English otherwise).
