// Plantillas de UI (funciones puras: reciben datos, regresan HTML).
(function () {
  function esc(s) {
    return (s ?? "").toString().replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function fmtDT(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function topbar(title, { showBack = false, parkName = "" } = {}) {
    return `
      <div class="topbar">
        ${showBack ? `<button class="btn-icon" data-action="nav" data-view="home">←</button>` : ""}
        <h1>${esc(title)}</h1>
        ${parkName ? `<span class="park-chip">${esc(parkName)}</span>` : ""}
        <button class="btn-icon" data-action="logout" title="Salir">⏻</button>
      </div>`;
  }

  function bottomNav(active, role) {
    const items =
      role === "jefe_seguridad"
        ? [
            ["home", "🏠", "Inicio"],
            ["bitacora", "📋", "Bitácora"],
            ["galeria", "🖼️", "Galería"],
            ["mensajes", "💬", "Mensajes"],
            ["perfil", "👤", "Perfil"],
          ]
        : [
            ["home", "🏠", "Inicio"],
            ["bitacora", "📋", "Mi bitácora"],
            ["galeria", "🖼️", "Galería"],
            ["mensajes", "💬", "Guardias"],
            ["perfil", "👤", "Perfil"],
          ];
    return `
      <div class="bottom-nav">
        ${items
          .map(
            ([view, ic, label]) => `
          <button class="${view === active ? "active" : ""}" data-action="nav" data-view="${view}">
            <span class="ic">${ic}</span><span>${label}</span>
          </button>`
          )
          .join("")}
      </div>`;
  }

  function loginView(mode, err) {
    return `
      <div class="center-screen">
        <div class="auth-card card">
          <h1>🛡️ Bitácora de Seguridad</h1>
          <p class="sub">Control de guardias y rondines — parques industriales</p>
          ${err ? `<div class="error-banner">${esc(err)}</div>` : ""}
          ${
            mode === "signup"
              ? `
            <form data-form="signup">
              <label>Nombre completo</label>
              <input name="fullName" required placeholder="Nombre y apellido" />
              <label>Código de tu parque</label>
              <input name="inviteCode" required placeholder="Te lo da tu jefe de seguridad" />
              <label>Correo</label>
              <input name="email" type="email" required placeholder="tucorreo@ejemplo.com" />
              <label>Contraseña</label>
              <input name="password" type="password" required minlength="6" placeholder="Mínimo 6 caracteres" />
              <button class="btn" type="submit">Crear cuenta de guardia</button>
            </form>
            <div class="switch-mode">¿Ya tienes cuenta? <a href="#" data-action="switch-auth" data-mode="login">Inicia sesión</a></div>
          `
              : `
            <form data-form="login">
              <label>Correo</label>
              <input name="email" type="email" required placeholder="tucorreo@ejemplo.com" />
              <label>Contraseña</label>
              <input name="password" type="password" required placeholder="••••••••" />
              <button class="btn" type="submit">Entrar</button>
            </form>
            <div class="switch-mode">¿Eres guardia nuevo? <a href="#" data-action="switch-auth" data-mode="signup">Crea tu cuenta</a></div>
          `
          }
        </div>
      </div>`;
  }

  function guardHome(profile) {
    const park = profile.parks || {};
    return `
      ${topbar("Bitácora de Seguridad", { parkName: park.name })}
      <main>
        <div class="grid-actions">
          <button class="action-btn" data-action="nav" data-view="checkin" data-type="entrada"><span class="ic">➡️</span>Registrar entrada</button>
          <button class="action-btn" data-action="nav" data-view="checkin" data-type="salida"><span class="ic">⬅️</span>Registrar salida</button>
          <button class="action-btn" data-action="nav" data-view="rondin"><span class="ic">🔄</span>Hacer rondín</button>
          <button class="action-btn" data-action="nav" data-view="incidente"><span class="ic">⚠️</span>Reportar anomalía</button>
          <button class="action-btn emergency" data-action="nav" data-view="emergencia"><span class="ic">🚨</span>Contacto de emergencia</button>
        </div>
        <div class="card" id="rondin-status-card">
          <h2>Rondín</h2>
          <div id="rondin-status" class="small">Cargando…</div>
        </div>
        <div class="card">
          <h2>Mi turno hoy</h2>
          <div id="home-summary" class="small">Cargando…</div>
        </div>
      </main>
      ${bottomNav("home", "guardia")}`;
  }

  function jefeHome(profile, parks) {
    return `
      ${topbar("Panel del Jefe de Seguridad")}
      <main>
        <div class="card">
          <h2>Parques (${parks.length})</h2>
          ${
            parks.length
              ? parks
                  .map(
                    (p) => `
            <div class="park-list-item">
              <div>
                <div>${esc(p.name)}</div>
                <div class="small">Código de invitación: <b>${esc(p.guard_invite_code)}</b></div>
              </div>
              <button class="btn secondary" style="width:auto" data-action="nav" data-view="parque" data-id="${p.id}">Ver →</button>
            </div>`
                  )
                  .join("")
              : `<div class="empty">Aún no hay parques. Crea el primero abajo.</div>`
          }
        </div>
        <div class="card">
          <h2>Nuevo parque</h2>
          <form data-form="new-park">
            <label>Nombre del parque</label>
            <input name="name" required placeholder="Ej. TEKNO III" />
            <label>Dirección (opcional)</label>
            <input name="address" placeholder="Ubicación" />
            <label>Teléfono de emergencia</label>
            <input name="emergency_phone" required placeholder="Ej. 442 123 4567" />
            <button class="btn" type="submit">Crear parque</button>
          </form>
        </div>
        <div class="grid-actions">
          <button class="action-btn" data-action="nav" data-view="bitacora"><span class="ic">📋</span>Bitácora general</button>
          <button class="action-btn" data-action="nav" data-view="galeria"><span class="ic">🖼️</span>Galería general</button>
        </div>
      </main>
      ${bottomNav("home", "jefe_seguridad")}`;
  }

  function parkDetail(park, accessPoints, guards) {
    return `
      ${topbar(park.name, { showBack: true })}
      <main>
        <div class="card">
          <h2>Puntos de acceso / QR</h2>
          ${
            accessPoints.length
              ? accessPoints
                  .map(
                    (ap) => `
            <div class="park-list-item">
              <div>${esc(ap.name)}</div>
              <button class="btn secondary" style="width:auto" data-action="show-qr" data-token="${esc(ap.qr_token)}" data-name="${esc(ap.name)}">Ver QR</button>
            </div>`
                  )
                  .join("")
              : `<div class="empty">Sin puntos de acceso todavía.</div>`
          }
          <form data-form="new-ap" data-park="${park.id}" style="margin-top:10px">
            <label>Nuevo punto de acceso</label>
            <input name="name" required placeholder="Ej. Caseta principal" />
            <button class="btn secondary" type="submit">Agregar y generar QR</button>
          </form>
        </div>
        <div class="card">
          <h2>Guardias asignados (${guards.length})</h2>
          ${
            guards.length
              ? guards
                  .map(
                    (g) => `
            <div class="park-list-item">
              <div>${esc(g.full_name)}<div class="small">${g.active ? "Activo" : "Desactivado"}</div></div>
              <button class="btn ${g.active ? "danger" : "secondary"}" style="width:auto" data-action="toggle-guard" data-id="${g.id}" data-active="${g.active ? "1" : "0"}">
                ${g.active ? "Desactivar" : "Activar"}
              </button>
            </div>`
                  )
                  .join("")
              : `<div class="empty">Comparte el código <b>${esc(park.guard_invite_code)}</b> con tus guardias para que se registren.</div>`
          }
        </div>
      </main>`;
  }

  function qrModal(token, name) {
    return `
      <div class="card qr-card">
        <div><b>${esc(name)}</b></div>
        <canvas id="qr-canvas"></canvas>
        <div class="small">Escanéalo con la app para registrar entrada/salida/rondín en este punto.</div>
        <button class="btn secondary" data-action="download-qr" data-token="${esc(token)}" data-name="${esc(name)}">Descargar para imprimir</button>
        <button class="btn secondary" data-action="close-modal">Cerrar</button>
      </div>`;
  }

  function cameraScreen({ title, mode, allowQr }) {
    return `
      ${topbar(title, { showBack: true })}
      <main>
        ${allowQr ? `
          <div class="grid-actions" style="margin-bottom:10px">
            <button class="action-btn ${mode === "qr" ? "" : ""}" data-action="set-mode" data-mode="qr" style="${mode === "qr" ? "border-color:var(--accent)" : ""}">📷 Escanear QR</button>
            <button class="action-btn" data-action="set-mode" data-mode="manual" style="${mode === "manual" ? "border-color:var(--accent)" : ""}">✍️ Entrada provisional</button>
          </div>` : ""}
        <div id="camera-status"></div>
        <div class="camera-wrap">
          <video id="cam-video" playsinline muted></video>
          ${mode === "qr" ? `<div class="scan-box"></div>` : ""}
        </div>
        <div class="camera-actions">
          ${
            mode === "manual"
              ? `<button class="btn" id="btn-capture">Tomar foto y confirmar</button>`
              : `<div class="small" style="padding-top:8px">Apunta la cámara al código QR del punto de acceso…</div>`
          }
        </div>
        <div id="capture-result"></div>
      </main>`;
  }

  function feedItem(ev) {
    const icons = {
      entrada: "➡️", salida: "⬅️", rondin: "🔄", incidente: "⚠️", emergencia: "🚨",
    };
    return `
      <div class="feed-item">
        <div class="ic">${icons[ev.kind] || "•"}</div>
        <div style="flex:1">
          <div>${esc(ev.title)} ${ev.method ? `<span class="tag ${ev.method}">${ev.method === "qr" ? "QR" : "manual"}</span>` : ""}</div>
          <div class="meta">${fmtDT(ev.created_at)} ${ev.guardName ? "· " + esc(ev.guardName) : ""} ${ev.parkName ? "· " + esc(ev.parkName) : ""}</div>
        </div>
      </div>`;
  }

  function bitacoraView(events, parkFilterHtml, role) {
    return `
      ${topbar("Bitácora")}
      <main>
        ${parkFilterHtml || ""}
        <div class="card">
          ${events.length ? events.map(feedItem).join("") : `<div class="empty">Sin actividad todavía.</div>`}
        </div>
      </main>
      ${bottomNav("bitacora", role)}`;
  }

  function galeriaView(photos, role) {
    return `
      ${topbar("Galería de fotos")}
      <main>
        <div class="card">
          ${
            photos.length
              ? `<div class="photo-grid">${photos.map((p) => `<img src="${p.url}" loading="lazy" />`).join("")}</div>`
              : `<div class="empty">Aún no hay fotos.</div>`
          }
        </div>
      </main>
      ${bottomNav("galeria", role)}`;
  }

  function chatView(messages, myId, extraTopHtml, role) {
    return `
      ${topbar("Guardias — chat interno")}
      <main>
        ${extraTopHtml || ""}
        <div class="card">
          <div class="chat-scroll" id="chat-scroll">
            ${messages
              .map(
                (m) => `
              <div class="msg ${m.sender_id === myId ? "mine" : ""}">
                <div class="who">${esc(m.senderName || "Guardia")} · ${fmtDT(m.created_at)}</div>
                ${esc(m.message)}
              </div>`
              )
              .join("")}
          </div>
          <form data-form="chat-send">
            <input name="message" placeholder="Escribe un mensaje…" autocomplete="off" required />
            <button class="btn" type="submit">Enviar</button>
          </form>
        </div>
      </main>
      ${bottomNav("mensajes", role)}`;
  }

  function emergenciaView(park, sent) {
    return `
      ${topbar("Emergencia", { showBack: true })}
      <main>
        <div class="card" style="text-align:center">
          ${
            sent
              ? `<div class="ok-banner">Alerta enviada. El jefe de seguridad fue notificado.</div>`
              : `<p>Se registrará tu ubicación y hora, y se avisará de inmediato al jefe de seguridad.</p>
                 <button class="btn danger" id="btn-send-emergency">🚨 Enviar alerta de emergencia</button>`
          }
          ${
            park?.emergency_phone
              ? `<a class="btn secondary" style="margin-top:10px" href="tel:${esc(park.emergency_phone)}">📞 Llamar a ${esc(park.emergency_phone)}</a>`
              : ""
          }
        </div>
      </main>`;
  }

  function incidenteView() {
    return `
      ${topbar("Reportar anomalía", { showBack: true })}
      <main>
        <div class="card">
          <form data-form="new-incident">
            <label>Descripción</label>
            <textarea name="description" required placeholder="¿Qué observaste?"></textarea>
            <label>Gravedad</label>
            <select name="severity">
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
              <option value="critica">Crítica</option>
            </select>
            <button class="btn" type="submit">Guardar en la bitácora</button>
          </form>
        </div>
      </main>`;
  }

  function perfilView(profile) {
    return `
      ${topbar("Mi perfil")}
      <main>
        <div class="card">
          <div><b>${esc(profile.full_name)}</b></div>
          <div class="small">${profile.role === "jefe_seguridad" ? "Jefe de seguridad" : "Guardia"}</div>
          ${profile.parks?.name ? `<div class="small">Parque: ${esc(profile.parks.name)}</div>` : ""}
        </div>
        <button class="btn secondary" data-action="logout">Cerrar sesión</button>
      </main>
      ${bottomNav("perfil", profile.role)}`;
  }

  window.Views = {
    esc, fmtDT, topbar, bottomNav, loginView, guardHome, jefeHome, parkDetail, qrModal,
    cameraScreen, bitacoraView, galeriaView, chatView, emergenciaView, incidenteView, perfilView, feedItem,
  };
})();
