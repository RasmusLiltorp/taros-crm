/* global migrate */
// Tighten team_members createRule to null (admin-only).
// The accept-invite API route uses superuser credentials which bypass collection
// rules entirely, so no client-facing create rule is needed. The previous rule
// "@request.auth.id != ''" allowed any authenticated user to insert themselves
// into any team by calling the PocketBase API directly.
migrate((app) => {
  var teamMembers = app.findCollectionByNameOrId("team_members");
  teamMembers.createRule = null;
  app.save(teamMembers);
}, (app) => {
  // Rollback: restore the rule from migration 3
  var teamMembers = app.findCollectionByNameOrId("team_members");
  teamMembers.createRule = "@request.auth.id != ''";
  app.save(teamMembers);
});
