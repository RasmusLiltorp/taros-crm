/* global migrate */
// Security fix: replace overly-permissive collection rules with team-scoped rules.
// Previously all rules were `@request.auth.id != ''`, allowing any authenticated
// user to read/write every team's data via direct API calls.
migrate((app) => {
  // ─── contacts ─────────────────────────────────────────────────────────────
  var contacts = app.findCollectionByNameOrId("contacts");
  // Only team members can list/view/create/update/delete contacts in their team
  contacts.listRule   = "team.team_members_via_team.user ?= @request.auth.id";
  contacts.viewRule   = "team.team_members_via_team.user ?= @request.auth.id";
  contacts.createRule = "team.team_members_via_team.user ?= @request.auth.id";
  contacts.updateRule = "team.team_members_via_team.user ?= @request.auth.id";
  contacts.deleteRule = "team.team_members_via_team.user ?= @request.auth.id";
  app.save(contacts);

  // ─── teams ─────────────────────────────────────────────────────────────────
  var teams = app.findCollectionByNameOrId("teams");
  // Any authenticated user can create a team (first-time setup via ensureTeam)
  // but can only view/update teams they are a member of
  teams.listRule   = "@request.auth.id != ''";
  teams.viewRule   = "team_members_via_team.user ?= @request.auth.id";
  teams.createRule = "@request.auth.id != ''";
  teams.updateRule = "team_members_via_team.user ?= @request.auth.id";
  teams.deleteRule = null; // no self-service delete
  app.save(teams);

  // ─── team_members ──────────────────────────────────────────────────────────
  var teamMembers = app.findCollectionByNameOrId("team_members");
  // Members can list/view membership records for their own team only
  // Owners can delete (remove) members — refined further in migration 0004
  teamMembers.listRule   = "team.team_members_via_team.user ?= @request.auth.id";
  teamMembers.viewRule   = "team.team_members_via_team.user ?= @request.auth.id";
  teamMembers.createRule = "@request.auth.id != ''"; // tightened to null in migration 0004
  teamMembers.updateRule = null; // roles are not changed via the app
  teamMembers.deleteRule = "team.team_members_via_team.user ?= @request.auth.id";
  app.save(teamMembers);

  // ─── invites ───────────────────────────────────────────────────────────────
  var invites = app.findCollectionByNameOrId("invites");
  // listRule is open so unauthenticated visitors can look up an invite by token hash.
  // Tokens are SHA-256 hashes of UUIDs, so guessing a valid token is infeasible.
  // Members can also list invites for their own team (covered by the open rule).
  invites.listRule   = "";
  invites.viewRule   = "token = @request.body.token || team.team_members_via_team.user ?= @request.auth.id";
  invites.createRule = "team.team_members_via_team.user ?= @request.auth.id";
  invites.updateRule = "token = @request.body.token"; // token-gated accept
  invites.deleteRule = "team.team_members_via_team.user ?= @request.auth.id";
  app.save(invites);

}, (app) => {
  // Rollback: restore permissive rules from migration 1
  var contacts = app.findCollectionByNameOrId("contacts");
  contacts.listRule   = "@request.auth.id != ''";
  contacts.viewRule   = "@request.auth.id != ''";
  contacts.createRule = "@request.auth.id != ''";
  contacts.updateRule = "@request.auth.id != ''";
  contacts.deleteRule = "@request.auth.id != ''";
  app.save(contacts);

  var teams = app.findCollectionByNameOrId("teams");
  teams.listRule   = "@request.auth.id != ''";
  teams.viewRule   = "@request.auth.id != ''";
  teams.createRule = "@request.auth.id != ''";
  teams.updateRule = "@request.auth.id != ''";
  teams.deleteRule = null;
  app.save(teams);

  var teamMembers = app.findCollectionByNameOrId("team_members");
  teamMembers.listRule   = "@request.auth.id != ''";
  teamMembers.viewRule   = "@request.auth.id != ''";
  teamMembers.createRule = "@request.auth.id != ''";
  teamMembers.updateRule = "@request.auth.id != ''";
  teamMembers.deleteRule = "@request.auth.id != ''";
  app.save(teamMembers);

  var invites = app.findCollectionByNameOrId("invites");
  invites.listRule   = "@request.auth.id != ''";
  invites.viewRule   = null;
  invites.createRule = "@request.auth.id != ''";
  invites.updateRule = "@request.auth.id != ''";
  invites.deleteRule = "@request.auth.id != ''";
  app.save(invites);
});
