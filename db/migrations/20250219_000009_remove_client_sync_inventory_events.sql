-- Remove unused client_sync inventory events
DELETE FROM public.player_inventory_events
WHERE reason = 'client_sync';
