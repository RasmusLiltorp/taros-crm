/* global migrate, Collection */
migrate((app) => {
  // ─── teams ───────────────────────────────────────────────────────────────
  const teams = new Collection({
    name: "teams",
    type: "base",
    fields: [
      { name: "name",       type: "text",     required: true },
      { name: "created_by", type: "relation", required: true,
        collectionId: "_pb_users_auth_", cascadeDelete: false, maxSelect: 1 },
    ],
    indexes: [],
    listRule:   "@request.auth.id != ''",
    viewRule:   "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: null,
  });
  app.save(teams);

  // ─── team_members ─────────────────────────────────────────────────────────
  const teamMembers = new Collection({
    name: "team_members",
    type: "base",
    fields: [
      { name: "team", type: "relation", required: true,
        collectionId: teams.id, cascadeDelete: true, maxSelect: 1 },
      { name: "user", type: "relation", required: true,
        collectionId: "_pb_users_auth_", cascadeDelete: true, maxSelect: 1 },
      { name: "role", type: "select", required: true,
        values: ["owner", "member"], maxSelect: 1 },
    ],
    indexes: [],
    listRule:   "@request.auth.id != ''",
    viewRule:   "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
  });
  app.save(teamMembers);

  // ─── invites ──────────────────────────────────────────────────────────────
  const invites = new Collection({
    name: "invites",
    type: "base",
    fields: [
      { name: "team",     type: "relation", required: true,
        collectionId: teams.id, cascadeDelete: true, maxSelect: 1 },
      { name: "email",    type: "email",    required: true },
      { name: "token",    type: "text",     required: true },
      { name: "accepted", type: "bool" },
      { name: "expires",  type: "date" },
    ],
    indexes: [],
    listRule:   "@request.auth.id != ''",
    viewRule:   null,
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
  });
  app.save(invites);

  // ─── contacts ─────────────────────────────────────────────────────────────
  const contacts = new Collection({
    name: "contacts",
    type: "base",
    fields: [
      { name: "team",           type: "relation", required: true,
        collectionId: teams.id, cascadeDelete: true, maxSelect: 1 },
      { name: "url",            type: "text" },
      { name: "contact_person", type: "text" },
      { name: "company_name",   type: "text" },
      { name: "channel",        type: "text" },
      { name: "owner",          type: "text" },
      { name: "contacted",      type: "bool" },
      { name: "notes",          type: "text" },
      { name: "created_by",     type: "relation",
        collectionId: "_pb_users_auth_", cascadeDelete: false, maxSelect: 1 },
    ],
    indexes: [],
    listRule:   "@request.auth.id != ''",
    viewRule:   "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
  });
  app.save(contacts);

}, (app) => {
  // rollback
  for (const name of ["contacts", "invites", "team_members", "teams"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch { /* ignore */ }
  }
});
