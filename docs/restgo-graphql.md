# RestGo GraphQL in WebRAD

## Configure a table

1. Enable the project's RestGO integration in **RestGO > Connection**. Connect the IDE to the same RestGo instance for administrative schema discovery.
2. Open **RestGO > GraphQL** and choose an already published database. Manage GraphQL activation, table and column permissions, and user access in RestGo. [RestGo GraphQL documentation](https://restgo.atentor.com/docs/graphql)
3. Click **New**, select a table, and check the actions to use in the project. For example, enable **Query** and **Insert** to read and add records. Actions unavailable in the published schema are disabled.
4. Use the action buttons next to the settings heading to switch between enabled actions. WebRAD suggests an operation name and an initial return field for a new query. You can select related fields and configure parameters, ordering, and pagination where applicable. For **Insert** and **Update**, configure the fields to write. For **Update** and **Delete**, add a condition that identifies the record.
5. Click **Save actions** to apply the table's selections together, then save the WebRAD project. Reopen the table to change its actions. Clear a saved action's component bindings and API Client imports before deleting it.

Under **Conditions**, use **Add condition** for each filter. When the published schema supports both AND and OR, use **Add condition group** to combine filters under a different match rule. A vertical guide marks the conditions that belong to each subgroup.

The editor groups saved operations by database and table. Each operation retains its ID, name, generated GraphQL document, and response schema in the manifest. Preview and Build can use the saved contract without fetching administrative metadata. The browser sends requests to `POST /gql/{slug}` with the signed-in application's user session. The IDE's administrative connection stays in the Electron main process.

## Display a query through API Client

Place an **API Client** on the page or reusable element. Double-click the
client, open **GraphQL**, select the saved queries and mutations it should
use, and click **Save API Client**. Each client stores its own operation IDs.
Update an operation in **RestGO > GraphQL** to update its contract everywhere
it is imported.

- In **Configure Data Grid**, select **GraphQL** under **Data source**, select
  the **API Client**, then choose one of its imported queries. Map the columns to
  the query's output fields. For an HTTP endpoint, select **API Client** under
  **Data source**, then choose the client, operation, and response list.
- In the ComboBox configuration, select the client and choose an operation from
  **RestGo GraphQL queries**. Map the key and display fields to the query's
  output fields.

Each binding persists the API Client ID and operation ID in its component
configuration. GraphQL pagination and mutation settings are stored on the grid.
For record editing, import the compatible mutations into the same client as the
query before selecting them in the grid.

The imported queries and mutations are available in code through
`ApiClient1.graphql`. The same API Client can also run its configured
HTTP requests. Saved GraphQL operations use the project's RestGo connection and
the signed-in user's session, independently of the client's HTTP settings.
When an older project opens, WebRAD imports operations referenced by saved Data
Grid and ComboBox bindings into the corresponding client. For operations used
only in code, select those imports in the API Client.
The API Client Inspector exposes `OnGraphQLRequest`, `OnGraphQLSuccess`,
`OnGraphQLError`, and `OnGraphQLComplete` for saved operations.

The grid uses RestGo cursors for previous and next navigation, resets its cursor when parameters or the page size change, and shows a total when the schema supplies one. The ComboBox uses the first page of the query by default. Use `setVariables` to refresh the bindings with values from page controls.

```ts
ApiClient1.graphql.setVariables('ListCustomers', { name: SearchEdit.value });
```

To prepare a parameter before executing, assign it on the operation. Assignments
are local to that operation on that API Client. The request starts when
`execute` is called. Assign `undefined` to clear a prepared value.

```ts
const { graphql } = ApiClient1;
const customers = graphql.operation.ListCustomers;

customers.parameter.name = SearchEdit.value;
const { rows } = await graphql.execute(customers);
```

Use `graphql.execute` with an operation reference from `graphql.operation`.
Monaco completes the imported operation members and types the variables and
result for the selected reference. Parameters passed in the second argument
override prepared values for that execution. Use the third argument for
execution options such as pagination.

```ts
const { graphql } = ApiClient1;
const page = await graphql.execute(graphql.operation.ListCustomers, {
  name: SearchEdit.value,
});

const result = await graphql.execute(graphql.operation.RenameCustomer, {
  id: 42,
  name: 'Ana',
});
```

```ts
const page = await graphql.execute(
  graphql.operation.ListCustomers,
  { name: SearchEdit.value },
  { first: 10 },
);
```

## Edit records from Data Grid

Configure the grid against a query and enable **CRUD** in the Inspector. Choose the saved insert, update, and delete operations to expose. The mutations must target the query's database and table. Use a non-null unique key from the query in an equality condition for updates and deletes. Composite keys can use multiple equality conditions joined by AND.

The grid opens an editor for the mutation parameters or stages a delete. The staged changes appear in `pendingChanges` and can be discarded with `CancelChanges()`. To save from a separate button, call `await DataGrid1.SaveChanges()` in its click handler. To save immediately after an edit, assign the Data Grid's **OnChangesChanged** event and call the same method from the handler.

```ts
public async SaveGridEdit(sender: WebDataGrid): Promise<void> {
  if (sender.pendingChanges.length > 0) await sender.SaveChanges();
}
```

Handle **OnSaveChanges** to confirm writes and **OnSaveError** to present failures. Individual writes are sent in order. Confirmed writes are removed from the queue even if a later one fails. A write with an uncertain outcome stays marked in the grid. Check the server state before making that change again.
