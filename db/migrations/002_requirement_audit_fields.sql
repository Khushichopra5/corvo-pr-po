ALTER TABLE requirements ADD COLUMN IF NOT EXISTS clause text;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS matched_rule text;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS requires_approval text;
