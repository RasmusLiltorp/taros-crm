export interface Contact {
  id: string;
  team: string;
  sheet?: string;
  url: string;
  contact_person: string;
  company_name: string;
  group_name: string;
  email: string;
  phone: string;
  title: string;
  country: string;
  company_size: string;
  channel: string;
  owner: string;
  contacted: boolean;
  notes: string;
  custom_data?: Record<string, unknown>;
  created_by: string;
  created: string;
  updated: string;
  [key: string]: unknown;
}

export interface ContactSheet {
  id: string;
  team: string;
  name: string;
  template: string;
  fields?: unknown;
  description: string;
  created_by: string;
  created: string;
  updated: string;
}

export interface Team {
  id: string;
  name: string;
  created_by: string;
}

export interface TeamMember {
  id: string;
  team: string;
  user: string;
  role: "owner" | "member";
  expand?: {
    user?: UserRecord;
    team?: Team;
  };
}

export interface Invite {
  id: string;
  team: string;
  email: string;
  token: string;
  accepted: boolean;
  expires: string;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
}
