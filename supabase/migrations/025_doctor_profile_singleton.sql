-- doctor_profiles was gated by `auth.uid() = user_id`, but this app has no
-- real Supabase Auth session (login is a local PIN gate only) so auth.uid()
-- is always null and every write silently fell back to browser-local
-- storage, meaning the profile never actually synced across devices.
--
-- This app is single-clinic/single-doctor, so treat doctor_profiles as a
-- singleton table with the same permissive "allow all" policy already used
-- by every other table (patients, invoices, etc.) in this anon-key-driven app.

DROP POLICY IF EXISTS "Users manage own profile" ON doctor_profiles;

CREATE POLICY "Allow all on doctor_profiles" ON doctor_profiles FOR ALL USING (true);
