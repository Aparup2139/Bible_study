-- At most one live study room at a time (Study Chat is a singleton room).
-- Closes the create/create race in RoomsService.findOrCreateLiveRoom.
set search_path = public;
create unique index if not exists study_rooms_one_live_idx
  on public.study_rooms (status) where (status = 'live');
