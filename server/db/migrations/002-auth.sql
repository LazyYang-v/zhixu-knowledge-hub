CREATE TABLE users (
  id uuid PRIMARY KEY, email_normalized text NOT NULL UNIQUE,
  display_name text NOT NULL, status text NOT NULL CHECK(status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(), CHECK(email_normalized=lower(email_normalized))
);
CREATE TABLE auth_identities (
  user_id uuid NOT NULL REFERENCES users(id), provider text NOT NULL,
  provider_subject text NOT NULL, password_hash text,
  PRIMARY KEY(provider,provider_subject), UNIQUE(user_id,provider),
  CHECK(provider='local' AND password_hash IS NOT NULL)
);
CREATE TABLE roles (
  tenant_id text NOT NULL REFERENCES tenants(id), id text NOT NULL,
  permissions text[] NOT NULL,
  PRIMARY KEY(tenant_id,id), CHECK(id IN ('admin','editor','viewer')),
  CHECK(permissions <@ ARRAY['read','write','publish','manage','workspace.manage','audit.read','upload','base.create']::text[])
);
CREATE TABLE memberships (
  tenant_id text NOT NULL, id uuid NOT NULL, user_id uuid NOT NULL REFERENCES users(id),
  role_id text NOT NULL, status text NOT NULL CHECK(status IN ('active','disabled')),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,user_id),
  FOREIGN KEY(tenant_id,role_id) REFERENCES roles(tenant_id,id)
);
CREATE TABLE knowledge_grants (
  tenant_id text NOT NULL, base_id text NOT NULL, membership_id uuid NOT NULL,
  permissions text[] NOT NULL,
  PRIMARY KEY(tenant_id,base_id,membership_id),
  FOREIGN KEY(tenant_id,base_id) REFERENCES knowledge_bases(tenant_id,id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(tenant_id,membership_id) REFERENCES memberships(tenant_id,id),
  CHECK(permissions <@ ARRAY['read','write','publish','manage']::text[]),
  CHECK(cardinality(permissions)>0 AND array_position(permissions,NULL) IS NULL)
);
CREATE INDEX knowledge_grants_member ON knowledge_grants(tenant_id,membership_id,base_id);
CREATE TABLE auth_sessions (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  tenant_id text NOT NULL, membership_id uuid NOT NULL,
  expires_at timestamptz NOT NULL, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,membership_id) REFERENCES memberships(tenant_id,id)
);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE INDEX auth_sessions_member ON auth_sessions(tenant_id,membership_id);
CREATE TABLE login_attempts (
  key_hash text PRIMARY KEY, attempts integer NOT NULL CHECK(attempts>0), window_start timestamptz NOT NULL
);
CREATE INDEX login_attempts_expiry ON login_attempts(window_start);
CREATE TABLE auth_events (
  id uuid PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id),
  actor_membership_id uuid, action text NOT NULL, target_id text,
  outcome text NOT NULL CHECK(outcome IN ('committed','denied')),
  request_id text, method text, http_status integer CHECK(http_status BETWEEN 100 AND 599),
  time timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES memberships(tenant_id,id)
);
CREATE INDEX auth_events_time ON auth_events(tenant_id,time,id);
ALTER TABLE documents ADD COLUMN published_version_id text;
ALTER TABLE documents ADD FOREIGN KEY(tenant_id,id,published_version_id)
  REFERENCES document_versions(tenant_id,document_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE file_artifacts ADD COLUMN uploader_membership_id uuid;
ALTER TABLE file_artifacts ADD FOREIGN KEY(tenant_id,uploader_membership_id)
  REFERENCES memberships(tenant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX file_artifacts_owner_content ON file_artifacts(tenant_id,uploader_membership_id,sha256,name);
ALTER TABLE conversations ADD COLUMN owner_membership_id uuid;
ALTER TABLE conversations ADD FOREIGN KEY(tenant_id,owner_membership_id)
  REFERENCES memberships(tenant_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX conversations_owner ON conversations(tenant_id,owner_membership_id,position);
