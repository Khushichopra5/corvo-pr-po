CREATE TABLE IF NOT EXISTS plants (
  code text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  item_code text PRIMARY KEY,
  description text NOT NULL,
  uom text NOT NULL,
  category text NOT NULL,
  item_type text NOT NULL,
  standard_price numeric(14,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  supplier_id text PRIMARY KEY,
  name text NOT NULL,
  city text NOT NULL,
  categories text NOT NULL,
  status text NOT NULL,
  on_time_pct numeric(6,2) NOT NULL,
  quality_rating numeric(4,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS po_history (
  id bigserial PRIMARY KEY,
  po_number text NOT NULL,
  po_date date NOT NULL,
  supplier_id text NOT NULL REFERENCES suppliers(supplier_id),
  item_code text NOT NULL REFERENCES items(item_code),
  quantity numeric(14,3) NOT NULL,
  uom text NOT NULL,
  unit_price numeric(14,2) NOT NULL,
  plant text NOT NULL,
  delivered_on_time boolean NOT NULL
);

CREATE TABLE IF NOT EXISTS contracts (
  contract_id text PRIMARY KEY,
  supplier_id text NOT NULL REFERENCES suppliers(supplier_id),
  supplier_name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  value_cap numeric(16,2) NOT NULL,
  consumed_value numeric(16,2) NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'REGISTER',
  document_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contract_lines (
  contract_id text NOT NULL REFERENCES contracts(contract_id) ON DELETE CASCADE,
  item_code text NOT NULL REFERENCES items(item_code),
  description text NOT NULL,
  uom text NOT NULL,
  rate numeric(14,2) NOT NULL,
  PRIMARY KEY (contract_id, item_code)
);

CREATE TABLE IF NOT EXISTS policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id text NOT NULL,
  version text NOT NULL UNIQUE,
  effective_from date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  parameters jsonb NOT NULL,
  rules jsonb NOT NULL,
  label text,
  source_document_id uuid,
  diff_summary jsonb,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  filename text NOT NULL,
  mime text,
  bytes bytea,
  text_content text,
  parsed jsonb,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pr_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  source text NOT NULL DEFAULT 'UPLOAD',
  row_count integer NOT NULL DEFAULT 0,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pr_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES pr_batches(id) ON DELETE CASCADE,
  pr_no text NOT NULL,
  pr_line integer NOT NULL,
  created_at timestamp NOT NULL,
  requester text,
  department text,
  plant text,
  raw_item_code text,
  description text,
  quantity numeric(14,3) NOT NULL,
  uom text,
  estimated_unit_price numeric(14,2),
  need_by_date date,
  urgency text,
  resolved_item_code text,
  match_confidence numeric(5,2),
  match_note text,
  validation_error text,
  input_order integer NOT NULL
);

CREATE INDEX IF NOT EXISTS pr_lines_batch_idx ON pr_lines(batch_id);
CREATE INDEX IF NOT EXISTS pr_lines_key_idx ON pr_lines(pr_no, pr_line);

CREATE TABLE IF NOT EXISTS processing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES pr_batches(id) ON DELETE CASCADE,
  policy_version_id uuid REFERENCES policy_versions(id),
  policy_version text NOT NULL,
  as_of timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'READY',
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS processing_runs_batch_idx ON processing_runs(batch_id);

CREATE TABLE IF NOT EXISTS requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES processing_runs(id) ON DELETE CASCADE,
  group_id text NOT NULL,
  item_code text NOT NULL,
  item_description text,
  plant text NOT NULL,
  first_pr_no text,
  first_pr_line integer,
  first_created_at timestamp NOT NULL,
  need_by_date date,
  is_emergency boolean NOT NULL DEFAULT false,
  quantity numeric(14,3) NOT NULL,
  valuation_price numeric(14,4),
  po_unit_price numeric(14,4),
  group_value_inr numeric(16,2),
  decision text NOT NULL,
  route text NOT NULL,
  supplier_id text,
  contract_id text,
  po_id text,
  suggested_supplier_ids text,
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING',
  approved_po_id uuid,
  override_reason text,
  original_decision jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, group_id)
);

CREATE INDEX IF NOT EXISTS requirements_run_idx ON requirements(run_id);
CREATE INDEX IF NOT EXISTS requirements_status_idx ON requirements(run_id, status);

CREATE TABLE IF NOT EXISTS requirement_lines (
  requirement_id uuid NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  pr_line_id uuid NOT NULL REFERENCES pr_lines(id) ON DELETE CASCADE,
  PRIMARY KEY (requirement_id, pr_line_id)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL,
  run_id uuid REFERENCES processing_runs(id),
  supplier_id text NOT NULL,
  plant text NOT NULL,
  route text NOT NULL,
  anchor_at timestamp NOT NULL,
  total_value numeric(16,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'APPROVED',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, po_number)
);

CREATE TABLE IF NOT EXISTS po_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  requirement_id uuid REFERENCES requirements(id),
  item_code text NOT NULL,
  quantity numeric(14,3) NOT NULL,
  unit_price numeric(14,2) NOT NULL,
  value_inr numeric(16,2) NOT NULL,
  contract_id text
);

CREATE TABLE IF NOT EXISTS sourcing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id uuid NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  route text NOT NULL,
  invited_supplier_ids text,
  status text NOT NULL DEFAULT 'OPEN',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  summary text NOT NULL,
  before jsonb,
  after jsonb,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_events(created_at DESC);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
