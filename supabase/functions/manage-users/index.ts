import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
const headers = {
  ...corsHeaders,
  'Content-Type': 'application/json',
};
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers });
  if (req.method !== 'POST') return reply(405, { error: 'POST required' });
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return reply(401, { error: 'กรุณาเข้าสู่ระบบ' });
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    // Gateway verification is off for publishable-key compatibility; validate the JWT here.
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return reply(401, { error: 'Session หมดอายุ' });
    const { data: actor } = await admin
      .from('profiles')
      .select('role,active')
      .eq('id', auth.user.id)
      .single();
    if (actor?.role !== 'bme' || !actor.active)
      return reply(403, { error: 'เฉพาะ BME ที่ใช้งานอยู่' });
    const body = await req.json();
    if (!['create', 'update', 'password'].includes(body.action))
      return reply(400, { error: 'Invalid action' });
    if (body.action === 'password') {
      if (typeof body.password !== 'string' || body.password.length < 10)
        return reply(400, { error: 'รหัสผ่านอย่างน้อย 10 ตัวอักษร' });
      const { error } = await admin.auth.admin.updateUserById(body.id, { password: body.password });
      if (error) throw error;
      return reply(200, { ok: true });
    }
    if (
      !['nurse', 'bme', 'technician'].includes(body.role) ||
      !body.name?.trim() ||
      !body.staff_id?.trim()
    )
      return reply(400, { error: 'ตรวจสอบชื่อ รหัสพนักงาน และบทบาท' });
    let targetId = body.id;
    let email = body.email?.trim().toLowerCase();
    if (body.action === 'create') {
      if (!email || typeof body.password !== 'string' || body.password.length < 10)
        return reply(400, { error: 'กรอกอีเมลและรหัสผ่านอย่างน้อย 10 ตัวอักษร' });
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
      });
      if (error) throw error;
      targetId = data.user.id;
    } else {
      const { data, error } = await admin
        .from('profiles')
        .select('email')
        .eq('id', targetId)
        .single();
      if (error) throw error;
      email = data.email;
    }
    const { error } = await admin.rpc('admin_save_profile', {
      p_actor: auth.user.id,
      p_id: targetId,
      p_email: email,
      p_staff_id: body.staff_id.trim(),
      p_name: body.name.trim(),
      p_role: body.role,
      p_active: body.active !== false,
      p_department: body.department ?? '',
    });
    if (error) {
      if (body.action === 'create') await admin.auth.admin.deleteUser(targetId);
      throw error;
    }
    return reply(200, { id: targetId });
  } catch (error) {
    return reply(400, {
      error:
        error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : 'ดำเนินการไม่สำเร็จ',
    });
  }
});
