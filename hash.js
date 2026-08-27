// Hash perceptual simple (aHash) para detectar fotos repetidas/reutilizadas.
// No es infalible (no es un sistema biométrico), pero evita el caso más común:
// que el guardia mande siempre la misma imagen guardada.
(function () {
  function aHashFromCanvas(canvas) {
    const size = 8;
    const tmp = document.createElement("canvas");
    tmp.width = size;
    tmp.height = size;
    const ctx = tmp.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    const gray = [];
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const g = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      gray.push(g);
      sum += g;
    }
    const avg = sum / gray.length;
    let bits = "";
    for (const g of gray) bits += g >= avg ? "1" : "0";
    // Empaqueta 64 bits en hex
    let hex = "";
    for (let i = 0; i < bits.length; i += 4) {
      hex += parseInt(bits.substr(i, 4), 2).toString(16);
    }
    return hex;
  }

  function hammingDistanceHex(hexA, hexB) {
    if (!hexA || !hexB || hexA.length !== hexB.length) return 64;
    let dist = 0;
    for (let i = 0; i < hexA.length; i++) {
      let x = parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16);
      while (x) {
        dist += x & 1;
        x >>= 1;
      }
    }
    return dist;
  }

  window.PhotoHash = { aHashFromCanvas, hammingDistanceHex };
})();
