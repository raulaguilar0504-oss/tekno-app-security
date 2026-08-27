// Generación y escaneo de códigos QR reales.
(function () {
  function renderQrToCanvas(canvas, text) {
    return window.QRCode.toCanvas(canvas, text, { width: 260, margin: 2 });
  }

  async function dataUrlFor(text) {
    return window.QRCode.toDataURL(text, { width: 480, margin: 2 });
  }

  // Corre un loop de escaneo sobre un <video> usando jsQR, hasta encontrar un
  // código o hasta que se llame stopScan().
  function startScan(videoEl, onResult, { intervalMs = 220 } = {}) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let stopped = false;

    function tick() {
      if (stopped) return;
      if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(imgData.data, imgData.width, imgData.height, {
          inversionAttempts: "dontInvert",
        });
        if (code && code.data) {
          onResult(code.data);
          return;
        }
      }
      setTimeout(tick, intervalMs);
    }
    tick();
    return () => {
      stopped = true;
    };
  }

  window.QR = { renderQrToCanvas, dataUrlFor, startScan };
})();
