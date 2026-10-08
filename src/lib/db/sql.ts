export const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS bots (
  id text PRIMARY KEY,
  name text NOT NULL,
  telegram_username text,
  telegram_bot_id text,
  token_encrypted text NOT NULL,
  webhook_secret text NOT NULL,
  webhook_url text,
  status text NOT NULL DEFAULT 'disconnected',
  last_health_at timestamptz,
  last_health_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
  id text PRIMARY KEY,
  bot_id text NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  telegram_user_id text NOT NULL,
  username text,
  first_name text,
  last_name text,
  language_code text,
  email text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_bot_tg_idx ON contacts(bot_id, telegram_user_id);

CREATE TABLE IF NOT EXISTS tags (
  id text PRIMARY KEY,
  bot_id text NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#c4a574'
);
CREATE UNIQUE INDEX IF NOT EXISTS tags_bot_name_idx ON tags(bot_id, name);

CREATE TABLE IF NOT EXISTS contact_tags (
  contact_id text NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id text NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);

CREATE TABLE IF NOT EXISTS custom_fields (
  id text PRIMARY KEY,
  bot_id text NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text'
);
CREATE UNIQUE INDEX IF NOT EXISTS custom_fields_bot_key_idx ON custom_fields(bot_id, key);

CREATE TABLE IF NOT EXISTS contact_field_values (
  contact_id text NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  field_id text NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  value text NOT NULL,
  PRIMARY KEY (contact_id, field_id)
);

CREATE TABLE IF NOT EXISTS flows (
  id text PRIMARY KEY,
  bot_id text NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_type text NOT NULL,
  trigger_value text,
  is_active boolean NOT NULL DEFAULT true,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS flow_sessions (
  id text PRIMARY KEY,
  contact_id text NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  flow_id text NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  step_id text NOT NULL,
  awaiting_input boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  bot_id text NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  contact_id text NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  direction text NOT NULL,
  source text NOT NULL,
  body text NOT NULL,
  telegram_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_contact_created_idx ON messages(contact_id, created_at);

CREATE TABLE IF NOT EXISTS broadcasts (
  id text PRIMARY KEY,
  bot_id text NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  name text NOT NULL,
  body text NOT NULL,
  tag_id text NOT NULL REFERENCES tags(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft',
  confirmed_at timestamptz,
  total_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id text PRIMARY KEY,
  broadcast_id text NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  contact_id text NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  error text,
  sent_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS broadcast_recipients_unique ON broadcast_recipients(broadcast_id, contact_id);

ALTER TABLE flow_sessions ADD COLUMN IF NOT EXISTS resume_at timestamptz;
ALTER TABLE flow_sessions ADD COLUMN IF NOT EXISTS form_index integer;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS unsubscribed boolean NOT NULL DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS subscriptions jsonb NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS growth_links (
  id text PRIMARY KEY,
  bot_id text NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  tag_name text,
  flow_id text REFERENCES flows(id) ON DELETE SET NULL,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  click_count integer NOT NULL DEFAULT 0,
  start_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS growth_links_bot_slug_idx ON growth_links(bot_id, slug);

CREATE TABLE IF NOT EXISTS growth_link_events (
  id text PRIMARY KEY,
  link_id text NOT NULL REFERENCES growth_links(id) ON DELETE CASCADE,
  contact_id text REFERENCES contacts(id) ON DELETE SET NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS growth_link_events_link_idx ON growth_link_events(link_id, created_at);

CREATE TABLE IF NOT EXISTS sequences (
  id text PRIMARY KEY,
  bot_id text NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sequence_steps (
  id text PRIMARY KEY,
  sequence_id text NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  position integer NOT NULL,
  delay_seconds integer NOT NULL DEFAULT 0,
  body text NOT NULL
);

CREATE TABLE IF NOT EXISTS sequence_subscriptions (
  id text PRIMARY KEY,
  sequence_id text NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  contact_id text NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  next_index integer NOT NULL DEFAULT 0,
  next_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active',
  UNIQUE (sequence_id, contact_id)
);

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS welcomed boolean NOT NULL DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS inbox_status text NOT NULL DEFAULT 'open';
ALTER TABLE flows ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS automation_rules (
  id text PRIMARY KEY,
  bot_id text NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  trigger_type text NOT NULL,
  trigger_value text,
  action_type text NOT NULL,
  action_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE broadcasts ALTER COLUMN tag_id DROP NOT NULL;

ALTER TABLE bots ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'telegram';
ALTER TABLE bots ADD COLUMN IF NOT EXISTS external_account_id text;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS app_secret_encrypted text;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS platform text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS channel_account_id text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS thread_id text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS saved_replies (
  id text PRIMARY KEY,
  bot_id text NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_contact_created_idx ON messages(contact_id, created_at);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS bot_paused_until timestamptz;

CREATE TABLE IF NOT EXISTS flow_events (
  id text PRIMARY KEY,
  bot_id text NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  flow_id text NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  step_id text,
  contact_id text REFERENCES contacts(id) ON DELETE SET NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flow_events_flow_idx ON flow_events(flow_id, kind);
CREATE INDEX IF NOT EXISTS flow_events_bot_idx ON flow_events(bot_id, created_at);

ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS segment jsonb;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS flow_id text REFERENCES flows(id) ON DELETE SET NULL;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

CREATE TABLE IF NOT EXISTS api_keys (
  id text PRIMARY KEY,
  bot_id text NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL,
  prefix text NOT NULL,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys(key_hash);

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id text PRIMARY KEY,
  bot_id text NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret text NOT NULL,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  last_status integer,
  last_error text,
  last_delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text,
  color text NOT NULL DEFAULT '#0084FF',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS assigned_to text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS author text;
ALTER TABLE flow_events ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE flow_events ADD COLUMN IF NOT EXISTS value double precision;
ALTER TABLE sequence_steps ADD COLUMN IF NOT EXISTS flow_id text REFERENCES flows(id) ON DELETE SET NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;
ALTER TABLE flows ADD COLUMN IF NOT EXISTS folder text;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS body_b text;
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id text PRIMARY KEY,
  bot_id text NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  contact_id text NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  body text NOT NULL,
  send_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  author text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scheduled_messages_due_idx ON scheduled_messages(status, send_at);
ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS author_id text;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS variant text;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS smart_timing boolean NOT NULL DEFAULT false;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS send_at timestamptz;

CREATE TABLE IF NOT EXISTS flow_versions (
  id text PRIMARY KEY,
  flow_id text NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_type text NOT NULL,
  trigger_value text,
  definition jsonb NOT NULL,
  author text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flow_versions_flow_idx ON flow_versions(flow_id, created_at);

CREATE TABLE IF NOT EXISTS activity_log (
  id text PRIMARY KEY,
  bot_id text NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  actor text,
  action text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_log_bot_idx ON activity_log(bot_id, created_at);
ALTER TABLE flow_events ALTER COLUMN flow_id DROP NOT NULL;
ALTER TABLE flow_events ADD COLUMN IF NOT EXISTS currency text;
CREATE TABLE IF NOT EXISTS processed_events (
  bot_id text NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  source text NOT NULL,
  event_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bot_id, source, event_id)
);
CREATE TABLE IF NOT EXISTS contact_aliases (
  bot_id text NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  external_user_id text NOT NULL,
  contact_id text NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  platform text,
  channel_account_id text,
  thread_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bot_id, external_user_id)
);
ALTER TABLE contact_tags ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email);
ALTER TABLE bots ADD COLUMN IF NOT EXISTS owner_id text REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS bots_owner_idx ON bots(owner_id);
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS owner_id text REFERENCES users(id) ON DELETE CASCADE;
`;
