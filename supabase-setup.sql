-- Français A1: einmal im Supabase SQL Editor ausführen ("Run"). Berührt die Cockpit-Tabelle nicht.
create table if not exists public.fr_progress (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id         text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at bigint not null default 0,
  synced_at  timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists fr_progress_user_synced on public.fr_progress (user_id, synced_at);

create or replace function public.fr_progress_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.synced_at := now();
  return new;
end;
$$;
drop trigger if exists fr_progress_touch on public.fr_progress;
create trigger fr_progress_touch before insert or update on public.fr_progress
  for each row execute function public.fr_progress_touch();

alter table public.fr_progress enable row level security;
drop policy if exists "fr_progress_own" on public.fr_progress;
create policy "fr_progress_own" on public.fr_progress for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.fr_progress to authenticated;
