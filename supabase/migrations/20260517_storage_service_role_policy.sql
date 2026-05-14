-- Service-role RLS policy on storage.objects for the `storyboards` bucket.
-- Without this, uploadBuffer() in app/lib/storage.ts is blocked by RLS when
-- writing jobs/<id>/scenes/.../composition.html and other generated assets,
-- even though the server uses the service-role key.

drop policy if exists "service_role full access on storyboards" on storage.objects;

create policy "service_role full access on storyboards"
  on storage.objects for all to service_role
  using (bucket_id = 'storyboards')
  with check (bucket_id = 'storyboards');
