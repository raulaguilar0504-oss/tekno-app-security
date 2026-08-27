// Utilidades de cámara: iniciar/detener stream, capturar foto con marca de agua.
(function () {
  let currentStream = null;

  async function start(videoEl, facingMode = "environment") {
    stop();
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 720 }, height: { ideal: 960 } },
      audio: false,
    });
    videoEl.srcObject = currentStream;
    await videoEl.play();
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
