import { createClient } from '@supabase/supabase-js';
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BME_EMAIL, BME_PASSWORD, BME_NAME, BME_STAFF_ID } =
  process.env;
if (
  !SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY ||
  !BME_EMAIL ||
  !BME_PASSWORD ||
  BME_PASSWORD.length < 10 ||
  !BME_NAME ||
  !BME_STAFF_ID
)
  throw new Error('Complete .env.admin with a password of at least 10 characters');
const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: existing, error: checkError } = await client
  .from('profiles')
  .select('id')
  .eq('role', 'bme')
  .eq('active', true)
  .limit(1);
if (checkError) throw checkError;
if (existing.length)
  throw new Error('An active BME already exists. Use account management in the app.');
const { data, error } = await client.auth.admin.createUser({
  email: BME_EMAIL,
  password: BME_PASSWORD,
  email_confirm: true,
});
if (error) throw error;
const { error: profileError } = await client
  .from('profiles')
  .insert({
    id: data.user.id,
    email: BME_EMAIL.toLowerCase(),
    name: BME_NAME,
    staff_id: BME_STAFF_ID,
    role: 'bme',
    department: 'ฝ่ายวิศวกรรมชีวการแพทย์',
  });
if (profileError) {
  await client.auth.admin.deleteUser(data.user.id);
  throw profileError;
}
console.log('Created first BME account. Sign in with the email configured in .env.admin.');
