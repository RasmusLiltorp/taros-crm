/* global migrate, core, SchemaField */

migrate((app) => {
  try {
    let sheets = app.findCollectionByNameOrId("contact_sheets");
    if (!sheets.fields.getByName("fields")) {
      let f;
      if (typeof core !== "undefined" && typeof core.JSONField !== "undefined") {
        f = new core.JSONField();
        f.name = "fields";
        f.maxSize = 102400;
      } else if (typeof SchemaField !== "undefined") {
        f = new SchemaField({ name: "fields", type: "json", options: { maxSize: 102400 } });
      } else {
        throw new Error("Cannot find core.JSONField or SchemaField");
      }
      sheets.fields.add(f);
      app.save(sheets);
    }

    let contacts = app.findCollectionByNameOrId("contacts");
    if (!contacts.fields.getByName("custom_data")) {
      let f;
      if (typeof core !== "undefined" && typeof core.JSONField !== "undefined") {
        f = new core.JSONField();
        f.name = "custom_data";
        f.maxSize = 102400;
      } else if (typeof SchemaField !== "undefined") {
        f = new SchemaField({ name: "custom_data", type: "json", options: { maxSize: 102400 } });
      } else {
        throw new Error("Cannot find core.JSONField or SchemaField");
      }
      contacts.fields.add(f);
      app.save(contacts);
    }
  } catch (err) {
    console.error("Custom fields migration failed:", err);
    throw err;
  }
}, (app) => {
  try {
    let sheets = app.findCollectionByNameOrId("contact_sheets");
    let fieldsField = sheets.fields.getByName("fields");
    if (fieldsField) {
      sheets.fields.remove(fieldsField);
      app.save(sheets);
    }

    let contacts = app.findCollectionByNameOrId("contacts");
    let customDataField = contacts.fields.getByName("custom_data");
    if (customDataField) {
      contacts.fields.remove(customDataField);
      app.save(contacts);
    }
  } catch (err) {
    console.error("Custom fields rollback failed:", err);
  }
});
