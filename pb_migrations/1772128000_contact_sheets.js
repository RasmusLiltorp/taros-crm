/* global migrate, Collection */

migrate((app) => {
  try {
    const teams = app.findCollectionByNameOrId("teams");

    let sheets;
    try {
      sheets = app.findCollectionByNameOrId("contact_sheets");
    } catch {
      sheets = new Collection({
        name: "contact_sheets",
        type: "base",
        fields: [
          {
            name: "team",
            type: "relation",
            required: true,
            collectionId: teams.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: "name", type: "text", required: true },
          { name: "template", type: "text" },
          { name: "description", type: "text" },
          {
            name: "created_by",
            type: "relation",
            collectionId: "_pb_users_auth_",
            cascadeDelete: false,
            maxSelect: 1,
          },
        ],
        indexes: [],
        listRule: "team.team_members_via_team.user ?= @request.auth.id",
        viewRule: "team.team_members_via_team.user ?= @request.auth.id",
        createRule: "team.team_members_via_team.user ?= @request.auth.id",
        updateRule: "team.team_members_via_team.user ?= @request.auth.id",
        deleteRule: "team.team_members_via_team.user ?= @request.auth.id",
      });
      app.save(sheets);
    }

    const contacts = app.findCollectionByNameOrId("contacts");
    if (!contacts.fields.getByName("sheet")) {
      contacts.fields.add({
        name: "sheet",
        type: "relation",
        required: false,
        collectionId: sheets.id,
        cascadeDelete: false,
        maxSelect: 1,
      });
      app.save(contacts);
    }
  } catch {
    // ignore migration errors to avoid blocking boot in partial environments
  }
}, (app) => {
  try {
    const contacts = app.findCollectionByNameOrId("contacts");
    const sheetField = contacts.fields.getByName("sheet");
    if (sheetField) {
      contacts.fields.remove(sheetField);
      app.save(contacts);
    }
  } catch {
    // ignore rollback errors
  }

  try {
    const sheets = app.findCollectionByNameOrId("contact_sheets");
    app.delete(sheets);
  } catch {
    // ignore rollback errors
  }
});
