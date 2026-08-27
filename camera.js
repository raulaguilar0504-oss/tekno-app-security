// Utilidades de cámara: iniciar/detener stream, capturar foto con marca de agua.
(function () {
  let currentStream = null;

  async function start(videoEl, facingMode = "environment") {
    stop();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = new Error("Este navegador no permite acceder a la cámara. Usa Chrome o Safari actualizados.");
      err.code = "UNSUPPORTED";
      throw err;
    }
    // Pequeña pausa para que el navegador libere por completo la cámara
    // de un stream anterior antes de pedir uno nuevo (evita NotReadableError).
    await new Promise((r) => setTimeout(r, 120));
    try {
      currentStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false,
      });
    } catch (e1) {
      // Reintento con restricciones mínimas: cubre laptops sin cámara trasera,
      // navegadores que no soportan facingMode, o cámara ocupada momentáneamente.
      try {
        currentStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (e2) {
        e2.code = e1.name === "NotAllowedError" || e2.name === "NotAllowedError" ? "DENIED" : e2.name;
        throw e2;
      }
    }
    videoEl.srcObject = currentStream;
    try {
      await videoEl.play();
    } catch (_) {
      // Algunos navegadores requieren un toque del usuario; el <video muted playsinline>
      // ya cubre la mayoría de los casos, pero no dejamos que esto tumbe el flujo.
    }
    return currentStream;
  }

  function stop() {
    if (currentStream) {
      currentStream.getTracks().forEach((t) => t.stop());
      currentStream = null;
    }
  }

  function captureFrame(videoEl, watermarkLines) {
    const canvas = document.createElement("canvas");
    canvas.width = videoEl.videoWidth || 720;
    canvas.height = videoEl.videoHeight || 960;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

    if (watermarkLines && watermarkLines.length) {
      const pad = 14;
      const lineH = Math.round(canvas.width * 0.032);
      const boxH = watermarkLines.length * lineH + pad * 1.5;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, canvas.height - boxH, canvas.width, boxH);
      ctx.fillStyle = "#ffffff";
      ctx.font = `${lineH * 0.72}px -apple-system, Arial, sans-serif`;
      ctx.textBaseline = "top";
      watermarkLines.forEach((line, i) => {
        ctx.fillText(line, pad, canvas.height - boxH + pad * 0.6 + i * lineH);
      });
    }
    return canvas;
  }

  function canvasToBlob(canvas, quality = 0.85) {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
  }

  function getGeolocation(timeoutMs = 4000) {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      const timer = setTimeout(() => resolve(null), timeoutMs);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          clearTimeout(timer);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: timeoutMs }
      );
    });
  }

  window.Camera = { start, stop, captureFrame, canvasToBlob, getGeolocation };
})();
