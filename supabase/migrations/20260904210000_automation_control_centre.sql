-- Autopilot control centre extensions

alter table public.automation_settings
  add column if not exists ai_freedom_level text not null default 'balanced'
    check (ai_freedom_level in ('conservative', 'balanced', 'aggressive'));

alter table public.automation_settings
  add column if not exists latest_decision jsonb not null default '{}'::jsonb;

alter table public.automation_settings
  add column if not exists next_planned_action text;

comment on column public.automation_settings.ai_freedom_level is
  'How freely AI may adapt strategy within guardrails: conservative|balanced|aggressive';
comment on column public.automation_settings.latest_decision is
  'Human-readable latest AI decision {decision, why, action, confidence}';
comment on column public.automation_settings.next_planned_action is
  'Plain-language description of what AI plans to do next';

-- Realtime for control centre (safe if already added)
do $$
begin
  begin
    alter publication supabase_realtime add table public.automation_settings;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.automation_activity;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.automation_tasks;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.content;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
end $$;
