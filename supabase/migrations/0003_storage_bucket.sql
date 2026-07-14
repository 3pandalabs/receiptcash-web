-- Receipts storage bucket. Private (not public) - files are only readable via
-- signed URLs or by the owning user through RLS, never a public URL.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Convention: objects are stored at "<user_id>/<filename>", so ownership is
-- derivable from the path itself without a separate lookup table.
create policy "receipts_bucket_select_own" on storage.objects
  for select using (
    bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "receipts_bucket_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- No update/delete policy for clients: uploaded receipt images are immutable
-- from the client's perspective once submitted.
