// =============================================================
// Hain Tayfa - sesler
// Hiç ses dosyası yok: bütün sesler tarayıcının ses motoruyla (Web Audio API) o an üretilir.
//   ton()     → bir nota
//   gurultu() → süzülmüş hışırtı (dalga, patlama, kum)
// Yeni ses eklemek için bir fonksiyon yaz, en alttaki listeye ekle, oyun.js'te Ses.adi() diye çağır.
// =============================================================

const Ses = (() => {
  const ANAHTAR = 'hainTayfa.ses';
  let ctx = null, ana = null, tampon = null;
  let acik = true, ortamBasladi = false, susuk = false;

  try {
    acik = localStorage.getItem(ANAHTAR) !== 'kapali';
  } catch (e) { /* hatırlanamazsa açık başlar */ }

  // Tarayıcılar sesi ancak bir tıklamadan sonra çalar; motor ilk seste açılır
  function motor() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      ana = ctx.createGain();
      ana.gain.value = acik ? 0.9 : 0;
      const sikistirici = ctx.createDynamicsCompressor();
      ana.connect(sikistirici);
      sikistirici.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function gurultuKaynagi() {
    const c = motor();
    if (!tampon) {
      tampon = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const veri = tampon.getChannelData(0);
      for (let i = 0; i < veri.length; i++) veri[i] = Math.random() * 2 - 1;
    }
    const kaynak = c.createBufferSource();
    kaynak.buffer = tampon;
    kaynak.loop = true;
    return kaynak;
  }

  function zarf(t, atak, seviye, sure, hedef = ana, tut = 0) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(seviye, t + atak);
    if (tut) g.gain.setValueAtTime(seviye, t + Math.max(atak, sure * tut));
    g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
    g.connect(hedef);
    return g;
  }

  function filtre(tip, frekans, q = 1) {
    const f = ctx.createBiquadFilter();
    f.type = tip;
    f.frequency.value = frekans;
    f.Q.value = q;
    return f;
  }

  function ton(frekans, { gecikme = 0, sure = 0.3, tip = 'sine', seviye = 0.2, bitis, atak = 0.005 } = {}) {
    const c = motor();
    const t = c.currentTime + gecikme;
    const osc = c.createOscillator();
    osc.type = tip;
    osc.frequency.setValueAtTime(frekans, t);
    if (bitis) osc.frequency.exponentialRampToValueAtTime(bitis, t + sure);
    osc.connect(zarf(t, atak, seviye, sure));
    osc.start(t);
    osc.stop(t + sure + 0.05);
  }

  function gurultu({ gecikme = 0, sure = 0.2, seviye = 0.2, tip = 'bandpass', frekans = 1000, q = 1, atak = 0.005, tut = 0, bitisFrekans } = {}) {
    const c = motor();
    const t = c.currentTime + gecikme;
    const kaynak = gurultuKaynagi();
    const f = filtre(tip, frekans, q);
    if (bitisFrekans) f.frequency.exponentialRampToValueAtTime(bitisFrekans, t + sure);
    kaynak.connect(f);
    f.connect(zarf(t, atak, seviye, sure, ana, tut));
    kaynak.start(t, Math.random());
    kaynak.stop(t + sure + 0.05);
  }

  // ---------- Arka plan: kıyıya vuran dalgalar ve ara sıra martı ----------
  function ortamBaslat() {
    if (ortamBasladi) return;
    const c = motor();
    ortamBasladi = true;
    const dalga = gurultuKaynagi();
    const f = filtre('lowpass', 500, 0.7);
    const g = c.createGain();
    g.gain.value = 0.05;
    dalga.connect(f);
    f.connect(g);
    g.connect(ana);
    dalga.start();
    // Dalgaların gelip gitmesi: ses seviyesi ve parlaklığı yavaşça dalgalanır
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.12;
    const lg = c.createGain();
    lg.gain.value = 0.04;
    lfo.connect(lg);
    lg.connect(g.gain);
    const lf2 = c.createGain();
    lf2.gain.value = 300;
    lfo.connect(lf2);
    lf2.connect(f.frequency);
    lfo.start();
    rastgeleOlay();
  }

  function rastgeleOlay() {
    setTimeout(() => {
      if (Math.random() < 0.6) marti();
      else ton(196, { sure: 2.5, seviye: 0.03, tip: 'triangle', atak: 0.8, bitis: 185 });  // uzaktan gemi borusu
      rastgeleOlay();
    }, 8000 + Math.random() * 12000);
  }

  function marti() {
    [0, 0.25, 0.5].forEach(g => ton(1400 + Math.random() * 300, { gecikme: g, sure: 0.18, seviye: 0.025, tip: 'triangle', bitis: 900 }));
  }

  // ---------- Oyun efektleri ----------
  function secim() {
    ton(520, { sure: 0.08, seviye: 0.08, tip: 'triangle', bitis: 640 });
  }

  function kart() {
    gurultu({ sure: 0.2, seviye: 0.12, frekans: 3000, q: 0.6, bitisFrekans: 1200 });
  }

  // Tahtaya karo konunca tok bir tahta sesi
  function karoKoy() {
    ton(160, { sure: 0.12, seviye: 0.35, bitis: 90 });
    gurultu({ sure: 0.06, seviye: 0.2, frekans: 900, q: 2 });
  }

  function patlama() {
    ton(70, { sure: 0.8, seviye: 0.9, bitis: 30 });
    gurultu({ sure: 1.2, seviye: 0.7, tip: 'lowpass', frekans: 2500, bitisFrekans: 200 });
    gurultu({ gecikme: 0.05, sure: 0.4, seviye: 0.3, tip: 'highpass', frekans: 2000 });
  }

  function kirildi() {
    ton(300, { sure: 0.25, seviye: 0.25, tip: 'square', bitis: 120 });
    gurultu({ sure: 0.15, seviye: 0.3, tip: 'highpass', frekans: 2500 });
  }

  function tamir() {
    [523.3, 659.3, 784].forEach((f, k) => ton(f, { gecikme: k * 0.07, sure: 0.3, seviye: 0.09, tip: 'triangle' }));
  }

  function harita() {
    gurultu({ sure: 0.5, seviye: 0.12, frekans: 2000, q: 0.5, bitisFrekans: 600 });
    ton(880, { gecikme: 0.3, sure: 0.6, seviye: 0.05, tip: 'sine', bitis: 1320 });
  }

  function altin() {
    [784, 988, 1175, 1568, 1976].forEach((f, k) => ton(f, { gecikme: k * 0.09, sure: 0.5, seviye: 0.1, tip: 'triangle' }));
    for (let k = 0; k < 14; k++) ton(2500 + Math.random() * 3000, { gecikme: 0.3 + Math.random() * 1.2, sure: 0.08, seviye: 0.05, tip: 'triangle' });
  }

  // Yanlış sandık: dipten gelen bir kükreme
  function tuzak() {
    ton(55, { sure: 1.8, seviye: 0.8, tip: 'sawtooth', bitis: 38, atak: 0.15 });
    ton(82, { sure: 1.6, seviye: 0.4, tip: 'sawtooth', bitis: 60, atak: 0.2 });
    gurultu({ sure: 1.5, seviye: 0.4, tip: 'lowpass', frekans: 400, atak: 0.2 });
  }

  function sira() {
    ton(392, { sure: 0.15, seviye: 0.07, tip: 'triangle' });
    ton(523.3, { gecikme: 0.12, sure: 0.2, seviye: 0.07, tip: 'triangle' });
  }

  function hata() {
    ton(200, { sure: 0.15, seviye: 0.12, tip: 'square', bitis: 150 });
  }

  function kazanma() {
    [392, 523.3, 659.3, 784, 1046.5].forEach((f, k) => ton(f, { gecikme: k * 0.15, sure: 0.8, seviye: 0.1, tip: 'triangle' }));
  }

  function kaybetme() {
    [392, 349.2, 311.1, 261.6].forEach((f, k) => ton(f, { gecikme: k * 0.3, sure: 0.7, seviye: 0.1, tip: 'sawtooth' }));
  }

  function seviyeyiAyarla() {
    if (ana) ana.gain.setTargetAtTime(acik && !susuk ? 0.9 : 0, ctx.currentTime, 0.05);
  }

  function acKapa() {
    acik = !acik;
    try {
      localStorage.setItem(ANAHTAR, acik ? 'acik' : 'kapali');
    } catch (e) { /* hatırlanmasa da olur */ }
    seviyeyiAyarla();
    return acik;
  }

  // Geçici susturma (online oyuna geri dönerken kaçırılan hamleler sessizce oynatılır)
  function sustur(evet) {
    susuk = evet;
    seviyeyiAyarla();
  }

  return {
    ortamBaslat, secim, kart, karoKoy, patlama, kirildi, tamir, harita, altin, tuzak, sira, hata,
    kazanma, kaybetme, acKapa, sustur,
    get acik() { return acik; },
  };
})();
