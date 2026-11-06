-- P2 core; applied only by an explicit transaction, never by server startup.
CREATE TABLE schema_migrations (version integer PRIMARY KEY, checksum text NOT NULL);
CREATE TABLE tenants (
  id text PRIMARY KEY, name text NOT NULL, status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended'))
);
CREATE TABLE workspace_settings (
  tenant_id text PRIMARY KEY REFERENCES tenants(id),
  values jsonb NOT NULL CHECK (jsonb_typeof(values) = 'object'),
  legacy_root jsonb NOT NULL CHECK (jsonb_typeof(legacy_root) = 'object')
);
CREATE TABLE knowledge_bases (
  tenant_id text NOT NULL REFERENCES tenants(id), id text NOT NULL,
  name text NOT NULL, normalized_name text NOT NULL, revision bigint NOT NULL CHECK(revision > 0),
  position integer NOT NULL CHECK(position >= 0), metadata jsonb NOT NULL,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,normalized_name)
);
-- Existing member configuration is deliberately not a verified membership or account.
CREATE TABLE legacy_members (
  tenant_id text NOT NULL REFERENCES tenants(id), id text NOT NULL,
  email_normalized text NOT NULL, role text NOT NULL, revision bigint NOT NULL CHECK(revision > 0),
  position integer NOT NULL CHECK(position >= 0), metadata jsonb NOT NULL,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,email_normalized)
);
CREATE TABLE file_artifacts (
  tenant_id text NOT NULL REFERENCES tenants(id), id text NOT NULL, name text NOT NULL,
  size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 20971520),
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), media_type text NOT NULL,
  created_at timestamptz NOT NULL, metadata jsonb NOT NULL,
  PRIMARY KEY(tenant_id,id)
);
CREATE INDEX file_artifacts_digest ON file_artifacts(tenant_id,sha256);
CREATE TABLE documents (
  tenant_id text NOT NULL REFERENCES tenants(id), id text NOT NULL, base_id text NOT NULL,
  name text NOT NULL, status text NOT NULL CHECK(status IN ('草稿','已发布','已归档')),
  revision bigint NOT NULL CHECK(revision > 0), source_artifact_id text,
  position integer NOT NULL CHECK(position >= 0), metadata jsonb NOT NULL,
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY(tenant_id,base_id) REFERENCES knowledge_bases(tenant_id,id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(tenant_id,source_artifact_id) REFERENCES file_artifacts(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX documents_base_status ON documents(tenant_id,base_id,status);
CREATE TABLE document_versions (
  tenant_id text NOT NULL, id text NOT NULL, document_id text NOT NULL,
  version_label text NOT NULL, position integer NOT NULL CHECK(position >= 0), source_artifact_id text,
  metadata jsonb NOT NULL,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,document_id,version_label), UNIQUE(tenant_id,document_id,id),
  FOREIGN KEY(tenant_id,document_id) REFERENCES documents(tenant_id,id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(tenant_id,source_artifact_id) REFERENCES file_artifacts(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE chunks (
  tenant_id text NOT NULL, id text NOT NULL, version_id text NOT NULL,
  ordinal integer NOT NULL CHECK(ordinal >= 0), content text NOT NULL,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,version_id,ordinal),
  FOREIGN KEY(tenant_id,version_id) REFERENCES document_versions(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE document_working_chunks (
  tenant_id text NOT NULL, document_id text NOT NULL, ordinal integer NOT NULL CHECK(ordinal >= 0), content text NOT NULL,
  PRIMARY KEY(tenant_id,document_id,ordinal),
  FOREIGN KEY(tenant_id,document_id) REFERENCES documents(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE processing_tasks (
  tenant_id text NOT NULL, id text NOT NULL, document_id text NOT NULL, version_id text,
  kind text CHECK(kind IN ('prepare_text','validate_chunks')),
  state text CHECK(state IN ('queued','running','retry_wait','succeeded','failed','cancelled')),
  job_snapshot jsonb, superseded_by text, position integer NOT NULL CHECK(position >= 0), metadata jsonb NOT NULL,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,document_id,id),
  CHECK((job_snapshot IS NULL AND state IS NULL AND kind IS NULL AND version_id IS NULL) OR
    (job_snapshot IS NOT NULL AND state IS NOT NULL AND kind IS NOT NULL AND version_id IS NOT NULL)),
  FOREIGN KEY(tenant_id,document_id) REFERENCES documents(tenant_id,id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(tenant_id,document_id,version_id) REFERENCES document_versions(tenant_id,document_id,id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(tenant_id,document_id,superseded_by) REFERENCES processing_tasks(tenant_id,document_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX active_text_job ON processing_tasks(tenant_id,version_id,kind)
  WHERE state IN ('queued','running','retry_wait');
CREATE INDEX tasks_document ON processing_tasks(tenant_id,document_id);
CREATE TABLE task_events (
  tenant_id text NOT NULL, task_id text NOT NULL, sequence integer NOT NULL CHECK(sequence > 0),
  time timestamptz NOT NULL, type text NOT NULL, message text NOT NULL,
  PRIMARY KEY(tenant_id,task_id,sequence),
  FOREIGN KEY(tenant_id,task_id) REFERENCES processing_tasks(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE conversations (
  tenant_id text NOT NULL REFERENCES tenants(id), id text NOT NULL, title text NOT NULL,
  position integer NOT NULL CHECK(position >= 0), metadata jsonb NOT NULL,
  PRIMARY KEY(tenant_id,id)
);
CREATE TABLE messages (
  tenant_id text NOT NULL, id text NOT NULL, conversation_id text NOT NULL,
  ordinal integer NOT NULL CHECK(ordinal >= 0), role text NOT NULL CHECK(role IN ('user','assistant')),
  content text NOT NULL, metadata jsonb NOT NULL,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,conversation_id,ordinal),
  FOREIGN KEY(tenant_id,conversation_id) REFERENCES conversations(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE audit_events (
  tenant_id text NOT NULL REFERENCES tenants(id), id text NOT NULL, action text NOT NULL,
  actor_kind text NOT NULL CHECK(actor_kind IN ('user','anonymous','system','legacy_unverified')),
  request_id text, position integer NOT NULL CHECK(position >= 0), metadata jsonb NOT NULL,
  PRIMARY KEY(tenant_id,id)
);
CREATE INDEX audit_request ON audit_events(tenant_id,request_id);
CREATE TABLE evaluation_runs (
  tenant_id text NOT NULL REFERENCES tenants(id), id text NOT NULL,
  position integer NOT NULL CHECK(position >= 0), metadata jsonb NOT NULL,
  PRIMARY KEY(tenant_id,id)
);
CREATE TABLE permission_rules (
  tenant_id text NOT NULL REFERENCES tenants(id), key text NOT NULL, values boolean[] NOT NULL,
  PRIMARY KEY(tenant_id,key), CHECK(cardinality(values) = 4 AND array_position(values,NULL) IS NULL)
);
CREATE TABLE idempotency_records (
  tenant_id text NOT NULL REFERENCES tenants(id), key text NOT NULL, fingerprint text NOT NULL,
  expires_at timestamptz NOT NULL, result jsonb NOT NULL,
  PRIMARY KEY(tenant_id,key)
);
CREATE INDEX idempotency_expiry ON idempotency_records(expires_at);
