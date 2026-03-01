-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.cancellation_reasons (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  label text NOT NULL,
  active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cancellation_reasons_pkey PRIMARY KEY (id)
);
CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  ruc text,
  address text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  zoho_contact_id text,
  zoho_last_modified_at timestamp with time zone,
  sync_source text NOT NULL DEFAULT 'manual'::text CHECK (sync_source = ANY (ARRAY['manual'::text, 'zoho'::text])),
  CONSTRAINT customers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT deliveries_pkey PRIMARY KEY (id)
);
CREATE TABLE public.inventory_balance (
  item_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  qty_on_hand integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'sync'::text,
  source_ts timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT inventory_balance_pkey PRIMARY KEY (item_id, warehouse_id),
  CONSTRAINT inventory_balance_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id),
  CONSTRAINT inventory_balance_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id)
);
CREATE TABLE public.inventory_events (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  idempotency_key text NOT NULL UNIQUE,
  source text NOT NULL,
  event_type text NOT NULL,
  item_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  qty_delta integer,
  qty_before integer,
  qty_after integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_ts timestamp with time zone,
  processed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT inventory_events_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_events_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id),
  CONSTRAINT inventory_events_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id)
);
CREATE TABLE public.inventory_lots (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  item_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  lot_code text,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  qty_received integer NOT NULL CHECK (qty_received >= 0),
  qty_remaining integer NOT NULL CHECK (qty_remaining >= 0),
  unit_cost numeric,
  source text NOT NULL DEFAULT 'purchase'::text,
  external_ref text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT inventory_lots_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_lots_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id),
  CONSTRAINT inventory_lots_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id)
);
CREATE TABLE public.item_serials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  zoho_serial_id text NOT NULL UNIQUE,
  zoho_item_id text NOT NULL,
  warehouse_id uuid,
  serial_number text NOT NULL,
  status text NOT NULL,
  created_time timestamp with time zone,
  last_synced_at timestamp with time zone DEFAULT now(),
  CONSTRAINT item_serials_pkey PRIMARY KEY (id),
  CONSTRAINT item_serials_zoho_item_id_fkey FOREIGN KEY (zoho_item_id) REFERENCES public.items(zoho_item_id),
  CONSTRAINT item_serials_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id)
);
CREATE TABLE public.items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  sku text NOT NULL,
  name text NOT NULL,
  color text,
  state text,
  zoho_item_id text UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  category text DEFAULT 'Sin categoría'::text,
  marca text,
  stock_total integer,
  price numeric,
  zoho_removed_at timestamp with time zone,
  CONSTRAINT items_pkey PRIMARY KEY (id)
);
CREATE TABLE public.permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  module text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT permissions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.role_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role = ANY (ARRAY['admin'::text, 'manager'::text, 'operator'::text, 'auditor'::text])),
  permission_code text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT role_permissions_pkey PRIMARY KEY (id),
  CONSTRAINT role_permissions_permission_code_fkey FOREIGN KEY (permission_code) REFERENCES public.permissions(code)
);
CREATE TABLE public.sales_invoice_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  item_id uuid,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  discount_percent numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT sales_invoice_items_pkey PRIMARY KEY (id),
  CONSTRAINT sales_invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.sales_invoices(id),
  CONSTRAINT sales_invoice_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id)
);
CREATE TABLE public.sales_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  customer_id uuid,
  date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  status text NOT NULL DEFAULT 'borrador'::text CHECK (status = ANY (ARRAY['borrador'::text, 'enviada'::text, 'pagada'::text, 'vencida'::text, 'cancelada'::text])),
  subtotal numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 15.00,
  tax_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  payment_method text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  warehouse_id uuid,
  order_number text,
  terms text,
  salesperson_id uuid,
  delivery_requested boolean NOT NULL DEFAULT false,
  delivery_id uuid,
  credit_detail text,
  shipping_charge numeric NOT NULL DEFAULT 0,
  cancellation_reason_id uuid,
  cancellation_comments text,
  CONSTRAINT sales_invoices_pkey PRIMARY KEY (id),
  CONSTRAINT sales_invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT sales_invoices_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id),
  CONSTRAINT sales_invoices_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.deliveries(id),
  CONSTRAINT sales_invoices_cancellation_reason_id_fkey FOREIGN KEY (cancellation_reason_id) REFERENCES public.cancellation_reasons(id)
);
CREATE TABLE public.sales_quote_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL,
  item_id uuid,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  discount_percent numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT sales_quote_items_pkey PRIMARY KEY (id),
  CONSTRAINT sales_quote_items_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.sales_quotes(id),
  CONSTRAINT sales_quote_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id)
);
CREATE TABLE public.sales_quotes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quote_number text NOT NULL UNIQUE,
  customer_id uuid,
  warehouse_id uuid,
  date date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  status text NOT NULL DEFAULT '''borrador''::text'::text CHECK (status = ANY (ARRAY['borrador'::text, 'enviada'::text, 'aceptada'::text, 'rechazada'::text, 'vencida'::text, 'convertida'::text])),
  subtotal numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 15.00,
  tax_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  notes text,
  template_key text,
  converted_invoice_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  source text,
  CONSTRAINT sales_quotes_pkey PRIMARY KEY (id),
  CONSTRAINT sales_quotes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT sales_quotes_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id),
  CONSTRAINT sales_quotes_converted_invoice_id_fkey FOREIGN KEY (converted_invoice_id) REFERENCES public.sales_invoices(id)
);
CREATE TABLE public.stock_movements (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  item_id uuid,
  movement_type text NOT NULL,
  document_id text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  from_warehouse_id uuid,
  to_warehouse_id uuid,
  quantity integer,
  status text DEFAULT 'completed'::text,
  reason text,
  zoho_adjustment_id text,
  CONSTRAINT stock_movements_pkey PRIMARY KEY (id),
  CONSTRAINT stock_movements_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id),
  CONSTRAINT stock_movements_from_warehouse_id_fkey FOREIGN KEY (from_warehouse_id) REFERENCES public.warehouses(id),
  CONSTRAINT stock_movements_to_warehouse_id_fkey FOREIGN KEY (to_warehouse_id) REFERENCES public.warehouses(id)
);
CREATE TABLE public.stock_snapshots (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  warehouse_id uuid,
  item_id uuid,
  qty integer NOT NULL DEFAULT 0,
  source_ts timestamp with time zone NOT NULL,
  synced_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT stock_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT stock_snapshots_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id),
  CONSTRAINT stock_snapshots_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id)
);
CREATE TABLE public.sync_queue (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  zoho_item_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  attempts integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT sync_queue_pkey PRIMARY KEY (id)
);
CREATE TABLE public.transfer_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  zoho_transfer_order_id text,
  transfer_order_number text,
  date date,
  from_warehouse_id uuid,
  to_warehouse_id uuid,
  status text DEFAULT 'in_transit'::text,
  line_items jsonb,
  created_by_email text,
  created_at timestamp with time zone DEFAULT now(),
  received_at timestamp with time zone,
  notes text,
  CONSTRAINT transfer_orders_pkey PRIMARY KEY (id),
  CONSTRAINT transfer_orders_from_warehouse_id_fkey FOREIGN KEY (from_warehouse_id) REFERENCES public.warehouses(id),
  CONSTRAINT transfer_orders_to_warehouse_id_fkey FOREIGN KEY (to_warehouse_id) REFERENCES public.warehouses(id)
);
CREATE TABLE public.user_module_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module text NOT NULL CHECK (module ~ '^[a-z0-9-]+$'::text),
  can_access boolean NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_module_permissions_pkey PRIMARY KEY (id),
  CONSTRAINT user_module_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id)
);
CREATE TABLE public.user_profiles (
  id uuid NOT NULL,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'operator'::text CHECK (role = ANY (ARRAY['admin'::text, 'manager'::text, 'operator'::text, 'auditor'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_warehouse_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  can_view_stock boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_warehouse_permissions_pkey PRIMARY KEY (id),
  CONSTRAINT user_warehouse_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id),
  CONSTRAINT user_warehouse_permissions_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id)
);
CREATE TABLE public.user_warehouse_settings (
  user_id uuid NOT NULL,
  all_warehouses boolean NOT NULL DEFAULT false,
  can_view_stock boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_warehouse_settings_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_warehouse_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id)
);
CREATE TABLE public.warehouse_colors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  warehouse_code text NOT NULL UNIQUE,
  warehouse_name text NOT NULL,
  color text NOT NULL DEFAULT '#3B82F6'::text,
  text_color text NOT NULL DEFAULT '#FFFFFF'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT warehouse_colors_pkey PRIMARY KEY (id)
);
CREATE TABLE public.warehouses (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  zoho_warehouse_id text UNIQUE,
  CONSTRAINT warehouses_pkey PRIMARY KEY (id)
);
CREATE TABLE public.webhook_inbox (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  provider text NOT NULL,
  source_event_id text,
  idempotency_key text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature text,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone,
  status text NOT NULL DEFAULT 'pending'::text,
  error text,
  CONSTRAINT webhook_inbox_pkey PRIMARY KEY (id)
);

-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE auth.audit_log_entries (
  instance_id uuid,
  id uuid NOT NULL,
  payload json,
  created_at timestamp with time zone,
  ip_address character varying NOT NULL DEFAULT ''::character varying,
  CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id)
);
CREATE TABLE auth.custom_oauth_providers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  provider_type text NOT NULL CHECK (provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text])),
  identifier text NOT NULL UNIQUE CHECK (identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text),
  name text NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
  client_id text NOT NULL CHECK (char_length(client_id) >= 1 AND char_length(client_id) <= 512),
  client_secret text NOT NULL,
  acceptable_client_ids ARRAY NOT NULL DEFAULT '{}'::text[],
  scopes ARRAY NOT NULL DEFAULT '{}'::text[],
  pkce_enabled boolean NOT NULL DEFAULT true,
  attribute_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  authorization_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  email_optional boolean NOT NULL DEFAULT false,
  issuer text CHECK (issuer IS NULL OR char_length(issuer) >= 1 AND char_length(issuer) <= 2048),
  discovery_url text CHECK (discovery_url IS NULL OR char_length(discovery_url) <= 2048),
  skip_nonce_check boolean NOT NULL DEFAULT false,
  cached_discovery jsonb,
  discovery_cached_at timestamp with time zone,
  authorization_url text CHECK (authorization_url IS NULL OR authorization_url ~~ 'https://%'::text),
  token_url text CHECK (token_url IS NULL OR token_url ~~ 'https://%'::text),
  userinfo_url text CHECK (userinfo_url IS NULL OR userinfo_url ~~ 'https://%'::text),
  jwks_uri text CHECK (jwks_uri IS NULL OR jwks_uri ~~ 'https://%'::text),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT custom_oauth_providers_pkey PRIMARY KEY (id)
);
CREATE TABLE auth.flow_state (
  id uuid NOT NULL,
  user_id uuid,
  auth_code text,
  code_challenge_method USER-DEFINED,
  code_challenge text,
  provider_type text NOT NULL,
  provider_access_token text,
  provider_refresh_token text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  authentication_method text NOT NULL,
  auth_code_issued_at timestamp with time zone,
  invite_token text,
  referrer text,
  oauth_client_state_id uuid,
  linking_target_id uuid,
  email_optional boolean NOT NULL DEFAULT false,
  CONSTRAINT flow_state_pkey PRIMARY KEY (id)
);
CREATE TABLE auth.identities (
  provider_id text NOT NULL,
  user_id uuid NOT NULL,
  identity_data jsonb NOT NULL,
  provider text NOT NULL,
  last_sign_in_at timestamp with time zone,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  email text DEFAULT lower((identity_data ->> 'email'::text)),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT identities_pkey PRIMARY KEY (id),
  CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE auth.instances (
  id uuid NOT NULL,
  uuid uuid,
  raw_base_config text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  CONSTRAINT instances_pkey PRIMARY KEY (id)
);
CREATE TABLE auth.mfa_amr_claims (
  session_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  authentication_method text NOT NULL,
  id uuid NOT NULL,
  CONSTRAINT mfa_amr_claims_pkey PRIMARY KEY (id),
  CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id)
);
CREATE TABLE auth.mfa_challenges (
  id uuid NOT NULL,
  factor_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL,
  verified_at timestamp with time zone,
  ip_address inet NOT NULL,
  otp_code text,
  web_authn_session_data jsonb,
  CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id),
  CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id)
);
CREATE TABLE auth.mfa_factors (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  friendly_name text,
  factor_type USER-DEFINED NOT NULL,
  status USER-DEFINED NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  secret text,
  phone text,
  last_challenged_at timestamp with time zone UNIQUE,
  web_authn_credential jsonb,
  web_authn_aaguid uuid,
  last_webauthn_challenge_data jsonb,
  CONSTRAINT mfa_factors_pkey PRIMARY KEY (id),
  CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE auth.oauth_authorizations (
  id uuid NOT NULL,
  authorization_id text NOT NULL UNIQUE,
  client_id uuid NOT NULL,
  user_id uuid,
  redirect_uri text NOT NULL CHECK (char_length(redirect_uri) <= 2048),
  scope text NOT NULL CHECK (char_length(scope) <= 4096),
  state text CHECK (char_length(state) <= 4096),
  resource text CHECK (char_length(resource) <= 2048),
  code_challenge text CHECK (char_length(code_challenge) <= 128),
  code_challenge_method USER-DEFINED,
  response_type USER-DEFINED NOT NULL DEFAULT 'code'::auth.oauth_response_type,
  status USER-DEFINED NOT NULL DEFAULT 'pending'::auth.oauth_authorization_status,
  authorization_code text UNIQUE CHECK (char_length(authorization_code) <= 255),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '00:03:00'::interval),
  approved_at timestamp with time zone,
  nonce text CHECK (char_length(nonce) <= 255),
  CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id),
  CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id),
  CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE auth.oauth_client_states (
  id uuid NOT NULL,
  provider_type text NOT NULL,
  code_verifier text,
  created_at timestamp with time zone NOT NULL,
  CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id)
);
CREATE TABLE auth.oauth_clients (
  id uuid NOT NULL,
  client_secret_hash text,
  registration_type USER-DEFINED NOT NULL,
  redirect_uris text NOT NULL,
  grant_types text NOT NULL,
  client_name text CHECK (char_length(client_name) <= 1024),
  client_uri text CHECK (char_length(client_uri) <= 2048),
  logo_uri text CHECK (char_length(logo_uri) <= 2048),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  client_type USER-DEFINED NOT NULL DEFAULT 'confidential'::auth.oauth_client_type,
  token_endpoint_auth_method text NOT NULL CHECK (token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])),
  CONSTRAINT oauth_clients_pkey PRIMARY KEY (id)
);
CREATE TABLE auth.oauth_consents (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  client_id uuid NOT NULL,
  scopes text NOT NULL CHECK (char_length(scopes) <= 2048),
  granted_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked_at timestamp with time zone,
  CONSTRAINT oauth_consents_pkey PRIMARY KEY (id),
  CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id)
);
CREATE TABLE auth.one_time_tokens (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  token_type USER-DEFINED NOT NULL,
  token_hash text NOT NULL CHECK (char_length(token_hash) > 0),
  relates_to text NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE auth.refresh_tokens (
  instance_id uuid,
  id bigint NOT NULL DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass),
  token character varying UNIQUE,
  user_id character varying,
  revoked boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  parent character varying,
  session_id uuid,
  CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id)
);
CREATE TABLE auth.saml_providers (
  id uuid NOT NULL,
  sso_provider_id uuid NOT NULL,
  entity_id text NOT NULL UNIQUE CHECK (char_length(entity_id) > 0),
  metadata_xml text NOT NULL CHECK (char_length(metadata_xml) > 0),
  metadata_url text CHECK (metadata_url = NULL::text OR char_length(metadata_url) > 0),
  attribute_mapping jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  name_id_format text,
  CONSTRAINT saml_providers_pkey PRIMARY KEY (id),
  CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id)
);
CREATE TABLE auth.saml_relay_states (
  id uuid NOT NULL,
  sso_provider_id uuid NOT NULL,
  request_id text NOT NULL CHECK (char_length(request_id) > 0),
  for_email text,
  redirect_to text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  flow_state_id uuid,
  CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id),
  CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id),
  CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id)
);
CREATE TABLE auth.schema_migrations (
  version character varying NOT NULL,
  CONSTRAINT schema_migrations_pkey PRIMARY KEY (version)
);
CREATE TABLE auth.sessions (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  factor_id uuid,
  aal USER-DEFINED,
  not_after timestamp with time zone,
  refreshed_at timestamp without time zone,
  user_agent text,
  ip inet,
  tag text,
  oauth_client_id uuid,
  refresh_token_hmac_key text,
  refresh_token_counter bigint,
  scopes text CHECK (char_length(scopes) <= 4096),
  CONSTRAINT sessions_pkey PRIMARY KEY (id),
  CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id)
);
CREATE TABLE auth.sso_domains (
  id uuid NOT NULL,
  sso_provider_id uuid NOT NULL,
  domain text NOT NULL CHECK (char_length(domain) > 0),
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  CONSTRAINT sso_domains_pkey PRIMARY KEY (id),
  CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id)
);
CREATE TABLE auth.sso_providers (
  id uuid NOT NULL,
  resource_id text CHECK (resource_id = NULL::text OR char_length(resource_id) > 0),
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  disabled boolean,
  CONSTRAINT sso_providers_pkey PRIMARY KEY (id)
);
CREATE TABLE auth.users (
  instance_id uuid,
  id uuid NOT NULL,
  aud character varying,
  role character varying,
  email character varying,
  encrypted_password character varying,
  email_confirmed_at timestamp with time zone,
  invited_at timestamp with time zone,
  confirmation_token character varying,
  confirmation_sent_at timestamp with time zone,
  recovery_token character varying,
  recovery_sent_at timestamp with time zone,
  email_change_token_new character varying,
  email_change character varying,
  email_change_sent_at timestamp with time zone,
  last_sign_in_at timestamp with time zone,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  phone text DEFAULT NULL::character varying UNIQUE,
  phone_confirmed_at timestamp with time zone,
  phone_change text DEFAULT ''::character varying,
  phone_change_token character varying DEFAULT ''::character varying,
  phone_change_sent_at timestamp with time zone,
  confirmed_at timestamp with time zone DEFAULT LEAST(email_confirmed_at, phone_confirmed_at),
  email_change_token_current character varying DEFAULT ''::character varying,
  email_change_confirm_status smallint DEFAULT 0 CHECK (email_change_confirm_status >= 0 AND email_change_confirm_status <= 2),
  banned_until timestamp with time zone,
  reauthentication_token character varying DEFAULT ''::character varying,
  reauthentication_sent_at timestamp with time zone,
  is_sso_user boolean NOT NULL DEFAULT false,
  deleted_at timestamp with time zone,
  is_anonymous boolean NOT NULL DEFAULT false,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);

-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE storage.buckets (
  id text NOT NULL,
  name text NOT NULL,
  owner uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  public boolean DEFAULT false,
  avif_autodetection boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types ARRAY,
  owner_id text,
  type USER-DEFINED NOT NULL DEFAULT 'STANDARD'::storage.buckettype,
  CONSTRAINT buckets_pkey PRIMARY KEY (id)
);
CREATE TABLE storage.buckets_analytics (
  name text NOT NULL,
  type USER-DEFINED NOT NULL DEFAULT 'ANALYTICS'::storage.buckettype,
  format text NOT NULL DEFAULT 'ICEBERG'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  deleted_at timestamp with time zone,
  CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id)
);
CREATE TABLE storage.buckets_vectors (
  id text NOT NULL,
  type USER-DEFINED NOT NULL DEFAULT 'VECTOR'::storage.buckettype,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id)
);
CREATE TABLE storage.migrations (
  id integer NOT NULL,
  name character varying NOT NULL UNIQUE,
  hash character varying NOT NULL,
  executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT migrations_pkey PRIMARY KEY (id)
);
CREATE TABLE storage.objects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_accessed_at timestamp with time zone DEFAULT now(),
  metadata jsonb,
  path_tokens ARRAY DEFAULT string_to_array(name, '/'::text),
  version text,
  owner_id text,
  user_metadata jsonb,
  CONSTRAINT objects_pkey PRIMARY KEY (id),
  CONSTRAINT objects_bucketId_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id)
);
CREATE TABLE storage.s3_multipart_uploads (
  id text NOT NULL,
  in_progress_size bigint NOT NULL DEFAULT 0,
  upload_signature text NOT NULL,
  bucket_id text NOT NULL,
  key text NOT NULL,
  version text NOT NULL,
  owner_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_metadata jsonb,
  CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id),
  CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id)
);
CREATE TABLE storage.s3_multipart_uploads_parts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  upload_id text NOT NULL,
  size bigint NOT NULL DEFAULT 0,
  part_number integer NOT NULL,
  bucket_id text NOT NULL,
  key text NOT NULL,
  etag text NOT NULL,
  owner_id text,
  version text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id),
  CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id),
  CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id)
);
CREATE TABLE storage.vector_indexes (
  id text NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bucket_id text NOT NULL,
  data_type text NOT NULL,
  dimension integer NOT NULL,
  distance_metric text NOT NULL,
  metadata_configuration jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT vector_indexes_pkey PRIMARY KEY (id),
  CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id)
);


-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE realtime.messages (
  topic text NOT NULL,
  extension text NOT NULL,
  payload jsonb,
  event text,
  private boolean DEFAULT false,
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  inserted_at timestamp without time zone NOT NULL DEFAULT now(),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at)
);
CREATE TABLE realtime.messages_2026_02_26 (
  topic text NOT NULL,
  extension text NOT NULL,
  payload jsonb,
  event text,
  private boolean DEFAULT false,
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  inserted_at timestamp without time zone NOT NULL DEFAULT now(),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT messages_2026_02_26_pkey PRIMARY KEY (id, inserted_at)
);
CREATE TABLE realtime.messages_2026_02_27 (
  topic text NOT NULL,
  extension text NOT NULL,
  payload jsonb,
  event text,
  private boolean DEFAULT false,
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  inserted_at timestamp without time zone NOT NULL DEFAULT now(),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT messages_2026_02_27_pkey PRIMARY KEY (id, inserted_at)
);
CREATE TABLE realtime.messages_2026_02_28 (
  topic text NOT NULL,
  extension text NOT NULL,
  payload jsonb,
  event text,
  private boolean DEFAULT false,
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  inserted_at timestamp without time zone NOT NULL DEFAULT now(),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT messages_2026_02_28_pkey PRIMARY KEY (id, inserted_at)
);
CREATE TABLE realtime.messages_2026_03_01 (
  topic text NOT NULL,
  extension text NOT NULL,
  payload jsonb,
  event text,
  private boolean DEFAULT false,
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  inserted_at timestamp without time zone NOT NULL DEFAULT now(),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT messages_2026_03_01_pkey PRIMARY KEY (id, inserted_at)
);
CREATE TABLE realtime.messages_2026_03_02 (
  topic text NOT NULL,
  extension text NOT NULL,
  payload jsonb,
  event text,
  private boolean DEFAULT false,
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  inserted_at timestamp without time zone NOT NULL DEFAULT now(),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT messages_2026_03_02_pkey PRIMARY KEY (id, inserted_at)
);
CREATE TABLE realtime.messages_2026_03_03 (
  topic text NOT NULL,
  extension text NOT NULL,
  payload jsonb,
  event text,
  private boolean DEFAULT false,
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  inserted_at timestamp without time zone NOT NULL DEFAULT now(),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT messages_2026_03_03_pkey PRIMARY KEY (id, inserted_at)
);
CREATE TABLE realtime.messages_2026_03_04 (
  topic text NOT NULL,
  extension text NOT NULL,
  payload jsonb,
  event text,
  private boolean DEFAULT false,
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  inserted_at timestamp without time zone NOT NULL DEFAULT now(),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT messages_2026_03_04_pkey PRIMARY KEY (id, inserted_at)
);
CREATE TABLE realtime.schema_migrations (
  version bigint NOT NULL,
  inserted_at timestamp without time zone,
  CONSTRAINT schema_migrations_pkey PRIMARY KEY (version)
);
CREATE TABLE realtime.subscription (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  subscription_id uuid NOT NULL,
  entity regclass NOT NULL,
  filters ARRAY NOT NULL DEFAULT '{}'::realtime.user_defined_filter[],
  claims jsonb NOT NULL,
  claims_role regrole NOT NULL DEFAULT realtime.to_regrole((claims ->> 'role'::text)),
  created_at timestamp without time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  action_filter text DEFAULT '*'::text CHECK (action_filter = ANY (ARRAY['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text])),
  CONSTRAINT subscription_pkey PRIMARY KEY (id)
);


-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE vault.secrets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text,
  description text NOT NULL DEFAULT ''::text,
  secret text NOT NULL,
  key_id uuid,
  nonce bytea DEFAULT vault._crypto_aead_det_noncegen(),
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT secrets_pkey PRIMARY KEY (id)
);


Database Functions:
Name	Arguments	Return type	Security	

apply_inventory_event
p_idempotency_key text, p_source text, p_event_type text, p_item_id uuid, p_warehouse_id uuid, p_qty_delta integer DEFAULT NULL::integer, p_qty_after integer DEFAULT NULL::integer, p_payload jsonb DEFAULT '{}'::jsonb, p_external_ts timestamp with time zone DEFAULT NULL::timestamp with time zone

TABLE(applied boolean, event_id uuid, qty_before integer, qty_after integer)

Invoker



apply_inventory_transfer
p_idempotency_key text, p_source text, p_item_id uuid, p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_quantity integer, p_payload jsonb DEFAULT '{}'::jsonb, p_external_ts timestamp with time zone DEFAULT NULL::timestamp with time zone

TABLE(applied boolean, from_qty_after integer, to_qty_after integer)

Invoker



generate_invoice_number
–

text

Invoker



generate_quote_number
–

text

Invoker



get_user_role
user_id uuid

text

Definer



handle_new_user
–

trigger	
Definer



handle_updated_at
–

trigger	
Invoker



has_permission
user_id uuid, permission_code text

boolean

Definer



refresh_item_stock_total
p_item_id uuid DEFAULT NULL::uuid

void

Invoker



set_timestamp_updated_at
–

trigger	
Invoker



set_updated_at
–

trigger	
Invoker



set_user_module_permissions_updated_at
–

trigger	
Invoker



transfer_stock
p_item_id uuid, p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_quantity integer, p_reason text DEFAULT NULL::text

uuid

Invoker



update_updated_at_column
–

trigger	
Invoker

Database Triggers:
Name	Table	Function	Events	Orientation	Enabled	

trg_inventory_balance_set_updated_at
inventory_balance
set_updated_at
BEFORE UPDATE
ROW



trg_inventory_lots_set_updated_at
inventory_lots
set_updated_at
BEFORE UPDATE
ROW



trg_user_module_permissions_updated_at
user_module_permissions
set_user_module_permissions_updated_at
BEFORE UPDATE
ROW



trg_user_warehouse_permissions_updated_at
user_warehouse_permissions
set_timestamp_updated_at
BEFORE UPDATE
ROW



trg_user_warehouse_settings_updated_at
user_warehouse_settings
set_timestamp_updated_at
BEFORE UPDATE
ROW



update_items_updated_at
items
update_updated_at_column
BEFORE UPDATE
ROW



update_warehouses_updated_at
warehouses
update_updated_at_column
BEFORE UPDATE
ROW


Database Indexes:
Table	Columns	Name	
cancellation_reasons

id

cancellation_reasons_pkey


View definition

customers

id

customers_pkey


View definition

deliveries

id

deliveries_pkey


View definition

cancellation_reasons

active, sort_order

idx_cancellation_reasons_active


View definition

customers

email

idx_customers_email


View definition

customers

name

idx_customers_name


View definition

customers

phone

idx_customers_phone


View definition

customers

zoho_contact_id

idx_customers_zoho_contact_id_unique


View definition

deliveries

active

idx_deliveries_active


View definition

inventory_balance

updated_at

idx_inventory_balance_updated_at


View definition

inventory_balance

warehouse_id

idx_inventory_balance_warehouse_id


View definition

inventory_events

item_id, created_at

idx_inventory_events_item_created


View definition

inventory_events

warehouse_id, created_at

idx_inventory_events_warehouse_created


View definition

inventory_lots

item_id, warehouse_id, received_at

idx_inventory_lots_item_wh


View definition

inventory_lots

qty_remaining

idx_inventory_lots_qty_remaining


View definition

sales_invoice_items

invoice_id

idx_invoice_items_invoice


View definition

sales_invoices

customer_id

idx_invoices_customer


View definition

sales_invoices

date

idx_invoices_date


View definition

sales_invoices

salesperson_id

idx_invoices_salesperson


View definition

sales_invoices

status

idx_invoices_status


View definition

sales_invoices

warehouse_id

idx_invoices_warehouse


View definition

items

sku

idx_items_sku


View definition

sales_quote_items

quote_id

idx_quote_items_quote


View definition

sales_quotes

converted_invoice_id

idx_quotes_converted_invoice


View definition

sales_quotes

customer_id

idx_quotes_customer


View definition

sales_quotes

date

idx_quotes_date


View definition

sales_quotes

status

idx_quotes_status


View definition

item_serials

warehouse_id

idx_serials_warehouse_id


View definition

item_serials

zoho_item_id

idx_serials_zoho_item_id


View definition

stock_movements

from_warehouse_id

idx_stock_movements_from_warehouse


View definition

stock_movements

item_id

idx_stock_movements_item


View definition

stock_movements

to_warehouse_id

idx_stock_movements_to_warehouse


View definition

stock_snapshots

item_id

idx_stock_snapshots_item


View definition

stock_snapshots

synced_at

idx_stock_snapshots_synced_at


View definition

stock_snapshots

warehouse_id

idx_stock_snapshots_warehouse


View definition

sync_queue

status

idx_sync_queue_pending


View definition

sync_queue

zoho_item_id

idx_sync_queue_zoho_item


View definition

user_module_permissions

module

idx_user_module_permissions_module


View definition

user_module_permissions

user_id

idx_user_module_permissions_user


View definition

user_warehouse_permissions

user_id

idx_user_wh_permissions_user


View definition

user_warehouse_permissions

user_id, warehouse_id

idx_user_wh_permissions_user_wh


View definition

user_warehouse_permissions

warehouse_id

idx_user_wh_permissions_wh


View definition

warehouses

code

idx_warehouses_code


View definition

webhook_inbox

provider, source_event_id

idx_webhook_inbox_provider_event


View definition

webhook_inbox

status, received_at

idx_webhook_inbox_status_received


View definition

inventory_balance

item_id, warehouse_id

inventory_balance_pkey


View definition

inventory_events

idempotency_key

inventory_events_idempotency_key_key


View definition

inventory_events

id

inventory_events_pkey


View definition

inventory_lots

id

inventory_lots_pkey


View definition

item_serials

id

item_serials_pkey


View definition

item_serials

zoho_item_id, serial_number

item_serials_zoho_item_id_serial_number_key


View definition

item_serials

zoho_serial_id

item_serials_zoho_serial_id_key


View definition

items

id

items_pkey


View definition

items

zoho_item_id

items_zoho_item_id_key


View definition

permissions

code

permissions_code_key


View definition

permissions

id

permissions_pkey


View definition

role_permissions

id

role_permissions_pkey


View definition

role_permissions

role, permission_code

role_permissions_role_permission_code_key


View definition

sales_invoice_items

id

sales_invoice_items_pkey


View definition

sales_invoices

invoice_number

sales_invoices_invoice_number_key


View definition

sales_invoices

id

sales_invoices_pkey


View definition

sales_quote_items

id

sales_quote_items_pkey


View definition

sales_quotes

id

sales_quotes_pkey


View definition

sales_quotes

quote_number

sales_quotes_quote_number_key


View definition

stock_movements

id

stock_movements_pkey


View definition

stock_snapshots

id

stock_snapshots_pkey


View definition

stock_snapshots

warehouse_id, item_id, source_ts

stock_snapshots_unique_snapshot


View definition

stock_snapshots

warehouse_id, item_id, source_ts

stock_snapshots_warehouse_id_item_id_source_ts_key


View definition

sync_queue

id

sync_queue_pkey


View definition

transfer_orders

id

transfer_orders_pkey


View definition

user_module_permissions

id

user_module_permissions_pkey


View definition

user_module_permissions

user_id, module

user_module_permissions_user_id_module_key


View definition

user_profiles

id

user_profiles_pkey


View definition

user_warehouse_permissions

id

user_warehouse_permissions_pkey


View definition

user_warehouse_permissions

user_id, warehouse_id

user_warehouse_permissions_user_id_warehouse_id_key


View definition

user_warehouse_settings

user_id

user_warehouse_settings_pkey


View definition

warehouse_colors

id

warehouse_colors_pkey


View definition

warehouse_colors

warehouse_code

warehouse_colors_warehouse_code_key


View definition

warehouses

code

warehouses_code_key


View definition

warehouses

id

warehouses_pkey


View definition

warehouses

zoho_warehouse_id

warehouses_zoho_warehouse_id_key


View definition

webhook_inbox

id

webhook_inbox_pkey


View definition

RLS Policies
Manage Row Level Security policies for your tables
Docs

schema

public

Filter tables and policies
cancellation_reasons

Disable RLS

Create policy

Name	Command	Applied to	Actions

Allow authenticated full access on cancellation_reasons
ALL	
authenticated


Allow service_role full access on cancellation_reasons
ALL	
service_role

customers

Disable RLS

Create policy

Name	Command	Applied to	Actions

Allow authenticated full access on customers
ALL	
authenticated


Allow service_role full access on customers
ALL	
service_role

deliveries

Disable RLS

Create policy

Name	Command	Applied to	Actions

Allow authenticated full access on deliveries
ALL	
authenticated


Allow service_role full access on deliveries
ALL	
service_role

inventory_balance
RLS Disabled

Enable RLS

Create policy

This table can be accessed by anyone via the Data API as RLS is disabled.

No policies created yet

inventory_events
RLS Disabled

Enable RLS

Create policy

This table can be accessed by anyone via the Data API as RLS is disabled.

No policies created yet

inventory_lots
RLS Disabled

Enable RLS

Create policy

This table can be accessed by anyone via the Data API as RLS is disabled.

No policies created yet

item_serials
RLS Disabled

Enable RLS

Create policy

This table can be accessed by anyone via the Data API as RLS is disabled.

No policies created yet

items

Disable RLS

Create policy

Name	Command	Applied to	Actions

Allow all operations on items
ALL	
public

permissions

Disable RLS

Create policy

Name	Command	Applied to	Actions

Solo admins pueden modificar permisos
ALL	
public


Todos pueden ver permisos
SELECT	
public

role_permissions

Disable RLS

Create policy

Name	Command	Applied to	Actions

Solo admins pueden modificar role_permissions
ALL	
public


Todos pueden ver role_permissions
SELECT	
public

sales_invoice_items

Disable RLS

Create policy

Name	Command	Applied to	Actions

Allow authenticated full access on sales_invoice_items
ALL	
authenticated


Allow service_role full access on sales_invoice_items
ALL	
service_role

sales_invoices

Disable RLS

Create policy

Name	Command	Applied to	Actions

Allow authenticated full access on sales_invoices
ALL	
authenticated


Allow service_role full access on sales_invoices
ALL	
service_role

sales_quote_items

Disable RLS

Create policy

Name	Command	Applied to	Actions

Allow authenticated full access on sales_quote_items
ALL	
authenticated


Allow service_role full access on sales_quote_items
ALL	
service_role

sales_quotes

Disable RLS

Create policy

Name	Command	Applied to	Actions

Allow authenticated full access on sales_quotes
ALL	
authenticated


Allow service_role full access on sales_quotes
ALL	
service_role

stock_movements

Disable RLS

Create policy

Name	Command	Applied to	Actions

Allow all operations on stock_movements
ALL	
public

stock_snapshots

Disable RLS

Create policy

Name	Command	Applied to	Actions

Allow all operations on stock_snapshots
ALL	
public

sync_queue

Disable RLS

Create policy

Name	Command	Applied to	Actions

Allow authenticated users to read sync_queue
SELECT	
authenticated


Allow inserts from anon/authenticated
INSERT	
anon, authenticated


Allow service role full access
ALL	
service_role


Allow updates from anon/authenticated
UPDATE	
anon, authenticated

transfer_orders

Disable RLS

Create policy

Name	Command	Applied to	Actions

Enable all access for authenticated users
ALL	
public


transfer_orders_all
ALL	
anon, authenticated

user_module_permissions

Disable RLS

Create policy

Name	Command	Applied to	Actions

Admins manage module overrides
ALL	
authenticated


Users can read own module overrides
SELECT	
authenticated

user_profiles
RLS Disabled

Enable RLS

Create policy

This table can be accessed by anyone via the Data API as RLS is disabled.

Name	Command	Applied to	Actions

allow_admin_all_select
SELECT	
public


allow_admin_insert
INSERT	
public


allow_admin_update
UPDATE	
public


allow_own_profile_select
SELECT	
public

user_warehouse_permissions

Disable RLS

Create policy

Name	Command	Applied to	Actions

Admins manage warehouse permissions
ALL	
authenticated


Users can read own warehouse permissions
SELECT	
authenticated

user_warehouse_settings

Disable RLS

Create policy

Name	Command	Applied to	Actions

Admins manage warehouse settings
ALL	
authenticated


Users can read own warehouse settings
SELECT	
authenticated

warehouse_colors

Disable RLS

Create policy

Name	Command	Applied to	Actions

Solo admins pueden modificar colores de bodegas
ALL	
public


Todos pueden ver colores de bodegas
SELECT	
public

warehouses

Disable RLS

Create policy

Name	Command	Applied to	Actions

Allow all operations on warehouses
ALL	
public

webhook_inbox
RLS Disabled

Enable RLS

Create policy

This table can be accessed by anyone via the Data API as RLS is disabled.

No policies created yet

