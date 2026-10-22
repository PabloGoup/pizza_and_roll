-- Apply and commit before the following migration uses this enum value.
alter type public.app_role add value if not exists 'repartidor';
