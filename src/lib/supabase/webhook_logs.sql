create table if not exists webhook_logs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  method text,
  url text,
  headers jsonb,
  payload jsonb,
  status text,
  error_message text
);

alter table webhook_logs enable row level security;

create policy "Enable insert for authenticated users only" on webhook_logs for insert with check (true);
create policy "Enable read for authenticated users only" on webhook_logs for select using (true);
