# RestGo GraphQL in WebRAD

## Configure a table

1. Enable the project's RestGO integration in **RestGO > Connection**. Connect the IDE to the same RestGo instance for administrative schema discovery.
2. Open **RestGO > GraphQL** and choose an already published database. Manage GraphQL activation, table and column permissions, and user access in RestGo. [RestGo GraphQL documentation](https://restgo.atentor.com/docs/graphql)
3. Click **New**, select a table, and check the actions to use in the project. For example, enable **Query** and **Insert** to read and add records. Actions unavailable in the published schema are disabled.
4. Use the action buttons next to the settings heading to switch between enabled actions. WebRAD suggests an operation name and an initial return field for a new query. You can select related fields and configure parameters, ordering, and pagination where applicable. For **Insert** and **Update**, configure the fields to write. For **Update** and **Delete**, add a condition that identifies the record.
5. Click **Save actions** to apply the table's selections together, then save the WebRAD project. Reopen the table to change its actions. Clear a saved action's bindings and client selections before deleting it.

Under **Conditions**, use **Add condition** for each filter. When the published schema supports both AND and OR, use **Add condition group** to combine filters under a different match rule. A vertical guide marks the conditions that belong to each subgroup.

The editor groups saved operations by database and table. Each operation retains its ID, name, generated GraphQL document, and response schema in the manifest. Preview and Build can use the saved contract without fetching administrative metadata. The browser sends requests to `POST /gql/{slug}` with the signed-in application's user session. The IDE's administrative connection stays in the Electron main process.

## Set up a GraphQL Client

1. Add a **GraphQL Client** to the page or reusable element.
2. Double-click the client in the nonvisual tray and select the saved queries
   and mutations it should use.
3. Click **Save GraphQL Client**. Each client stores its own operation IDs.

An operation used by a Data Grid or ComboBox stays selected. The dialog lists
the components that use it. Change their bindings before deselecting it.

Edit an operation in **RestGO > GraphQL** to update its contract for every
client that selected it. The client uses the project's RestGO connection and
the application user's session.

## Bind a Data Grid

Open **Configure Data Grid**. Select **GraphQL Client** under **Data source**,
then choose the client and one of its queries. For record editing, select
compatible mutations in the same client.
The grid stores its client and operation IDs together with pagination and
mutation settings.

For REST endpoints, choose **API Client** in **Data source**, then select
the client, operation, and response list.

Open **Columns**, select a column in the list, and choose its **Field** in
the details pane. Use **Add column** to create another column. To change
row height, spacing, or grid lines, open **Appearance**. Use **Labels** to
customize the GraphQL pagination, record actions, editor and status text.
Click **Save Data Grid** to apply the changes from the configuration dialog.

To use a GraphQL query in a **ComboBox**, select the GraphQL Client under
**Data source**, choose its query, and map the display and key fields.

The grid uses RestGo cursors for previous and next navigation and resets its
cursor when parameters or page size change. Use `setVariables` to reload a
bound grid with values from page controls.

When page code publishes a query using `after`, the grid retains the page
number and previous cursors if they are already in its history for the same
query parameters and page size. For a new cursor it shows a configurable
summary and **Previous** returns to the first page once the cursor origin is
reached.

```ts
GraphQLClient1.setVariables(GraphQLClient1.operation.ListCustomers, { name: SearchEdit.value });
```

## Execute an operation in code

To prepare a parameter before executing, assign it on the operation. Assignments
are local to that operation on that client. The request starts when
`execute` is called. Assign `undefined` to clear a prepared value.

```ts
const customers = GraphQLClient1.operation.ListCustomers;

customers.parameter.name = SearchEdit.value;
const { rows } = await customers.execute();
```

When a Data Grid is bound to that client and query, `execute()` updates its
rows and pagination with the result. The grid uses the executed query's
filters on subsequent pages. Pass `publish: false` for a query whose result
should only be returned to the caller.

Monaco completes each operation's parameters and result fields. Parameters
passed to `operation.execute` override prepared values for that execution.
Pass execution options such as pagination in the second argument.

```ts
const page = await GraphQLClient1.operation.ListCustomers.execute({
  name: SearchEdit.value,
});

const result = await GraphQLClient1.operation.RenameCustomer.execute({
  id: 42,
  name: 'Ana',
});
```

```ts
const page = await GraphQLClient1.operation.ListCustomers.execute(
  { name: SearchEdit.value },
  { first: 10 },
);
```

The GraphQL Client exposes `OnRequest`, `OnSuccess`, `OnError`, and
`OnComplete` in the Inspector.

## Edit records from Data Grid

Configure the grid against a query and enable **CRUD** in the Inspector. Choose the saved insert, update, and delete operations to expose. The mutations must target the query's database and table. Use a non-null unique key from the query in an equality condition for updates and deletes. Composite keys can use multiple equality conditions joined by AND.

The grid opens an editor for the mutation parameters or stages a delete. The
staged changes appear in `pendingChanges` and can be discarded with
`CancelChanges()`. In **Labels > Record actions**, enable **Show a Save changes
button when there are drafts** to let users send the pending changes from the
grid. **Apply to draft** stages the editor values locally. To save from a
separate button, call `await DataGrid1.SaveChanges()` in its click handler.
To save immediately after an edit, call the same method from **OnChangesChanged**.

Enter custom labels for the grid controls and the mutation editor fields. Clear
an override to restore the default. For example, enter `Page {page}` for the
current page and `{size} rows` for a page-size option. Use `{total}` for the
record count and `{field}` in editor validation messages.

```ts
public async SaveGridEdit(sender: WebDataGrid): Promise<void> {
  if (sender.pendingChanges.length > 0) await sender.SaveChanges();
}
```

Handle **OnSaveChanges** to confirm writes and **OnSaveError** to present failures. Individual writes are sent in order. Confirmed writes are removed from the queue even if a later one fails. A write with an uncertain outcome stays marked in the grid. Check the server state before making that change again.
