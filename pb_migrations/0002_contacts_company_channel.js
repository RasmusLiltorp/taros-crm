/* global migrate */

// No-op: company_name and channel (text) are already defined in migration 1.
// This migration exists only for deploy environments that were initialized
// before migration 1 included those fields (i.e., pre-release snapshots).
// On a clean deploy migration 1 already handles both fields; this is a safe no-op.
migrate((app) => {
  try {
    const contacts = app.findCollectionByNameOrId("contacts");

    // Add company_name if somehow missing
    if (!contacts.fields.getByName("company_name")) {
      contacts.fields.add({
        name: "company_name",
        type: "text",
      });
      app.save(contacts);
    }

    // If channel exists as a select field, remove and re-add as text
    const channelField = contacts.fields.getByName("channel");
    if (channelField && channelField.type === "select") {
      contacts.fields.remove(channelField);
      contacts.fields.add({
        name: "channel",
        type: "text",
      });
      app.save(contacts);
    }
  } catch {
    // collection not found — nothing to do
  }
}, (app) => {
  // rollback is a no-op: we don't want to remove company_name on rollback
  // since migration 1 owns it on a clean deploy
  void app;
});
