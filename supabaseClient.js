// Cliente de Supabase + helpers de datos.
(function () {
  const cfg = window.APP_CONFIG;
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  async function getSession() {
    const { data } = await sb.auth.getSession();
    return data.session;
  }

  async function getMyProfile() {
    const session = await getSession();
    if (!session) return null;
    const { data, error } = await sb
      .from("profiles")
      .select("*, parks:park_id(id,name,emergency_phone,address)")
      .eq("id", session.user.id)
      .maybeSingle();
    if (error) {
      console.error(error);
      return null;
    }
    return data;
  }

  async function signIn(email, password) {
    return sb.auth.signInWithPassword({ email, password });
  }

  async function signOut() {
    return sb.auth.signOut();
  }

  async function signUpGuard({ email, password, fullName, inviteCode }) {
    const { data: park, error: parkErr } = await sb.rpc("resolve_park_by_invite", {
      code: inviteCode.trim(),
    });
    if (parkErr) return { error: parkErr };
    if (!park || park.length === 0) {
      return { error: { message: "Código de parque inválido." } };
    }
    const { data: signData, error: signErr } = await sb.auth.signUp({ email, password });
    if (signErr) return { error: signErr };
    const userId = signData.user?.id;
    if (!userId) return { error: { message: "No se pudo crear el usuario (revisa tu correo para confirmar)." } };
    const { error: profErr } = await sb.from("profiles").insert({
      id: userId,
      full_name: fullName,
      role: "guardia",
      park_id: park[0].park_id,
    });
    if (profErr) return { error: profErr };
    return { data: signData };
  }

  async function uploadPhoto({ blob, context }) {
    const session = await getSession();
    const userId = session.user.id;
    const path = `${userId}/${Date.now()}.jpg`;
    const { error: upErr } = await sb.storage
      .from(cfg.STORAGE_BUCKET)
      .upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (upErr) return { error: upErr };
    return { path };
  }

  async function insertPhotoRow({ parkId, guardId, storagePath, phash, context }) {
    return sb
      .from("photos")
      .insert({ park_id: parkId, guard_id: guardId, storage_path: storagePath, phash, context })
      .select()
      .single();
  }

  async function recentPhotoHashes(guardId, limit = 12) {
    const { data, error } = await sb
      .from("photos")
      .select("phash")
      .eq("guard_id", guardId)
      .order("taken_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data || []).map((r) => r.phash).filter(Boolean);
  }

  async function signedUrl(path, expiresIn = 3600) {
    const { data, error } = await sb.storage.from(cfg.STORAGE_BUCKET).createSignedUrl(path, expiresIn);
    if (error) return null;
    return data.signedUrl;
  }

  window.SB = {
    sb,
    getSession,
    getMyProfile,
    signIn,
    signOut,
    signUpGuard,
    uploadPhoto,
    insertPhotoRow,
    recentPhotoHashes,
    signedUrl,
  };
})();
