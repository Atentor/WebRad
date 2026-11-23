# RestGo GraphQL in WebRAD

## Define an operation

1. Enable the project's RestGO integration in **RestGO > Connection**. Connect the IDE to the same RestGo instance for administrative schema discovery.
2. Open **RestGO > GraphQL** and choose an already published database. Manage GraphQL activation, table and column permissions, and user access in RestGo. [RestGo GraphQL documentation](https://restgo.atentor.com/docs/graphql)
3. Give the operation a name and choose **Query**, **Insert**, **Update**, or **Delete**. Select the table operation and the fields to return. You can select related fields from the relationships exposed by the schema. Configure filters, ordering, and write fields where applicable.
4. Name the parameters and set their required flags or default values. Choose a page size for queries. Save the operation, then save the WebRAD project.

The manifest stores the visual operation, its generated GraphQL document, and its response schema. Preview and Build can use the saved contract without fetching administrative metadata. The browser sends requests to `POST /gql/{slug}` with the signed-in application's user session. The IDE's administrative connection stays in the Electron main process.

## Display a query

Place a nonvisual **GraphQL** component on the page or reusable element. In the Data Grid or ComboBox configuration, select that component and one of the project's saved queries. Map grid columns or the ComboBox key and display fields to the selected result fields.

The grid uses RestGo cursors for previous and next navigation, resets its cursor when parameters or the page size change, and shows a total when the schema supplies one. The ComboBox uses the first page of the query by default. Use `setVariables` to refresh the bindings with values from page controls.

```ts
GraphQL1.setVariables('ListCustomers', { name: SearchEdit.value });
```

You can also execute a named operation directly. The names, variables, and result fields come from the saved operation contract.

```ts
const page = await GraphQL1.executePage('ListCustomers', {
  first: 10,
  variables: { name: SearchEdit.value },
});

const result = await GraphQL1.executeMutation('RenameCustomer', {
  id: 42,
  name: 'Ana',
});
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
