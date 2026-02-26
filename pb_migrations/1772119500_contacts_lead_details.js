/* global migrate */

migrate((app) => {
  try {
    const contacts = app.findCollectionByNameOrId("contacts");
    let changed = false;

    const detailFields = [
      "email",
      "phone",
      "title",
      "country",
      "company_size",
    ];

    for (const name of detailFields) {
      if (!contacts.fields.getByName(name)) {
        contacts.fields.add({
          name,
          type: "text",
        });
        changed = true;
      }
    }

    if (changed) app.save(contacts);
  } catch {
    // collection not found — nothing to do
  }
}, (app) => {
  try {
    const contacts = app.findCollectionByNameOrId("contacts");
    let changed = false;

    for (const name of ["email", "phone", "title", "country", "company_size"]) {
      const field = contacts.fields.getByName(name);
      if (field) {
        contacts.fields.remove(field);
        changed = true;
      }
    }

    if (changed) app.save(contacts);
  } catch {
    // ignore rollback errors
  }
});
