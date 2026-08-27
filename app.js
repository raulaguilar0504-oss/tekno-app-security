// Controlador principal de la app (sin framework, vanilla JS).
(function () {
  const root = document.getElementById("app");
  const V = window.Views;
  const state = {
    profile: null,
    view: "home",
    params: {},
    authMode: "login",
    checkinMode: "qr",
    stopScan: null,
    geo: null,
  };

  function toast(msg, kind = "ok") {
    const el = document.createElement("div");
    el.className = kind === "ok" ? "ok-banner" : "error-banner";
    el.style.cssText = "position:fixed;top:10px;left:10px;right:10px;z-index:999;max-width:520px;margin:0 auto;";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function cleanupCamera() {
    if (state.stopScan) {
      state.stopScan();
      state.stopScan = null;
    }
    window.Camera.stop();
  }

  async function goto(view, params = {}) {
    cleanupCamera();
    state.view = view;
    state.params = params;
    await render();
  }

  // ---------------- AUTH ----------------
  async function boot() {
    const session = await window.SB.getSession();
    if (!session) {
      state.profile = null;
      state.view = "auth";
      render();
      return;
    }
    state.profile = await window.SB.getMyProfile();
    if (!state.profile) {
      await window.SB.signOut();
      state.view = "auth";
      render();
      return;
    }
    if (!state.profile.active) {
      root.innerHTML = `<div class="center-screen"><div class="card"><h2>Cuenta desactivada</h2><p>Contacta a tu jefe de seguridad.</p><button class="btn secondary" data-action="logout">Salir</button></div></div>`;
      return;
    }
    state.view = "home";
    render();
    if (state.profile.role === "jefe_seguridad") subscribeGlobalEmergencies();
  }

  let emergencyChannel = null;
  function subscribeGlobalEmergencies() {
    if (emergencyChannel) return;
    emergencyChannel = window.SB.sb
      .channel("emergencias-global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "emergency_alerts" },
        (payload) => {
          toast("🚨 Nueva alerta de emergencia registrada — revisa la bitácora.", "error");
        }
      )
      .subscribe();
  }

  window.SB.sb.auth.onAuthStateChange((_event, _session) => {
    // manejado explícitamente por login/signup/logout para evitar loops
  });

  // ---------------- RENDER ----------------
  async function render() {
    if (!state.profile) {
      root.innerHTML = V.loginView(state.authMode);
      return;
    }
    const p = state.profile;
    switch (state.view) {
      case "home":
        if (p.role === "jefe_seguridad") {
          const { data: parks } = await window.SB.sb.from("parks").select("*").order("created_at");
          root.innerHTML = V.jefeHome(p, parks || []);
        } else {
          root.innerHTML = V.guardHome(p);
          loadGuardSummary();
        }
        break;
      case "parque": {
        const parkId = state.params.id;
        const { data: park } = await window.SB.sb.from("parks").select("*").eq("id", parkId).single();
        const { data: aps } = await window.SB.sb.from("access_points").select("*").eq("park_id", parkId).order("created_at");
        const { data: guards } = await window.SB.sb.from("profiles").select("*").eq("park_id", parkId).eq("role", "guardia");
        root.innerHTML = V.parkDetail(park, aps || [], guards || []);
        break;
      }
      case "checkin":
      case "rondin": {
        const title = state.view === "checkin" ? (state.params.type === "salida" ? "Registrar salida" : "Registrar entrada") : "Rondín";
        root.innerHTML = V.cameraScreen({ title, mode: state.checkinMode, allowQr: true });
        await setupCameraScreen();
        break;
      }
      case "foto": {
        root.innerHTML = V.cameraScreen({ title: "Tomar foto", mode: "manual", allowQr: false });
        await setupCameraScreen();
        break;
      }
      case "qrs": {
        const { data: parks } = await window.SB.sb.from("parks").select("*").order("name");
        const withAps = await Promise.all(
          (parks || []).map(async (pk) => {
            const { data: aps } = await window.SB.sb.from("access_points").select("*").eq("park_id", pk.id).order("created_at");
            return { ...pk, access_points: aps || [] };
          })
        );
        root.innerHTML = V.qrsAllView(withAps);
        break;
      }
      case "emergencia":
        root.innerHTML = V.emergenciaView(p.parks, state.params.sent);
        break;
      case "incidente":
        root.innerHTML = V.incidenteView();
        break;
      case "bitacora":
        await renderBitacora();
        break;
      case "galeria":
        await renderGaleria();
        break;
      case "mensajes":
        await renderChat();
        break;
      case "perfil":
        root.innerHTML = V.perfilView(p);
        break;
      default:
        root.innerHTML = V.guardHome(p);
    }
  }

  async function loadGuardSummary() {
    const el = document.getElementById("home-summary");
    if (!el) return;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const p = state.profile;
    const [{ data: entries }, { data: rounds }] = await Promise.all([
      window.SB.sb.from("entries_exits").select("type,created_at").eq("guard_id", p.id).gte("created_at", startOfDay.toISOString()),
      window.SB.sb.from("rounds").select("created_at").eq("guard_id", p.id).gte("created_at", startOfDay.toISOString()),
    ]);
    const entradas = (entries || []).filter((e) => e.type === "entrada").length;
    const salidas = (entries || []).filter((e) => e.type === "salida").length;
    el.innerHTML = `Entradas hoy: <b>${entradas}</b> · Salidas hoy: <b>${salidas}</b> · Rondines hoy: <b>${(rounds || []).length}</b>`;

    const statusEl = document.getElementById("rondin-status");
    if (statusEl) {
      const { data: lastRound } = await window.SB.sb
        .from("rounds")
        .select("created_at")
        .eq("guard_id", p.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastRound) {
        statusEl.innerHTML = `<span style="color:var(--warn)">⏰ Aún no registras ningún rondín — hazlo cuando empieces tu turno.</span>`;
      } else {
        const minsAgo = Math.round((Date.now() - new Date(lastRound.created_at).getTime()) / 60000);
        if (minsAgo >= 60) {
          statusEl.innerHTML = `<span style="color:var(--bad)">🔴 Han pasado ${minsAgo} min desde tu último rondín — te toca hacer uno ahora.</span>`;
        } else {
          statusEl.innerHTML = `<span style="color:var(--good)">✅ Último rondín hace ${minsAgo} min. Próximo en ${60 - minsAgo} min.</span>`;
        }
      }
    }

    const movEl = document.getElementById("ultimos-movimientos");
    if (movEl) {
      const [{ data: e2 }, { data: r2 }, { data: i2 }] = await Promise.all([
        window.SB.sb.from("entries_exits").select("*").eq("guard_id", p.id).order("created_at", { ascending: false }).limit(5),
        window.SB.sb.from("rounds").select("*").eq("guard_id", p.id).order("created_at", { ascending: false }).limit(5),
        window.SB.sb.from("incidents").select("*").eq("guard_id", p.id).order("created_at", { ascending: false }).limit(5),
      ]);
      const events = []
        .concat(
          (e2 || []).map((e) => ({ kind: e.type, title: e.type === "entrada" ? "Entrada registrada" : "Salida registrada", method: e.method, created_at: e.created_at })),
          (r2 || []).map((r) => ({ kind: "rondin", title: "Rondín realizado", method: r.method, created_at: r.created_at })),
          (i2 || []).map((i) => ({ kind: "incidente", title: "Anomalía: " + i.description, created_at: i.created_at }))
        )
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5);
      movEl.innerHTML = events.length ? events.map(V.feedItem).join("") : `<div class="empty">Sin movimientos todavía.</div>`;
    }
  }

  // ---------------- BITÁCORA ----------------
  let bitacoraCache = [];
  async function renderBitacora() {
    const p = state.profile;
    const isJefe = p.role === "jefe_seguridad";
    const scope = isJefe ? {} : { guard_id: p.id };

    const [{ data: entries }, { data: rounds }, { data: incidents }, { data: alerts }] = await Promise.all([
      applyScope(window.SB.sb.from("entries_exits").select("*, profiles:guard_id(full_name), parks:park_id(name)"), scope),
      applyScope(window.SB.sb.from("rounds").select("*, profiles:guard_id(full_name), parks:park_id(name)"), scope),
      applyScope(window.SB.sb.from("incidents").select("*, profiles:guard_id(full_name), parks:park_id(name)"), scope),
      applyScope(window.SB.sb.from("emergency_alerts").select("*, profiles:guard_id(full_name), parks:park_id(name)"), scope),
    ]);

    const events = []
      .concat(
        (entries || []).map((e) => ({
          kind: e.type, title: e.type === "entrada" ? "Entrada registrada" : "Salida registrada",
          method: e.method, created_at: e.created_at, guardName: e.profiles?.full_name, parkName: e.parks?.name,
        })),
        (rounds || []).map((r) => ({
          kind: "rondin", title: "Rondín realizado", method: r.method, created_at: r.created_at,
          guardName: r.profiles?.full_name, parkName: r.parks?.name,
        })),
        (incidents || []).map((i) => ({
          kind: "incidente", title: "Anomalía: " + i.description, created_at: i.created_at,
          guardName: i.profiles?.full_name, parkName: i.parks?.name,
        })),
        (alerts || []).map((a) => ({
          kind: "emergencia", title: "🚨 Alerta de emergencia" + (a.note ? ": " + a.note : ""),
          created_at: a.created_at, guardName: a.profiles?.full_name, parkName: a.parks?.name,
        }))
      )
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    bitacoraCache = events;
    renderBitacoraFiltered();
  }

  function renderBitacoraFiltered() {
    const p = state.profile;
    const filter = state.params.bitFilter || "todo";
    const groups = {
      todo: () => true,
      entradas_salidas: (ev) => ev.kind === "entrada" || ev.kind === "salida",
      rondines: (ev) => ev.kind === "rondin",
      incidentes: (ev) => ev.kind === "incidente",
      emergencias: (ev) => ev.kind === "emergencia",
    };
    const filtered = bitacoraCache.filter(groups[filter] || groups.todo);
    root.innerHTML = V.bitacoraView(filtered, filter, p.role);
  }

  function applyScope(query, scope) {
    let q = query;
    Object.entries(scope).forEach(([k, v]) => (q = q.eq(k, v)));
    return q.order("created_at", { ascending: false }).limit(200);
  }

  // ---------------- GALERÍA ----------------
  async function renderGaleria() {
    const p = state.profile;
    let q = window.SB.sb.from("photos").select("*").order("taken_at", { ascending: false }).limit(60);
    if (p.role !== "jefe_seguridad") q = q.eq("guard_id", p.id);
    const { data: photos } = await q;
    const withUrls = await Promise.all(
      (photos || []).map(async (ph) => ({ ...ph, url: await window.SB.signedUrl(ph.storage_path) }))
    );
    root.innerHTML = V.galeriaView(withUrls.filter((p) => p.url), p.role);
  }

  // ---------------- CHAT ----------------
  let chatChannel = null;
  async function renderChat() {
    const p = state.profile;
    let parkId = p.role === "jefe_seguridad" ? state.params.parkId : p.park_id;

    if (p.role === "jefe_seguridad") {
      const { data: parks } = await window.SB.sb.from("parks").select("id,name").order("name");
      if (!parkId && parks && parks.length) parkId = parks[0].id;
      const selector = `
        <div class="card">
          <label>Ver chat del parque</label>
          <select id="chat-park-select">
            ${(parks || []).map((pk) => `<option value="${pk.id}" ${pk.id === parkId ? "selected" : ""}>${V.esc(pk.name)}</option>`).join("")}
          </select>
        </div>`;
      state.params.parkId = parkId;
      await renderChatBody(parkId, selector);
      document.getElementById("chat-park-select")?.addEventListener("change", (e) => {
        state.params.parkId = e.target.value;
        renderChat();
      });
      return;
    }
    await renderChatBody(parkId, "");
  }

  async function renderChatBody(parkId, selectorHtml) {
    const p = state.profile;
    if (!parkId) {
      root.innerHTML = `${V.topbar("Guardias — chat")}<main>${selectorHtml}<div class="empty">No hay parque seleccionado.</div></main>${V.bottomNav("mensajes", p.role)}`;
      return;
    }
    const { data: msgs } = await window.SB.sb
      .from("guard_messages")
      .select("*, profiles:sender_id(full_name)")
      .eq("park_id", parkId)
      .order("created_at", { ascending: true })
      .limit(200);
    const withNames = (msgs || []).map((m) => ({ ...m, senderName: m.profiles?.full_name }));
    root.innerHTML = V.chatView(withNames, p.id, selectorHtml, p.role);
    const scrollEl = document.getElementById("chat-scroll");
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;

    if (chatChannel) window.SB.sb.removeChannel(chatChannel);
    chatChannel = window.SB.sb
      .channel("room:" + parkId)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "guard_messages", filter: `park_id=eq.${parkId}` },
        async (payload) => {
          if (state.view !== "mensajes") return;
          const row = payload.new;
          const el = document.getElementById("chat-scroll");
          if (!el) return;
          el.insertAdjacentHTML(
            "beforeend",
            `<div class="msg ${row.sender_id === p.id ? "mine" : ""}"><div class="who">${V.fmtDT(row.created_at)}</div>${V.esc(row.message)}</div>`
          );
          el.scrollTop = el.scrollHeight;
        }
      )
      .subscribe();
  }

  // ---------------- CÁMARA / CHECK-IN / RONDÍN ----------------
  function cameraErrorMessage(e) {
    const name = e && (e.code || e.name);
    if (name === "NotAllowedError" || name === "DENIED" || name === "PermissionDeniedError") {
      return "Bloqueaste el acceso a la cámara para esta página. Ábrela en el ícono 🔒 junto a la dirección del navegador y permite el acceso a la Cámara, luego toca \"Reintentar\".";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "No se encontró ninguna cámara en este dispositivo.";
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return "La cámara está siendo usada por otra app. Cierra otras apps/pestañas que la estén usando e intenta de nuevo.";
    }
    if (name === "UNSUPPORTED") {
      return e.message;
    }
    return "No se pudo acceder a la cámara" + (e && e.message ? `: ${e.message}` : ".") + " Verifica los permisos de tu navegador e intenta de nuevo.";
  }

  async function setupCameraScreen() {
    const video = document.getElementById("cam-video");
    if (!video) return;
    const statusEl = document.getElementById("camera-status");
    if (statusEl) statusEl.innerHTML = "";
    try {
      await window.Camera.start(video);
    } catch (e) {
      if (statusEl) {
        statusEl.innerHTML = `<div class="error-banner">${cameraErrorMessage(e)}</div><button class="btn secondary" id="btn-retry-camera" style="margin-bottom:10px">🔄 Reintentar</button>`;
        document.getElementById("btn-retry-camera")?.addEventListener("click", () => setupCameraScreen());
      }
      return;
    }
    state.geo = await window.Camera.getGeolocation();

    if (state.checkinMode === "qr") {
      state.stopScan = window.QR.startScan(video, onQrDetected);
    } else {
      document.getElementById("btn-capture")?.addEventListener("click", onManualCapture);
    }
  }

  async function onQrDetected(text) {
    if (state.stopScan) {
      state.stopScan();
      state.stopScan = null;
    }
    const prefix = window.APP_CONFIG.QR_PREFIX;
    if (!text.startsWith(prefix)) {
      toast("Ese código QR no es válido para esta app.", "error");
      state.stopScan = window.QR.startScan(document.getElementById("cam-video"), onQrDetected);
      return;
    }
    const token = text.slice(prefix.length);
    const { data: ap, error } = await window.SB.sb.from("access_points").select("*").eq("qr_token", token).maybeSingle();
    if (error || !ap) {
      toast("Este código no pertenece a tu parque o no existe.", "error");
      state.stopScan = window.QR.startScan(document.getElementById("cam-video"), onQrDetected);
      return;
    }
    await finalizeCheck({ method: "qr", accessPointId: ap.id, photoId: null });
  }

  async function onManualCapture() {
    const video = document.getElementById("cam-video");
    const p = state.profile;
    const now = new Date();
    const lines = [
      p.full_name,
      now.toLocaleString("es-MX"),
      p.parks?.name || "",
      state.geo ? `${state.geo.lat.toFixed(5)}, ${state.geo.lng.toFixed(5)}` : "Sin ubicación",
    ];
    const canvas = window.Camera.captureFrame(video, lines);
    const hash = window.PhotoHash.aHashFromCanvas(canvas);
    const isFreePhoto = state.view === "foto";

    if (!isFreePhoto) {
      const recent = await window.SB.recentPhotoHashes(p.id, 15);
      const tooSimilar = recent.some((h) => window.PhotoHash.hammingDistanceHex(hash, h) < 6);
      if (tooSimilar) {
        document.getElementById("capture-result").innerHTML =
          `<div class="error-banner">Esta foto se parece demasiado a una anterior. Debes tomar una foto nueva en este momento (no repitas la misma imagen).</div>`;
        return;
      }
    }

    document.getElementById("btn-capture").disabled = true;
    document.getElementById("capture-result").innerHTML = `<div class="small">Subiendo foto…</div>`;

    const context = isFreePhoto
      ? "otro"
      : state.view === "rondin"
      ? "rondin"
      : state.params.type === "salida"
      ? "salida"
      : "entrada";
    const blob = await window.Camera.canvasToBlob(canvas);
    const { path, error: upErr } = await window.SB.uploadPhoto({ blob, context });
    if (upErr) {
      document.getElementById("capture-result").innerHTML = `<div class="error-banner">Error al subir la foto: ${upErr.message}</div>`;
      document.getElementById("btn-capture").disabled = false;
      return;
    }
    const { data: photoRow, error: rowErr } = await window.SB.insertPhotoRow({
      parkId: p.park_id, guardId: p.id, storagePath: path, phash: hash, context,
    });
    if (rowErr) {
      document.getElementById("capture-result").innerHTML = `<div class="error-banner">${rowErr.message}</div>`;
      return;
    }
    if (isFreePhoto) {
      toast("Foto guardada en la galería ✅");
      goto("galeria");
      return;
    }
    await finalizeCheck({ method: "manual", accessPointId: null, photoId: photoRow.id });
  }

  async function finalizeCheck({ method, accessPointId, photoId }) {
    const p = state.profile;
    const geo = state.geo || {};
    if (state.view === "rondin") {
      const { error } = await window.SB.sb.from("rounds").insert({
        park_id: p.park_id, guard_id: p.id, method, access_point_id: accessPointId, photo_id: photoId,
        lat: geo.lat, lng: geo.lng,
      });
      if (error) return toast(error.message, "error");
      toast("Rondín registrado ✅");
    } else {
      const { error } = await window.SB.sb.from("entries_exits").insert({
        park_id: p.park_id, guard_id: p.id, type: state.params.type, method,
        access_point_id: accessPointId, photo_id: photoId, lat: geo.lat, lng: geo.lng,
      });
      if (error) return toast(error.message, "error");
      toast(state.params.type === "salida" ? "Salida registrada ✅" : "Entrada registrada ✅");
    }
    goto("home");
  }

  // ---------------- EVENTOS (delegación) ----------------
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const action = t.dataset.action;
    if (action === "nav") {
      state.checkinMode = t.dataset.view === "foto" ? "manual" : "qr";
      await goto(t.dataset.view, { id: t.dataset.id, type: t.dataset.type });
    } else if (action === "logout") {
      cleanupCamera();
      await window.SB.signOut();
      state.profile = null;
      state.authMode = "login";
      goto("auth");
    } else if (action === "switch-auth") {
      state.authMode = t.dataset.mode;
      render();
    } else if (action === "set-mode") {
      state.checkinMode = t.dataset.mode;
      cleanupCamera();
      await render();
    } else if (action === "show-qr") {
      openQrModal(t.dataset.token, t.dataset.name);
    } else if (action === "download-qr") {
      const url = await window.QR.dataUrlFor(window.APP_CONFIG.QR_PREFIX + t.dataset.token);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qr-${t.dataset.name.replace(/\s+/g, "-").toLowerCase()}.png`;
      a.click();
    } else if (action === "close-modal") {
      document.getElementById("qr-modal-overlay")?.remove();
    } else if (action === "bitacora-filter") {
      state.params.bitFilter = t.dataset.filter;
      renderBitacoraFiltered();
    } else if (action === "toggle-guard") {
      const newActive = t.dataset.active !== "1";
      const { error } = await window.SB.sb.from("profiles").update({ active: newActive }).eq("id", t.dataset.id);
      if (error) return toast(error.message, "error");
      toast(newActive ? "Guardia activado ✅" : "Guardia desactivado");
      render();
    } else if (t.id === "btn-send-emergency") {
      const geo = await window.Camera.getGeolocation();
      const p = state.profile;
      const { error } = await window.SB.sb.from("emergency_alerts").insert({
        park_id: p.park_id, guard_id: p.id, lat: geo?.lat, lng: geo?.lng,
      });
      if (error) return toast(error.message, "error");
      goto("emergencia", { sent: true });
    }
  });

  document.addEventListener("submit", async (e) => {
    const form = e.target.closest("[data-form]");
    if (!form) return;
    e.preventDefault();
    const kind = form.dataset.form;
    const fd = Object.fromEntries(new FormData(form).entries());

    if (kind === "login") {
      const { error } = await window.SB.signIn(fd.email, fd.password);
      if (error) return renderAuthError(error.message);
      state.profile = await window.SB.getMyProfile();
      goto("home");
    } else if (kind === "signup") {
      const { error } = await window.SB.signUpGuard({
        email: fd.email, password: fd.password, fullName: fd.fullName, inviteCode: fd.inviteCode,
      });
      if (error) return renderAuthError(error.message);
      state.profile = await window.SB.getMyProfile();
      if (!state.profile) return renderAuthError("Revisa tu correo para confirmar la cuenta y luego inicia sesión.");
      goto("home");
    } else if (kind === "new-park") {
      const { error } = await window.SB.sb.from("parks").insert({
        name: fd.name, address: fd.address, emergency_phone: fd.emergency_phone,
      });
      if (error) return toast(error.message, "error");
      goto("home");
    } else if (kind === "new-ap") {
      const { error } = await window.SB.sb.from("access_points").insert({ park_id: form.dataset.park, name: fd.name });
      if (error) return toast(error.message, "error");
      goto("parque", { id: form.dataset.park });
    } else if (kind === "new-incident") {
      const p = state.profile;
      const { error } = await window.SB.sb.from("incidents").insert({
        park_id: p.park_id, guard_id: p.id, description: fd.description, severity: fd.severity,
      });
      if (error) return toast(error.message, "error");
      toast("Anomalía guardada en la bitácora ✅");
      goto("home");
    } else if (kind === "chat-send") {
      const p = state.profile;
      const parkId = p.role === "jefe_seguridad" ? state.params.parkId : p.park_id;
      const { error } = await window.SB.sb.from("guard_messages").insert({ park_id: parkId, sender_id: p.id, message: fd.message });
      if (error) return toast(error.message, "error");
      form.reset();
    }
  });

  function renderAuthError(msg) {
    root.innerHTML = V.loginView(state.authMode, msg);
  }

  function openQrModal(token, name) {
    const overlay = document.createElement("div");
    overlay.id = "qr-modal-overlay";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;";
    overlay.innerHTML = V.qrModal(token, name);
    document.body.appendChild(overlay);
    const canvas = overlay.querySelector("#qr-canvas");
    window.QR.renderQrToCanvas(canvas, window.APP_CONFIG.QR_PREFIX + token);
  }

  boot();
})();
