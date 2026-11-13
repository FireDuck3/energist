begin;
alter table public.pilot_spots
  drop constraint pilot_spots_lat_check,
  drop constraint pilot_spots_lng_check,
  add constraint pilot_spots_lat_check check (lat between -90 and 90),
  add constraint pilot_spots_lng_check check (lng between -180 and 180);
commit;
