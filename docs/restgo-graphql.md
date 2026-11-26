# RestGo GraphQL in WebRAD

## Configure an endpoint

1. Enable the project's RestGO integration in **RestGO > Connection**. Connect the IDE to the same RestGo instance for administrative schema discovery.
2. Open **RestGO > GraphQL** and choose an already published database. Manage GraphQL activation, table and column permissions, and user access in RestGo. [RestGo GraphQL documentation](https://restgo.atentor.com/docs/graphql)
3. Click **New**, select a table, and give the endpoint a name such as **Customers**. The table name is suggested automatically. Enable **Query** and **Insert**, for example, to read and add records through the same endpoint. Actions unavailable in the published schema are disabled. After changing a table or its columns in RestGo, click **Refresh** to reload the available fields.
4. Switch between the enabled actions to configure their fields and parameters. WebRAD generates the names used by code, such as `Customers_query` and `Customers_insert`. For **Insert** and **Update**, choose the fields to write. For **Update** and **Delete**, add a condition that identifies the record.
5. Click **Save endpoint**, then save the WebRAD project. Reopen the endpoint to rename it or change its actions. Clear bindings to an action before removing it. Clear the endpoint selection from its clients before removing the endpoint.

Under **Conditions**, use **Add condition** for each filter. When the published schema supports both AND and OR, use **Add condition group** to combine filters under a different match rule. A vertical guide marks the conditions that belong to each subgroup.

Under **Field display names**, enter a label such as **Full name** for the
field `nome`. The endpoint shares these labels across its actions. The Data
Grid uses them for writable fields in its add and edit dialogs. A blank label
uses the original field name. A field label set in the grid's **Labels** tab
takes precedence for that grid. All fields currently available in the published
table are listed, including fields not yet selected for an operation.

The project assigns one endpoint to each database and table pair. Its actions share an optional display name in the manifest. Older definitions use the table name until saved with an endpoint name. Each action retains its ID, generated operation name, document, and response schema. Renaming the endpoint preserves existing code and bindings. Preview and Build use the saved action contracts. The browser sends requests to `POST /gql/{slug}` with the signed-in application's user session. The IDE's administrative connection stays in the Electron main process.

## Set up a GraphQL Client

1. Add a **GraphQL Client** to the page or reusable element.
2. Double-click the client in the nonvisual tray and select one endpoint.
   Search by name, database, table, or action. **Active** shows the selected
   endpoint and **Inactive** shows other endpoints. The list shows up to 50
   endpoints per page.
3. Click **Save GraphQL Client**. The client stores the endpoint key and
   exposes all its enabled actions, including actions added later. Existing
   clients with individually selected actions keep those actions until saved
   with an endpoint selection.

The dialog shows which Data Grid or ComboBox components use the endpoint.
Change their bindings before switching or clearing it.

Edit an operation in **RestGO > GraphQL** to update its contract for every
client that selected it. The client uses the project's RestGO connection and
the application user's session.

## Bind a Data Grid

Open **Configure Data Grid**. Select **GraphQL Client** under **Data source**
and choose the client. WebRAD selects the endpoint automatically when it
provides one Query. Under **Endpoint actions**, **Insert**, **Update**, and
**Delete** show whether each action is available to the grid. **Enable record
editing** selects compatible actions with a single choice when setting up
editing. Clear any action you do not want to offer in that grid. Insert and
Update require fields to write. Update and Delete also need an equality
condition on a key field returned by Query. The grid stores stable action IDs
for the bindings it uses.

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
`CancelChanges()`. A checkbox or toggle bound to a Boolean mutation input can
also stage that field directly, using the same `OnChangesChanged` and
`SaveChanges` flow as applying the editor. In **Labels > Record actions**,
enable **Show a Save button when there are drafts** to let users send the
pending changes from the grid. **Apply** stages the editor values locally. The
grid marks the edited row as a draft and shows the unsaved status. During a
save, the grid shows progress and disables actions that would change the draft.
To save from a separate button, call `await DataGrid1.SaveChanges()` in its
click handler. To save immediately after an edit, call the same method from
**OnChangesChanged**.

In **Labels > Language**, choose **Português**, **English**, or **Español** for
the grid's GraphQL controls, or choose **Custom** to edit their captions.
Switching languages preserves custom captions. An empty custom caption uses the
English default. Use `{page}` for the current page, `{size}` for the page size,
`{total}` for the record count, and `{field}` in editor validation messages.
Set mutation field names separately in **Mutation fields**.

The grid stores this selection in the optional `labelLanguage` field of its
version 2 configuration (`pt`, `en`, `es`, or `custom`). Earlier configurations
use Custom when they contain caption overrides and English otherwise.

```ts
public async SaveGridEdit(sender: WebDataGrid): Promise<void> {
  if (sender.pendingChanges.length > 0) await sender.SaveChanges();
}
```

Handle **OnSaveChanges** to confirm writes and **OnSaveError** to present failures. Individual writes are sent in order. Confirmed writes are removed from the queue even if a later one fails. A write with an uncertain outcome stays marked in the grid. Check the server state before making that change again.
