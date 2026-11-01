// =============================================================
// Hain Tayfa - 3D sahne (Three.js)
// Deniz, ada, palmiyeler, yol karoları, başlangıç iskelesi ve 3 X işaretli sandık burada çizilir.
// Bu dosya kuralları bilmez: oyun.js "şuraya karo koy", "şu sandığı aç" der, burası gösterir.
// Tahta 9 sütun x 7 satır; (x, y) = (sütun, satır), y=0 en üst (kuzey).
// =============================================================

const Sahne = (() => {
  const SUTUN = 9, SATIR = 7, K = 1;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const rnd = Math.random;
  const lerp = (a, b, t) => a + (b - a) * t;

  let renderer, sahne, kamera, dinamik, deniz, denizIlk, tiklamaPlani, hayalet, bayrak;
  const saat = new THREE.Clock();
  const isin = new THREE.Raycaster();
  const fare = new THREE.Vector2();
  const animasyonlar = [];
  const palmiyeler = [];
  const karolar = new Map();   // "x,y" → karo grubu
  let hedefler = [];           // { x, y, grup, tumsek, sandik }
  let isaretGrubu;
  const bakis = { konum: V(0, 9, 8), hedef: V(0, 0, 0.5) };
  let sarsinti = 0, uzerinde = null;
  let tiklaninca = () => {}, uzerineGelince = () => {};

  // ---------- Animasyon yardımcıları ----------
  const yumusak = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const dogrusal = t => t;
  let hizliMod = false;  // online oyuna geri dönerken animasyonlar anında biter

  function animasyon(sure, adim, egri = yumusak) {
    if (hizliMod) sure = 0.0001;
    return new Promise(coz => {
      let gecen = 0;
      animasyonlar.push(dt => {
        gecen += dt;
        const t = Math.min(gecen / sure, 1);
        adim(egri(t), t);
        if (t >= 1) {
          coz();
          return false;
        }
        return true;
      });
    });
  }
  const bekle = sn => animasyon(sn, () => {});

  const hucreKonum = (x, y) => V((x - (SUTUN - 1) / 2) * K, 0, (y - (SATIR - 1) / 2) * K);
  const anahtar = (x, y) => `${x},${y}`;

  // ---------- Kurulum ----------
  function baslat(kap) {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    kap.appendChild(renderer.domElement);

    sahne = new THREE.Scene();
    sahne.background = new THREE.Color(0x8fcbe8);
    sahne.fog = new THREE.Fog(0x8fcbe8, 22, 60);
    kamera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);

    sahne.add(new THREE.HemisphereLight(0xdff0ff, 0x8a6a3a, 1.1));
    const gunes = new THREE.DirectionalLight(0xfff0d0, 2.2);
    gunes.position.set(6, 12, 5);
    gunes.castShadow = true;
    gunes.shadow.mapSize.set(2048, 2048);
    Object.assign(gunes.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
    gunes.shadow.bias = -0.0005;
    gunes.shadow.normalBias = 0.02;
    sahne.add(gunes);

    denizKur();
    adaKur();
    [[-6.6, -3.9], [6.9, -3.6], [-6.8, 3.6], [6.6, 4.2], [-1.5, -5.3], [2.8, 5.4], [-4.2, 5.2], [4.6, -5.1]].forEach(([x, z]) => palmiyeKur(x, z));

    // Tıklamaları yakalayan görünmez düzlem (tahtanın tamamı)
    tiklamaPlani = new THREE.Mesh(
      new THREE.PlaneGeometry(SUTUN * K, SATIR * K),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    tiklamaPlani.rotation.x = -Math.PI / 2;
    tiklamaPlani.position.y = 0.1;
    sahne.add(tiklamaPlani);

    sifirla();
    boyutla();
    window.addEventListener('resize', boyutla);
    fareDinle(renderer.domElement);
    renderer.setAnimationLoop(dongu);
  }

  function sifirla() {
    if (dinamik) sahne.remove(dinamik);
    dinamik = new THREE.Group();
    sahne.add(dinamik);
    isaretGrubu = new THREE.Group();
    dinamik.add(isaretGrubu);
    karolar.clear();
    hedefler = [];
    hayalet = null;
    animasyonlar.length = 0;
    bakis.konum.copy(genelKonum());
    bakis.hedef.copy(genelHedef());
  }

  function denizKur() {
    const geo = new THREE.PlaneGeometry(160, 160, 80, 80);
    geo.rotateX(-Math.PI / 2);
    denizIlk = Float32Array.from(geo.attributes.position.array);
    deniz = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x1b78a8, roughness: 0.25, metalness: 0.15 }));
    deniz.position.y = -0.55;
    deniz.receiveShadow = true;
    sahne.add(deniz);
    // Adanın çevresindeki sığ, turkuaz su
    const sig = new THREE.Mesh(
      new THREE.CircleGeometry(12.5, 64),
      new THREE.MeshStandardMaterial({ color: 0x3cc6c0, transparent: true, opacity: 0.55, roughness: 0.2 }),
    );
    sig.rotation.x = -Math.PI / 2;
    sig.position.y = -0.48;
    sahne.add(sig);
  }

  function kumDokusu(boyut, tekrar) {
    const c = document.createElement('canvas');
    c.width = c.height = boyut;
    const g = c.getContext('2d');
    g.fillStyle = '#e2c98f';
    g.fillRect(0, 0, boyut, boyut);
    for (let k = 0; k < boyut * 12; k++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '120,90,40' : '255,245,210'},${0.08 + rnd() * 0.12})`;
      g.fillRect(rnd() * boyut, rnd() * boyut, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    const doku = new THREE.CanvasTexture(c);
    doku.colorSpace = THREE.SRGBColorSpace;
    doku.wrapS = doku.wrapT = THREE.RepeatWrapping;
    doku.repeat.set(tekrar, tekrar);
    return doku;
  }

  function adaKur() {
    const kum = new THREE.Mesh(
      new THREE.CylinderGeometry(10.5, 12, 1.2, 72),
      new THREE.MeshStandardMaterial({ map: kumDokusu(256, 6), roughness: 0.95 }),
    );
    kum.position.y = -0.62;
    kum.receiveShadow = true;
    sahne.add(kum);

    // Tahtanın zemini: koyu kum ve ince ızgara çizgileri
    const c = document.createElement('canvas');
    c.width = SUTUN * 64;
    c.height = SATIR * 64;
    const g = c.getContext('2d');
    g.fillStyle = '#c9ad74';
    g.fillRect(0, 0, c.width, c.height);
    for (let k = 0; k < 4000; k++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '90,60,20' : '255,240,200'},${0.06 + rnd() * 0.1})`;
      g.fillRect(rnd() * c.width, rnd() * c.height, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    g.strokeStyle = 'rgba(90,60,25,.35)';
    g.lineWidth = 2;
    for (let x = 0; x <= SUTUN; x++) {
      g.beginPath();
      g.moveTo(x * 64, 0);
      g.lineTo(x * 64, c.height);
      g.stroke();
    }
    for (let y = 0; y <= SATIR; y++) {
      g.beginPath();
      g.moveTo(0, y * 64);
      g.lineTo(c.width, y * 64);
      g.stroke();
    }
    const doku = new THREE.CanvasTexture(c);
    doku.colorSpace = THREE.SRGBColorSpace;
    const zemin = new THREE.Mesh(new THREE.PlaneGeometry(SUTUN * K, SATIR * K), new THREE.MeshStandardMaterial({ map: doku, roughness: 1 }));
    zemin.rotation.x = -Math.PI / 2;
    zemin.position.y = 0.005;
    zemin.receiveShadow = true;
    sahne.add(zemin);
  }

  function palmiyeKur(x, z) {
    const grup = new THREE.Group();
    grup.position.set(x, 0, z);
    const govdeMalz = new THREE.MeshStandardMaterial({ color: 0x8a6438, roughness: 0.9 });
    const egim = (rnd() - 0.5) * 0.5;
    let ust = V(0, 0, 0);
    for (let k = 0; k < 7; k++) {  // hafif eğik, boğum boğum gövde
      const parca = new THREE.Mesh(new THREE.CylinderGeometry(0.11 - k * 0.008, 0.13 - k * 0.008, 0.42, 8), govdeMalz);
      ust = V(Math.sin(egim) * k * 0.1, 0.21 + k * 0.4, 0);
      parca.position.copy(ust);
      parca.rotation.z = -egim * 0.5;
      parca.castShadow = true;
      grup.add(parca);
    }
    const yapraklar = new THREE.Group();
    yapraklar.position.set(ust.x, ust.y + 0.2, 0);
    const yaprakMalz = new THREE.MeshStandardMaterial({ color: 0x2f8a3a, roughness: 0.7, side: THREE.DoubleSide });
    for (let k = 0; k < 7; k++) {
      const yaprak = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), yaprakMalz);
      yaprak.scale.set(0.9, 0.05, 0.22);
      yaprak.position.set(0.8, -0.2, 0);
      const kol = new THREE.Group();
      kol.rotation.y = (k / 7) * Math.PI * 2 + rnd() * 0.3;
      kol.rotation.z = -0.35;
      kol.add(yaprak);
      yaprak.castShadow = true;
      yapraklar.add(kol);
    }
    const hindistan = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.8 });
    for (let k = 0; k < 3; k++) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), hindistan);
      h.position.set(Math.cos(k * 2.1) * 0.12, -0.15, Math.sin(k * 2.1) * 0.12);
      yapraklar.add(h);
    }
    grup.add(yapraklar);
    sahne.add(grup);
    palmiyeler.push({ yapraklar, faz: rnd() * 10 });
  }

  // ---------- Karolar ----------
  // acik: [kuzey, doğu, güney, batı] açık mı; merkez: yol ortadan geçiyor mu (false = çıkmaz yol)
  const dokuOnbellegi = new Map();
  function karoKanvasi(acik, merkez) {
    const anahtarK = acik.map(Number).join('') + (merkez ? 'm' : 'c');
    if (dokuOnbellegi.has(anahtarK)) return dokuOnbellegi.get(anahtarK);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    // Orman zemini
    g.fillStyle = '#3d7a37';
    g.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 260; k++) {
      g.strokeStyle = `rgba(${rnd() < 0.5 ? '20,60,20' : '120,180,80'},.55)`;
      g.lineWidth = 1.5;
      const x = rnd() * 128, y = rnd() * 128;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rnd() - 0.5) * 4, y - 4 - rnd() * 4);
      g.stroke();
    }
    // Kum patika
    const G = 46, A = (128 - G) / 2;
    const parcalar = [];
    const kenar = merkez ? 0 : 0;
    const boy = merkez ? A + G / 2 : 40;  // çıkmaz yolda kenardan gelen yol ortaya varmadan kesilir
    if (acik[0]) parcalar.push([A, kenar, G, boy]);
    if (acik[2]) parcalar.push([A, 128 - boy, G, boy]);
    if (acik[3]) parcalar.push([kenar, A, boy, G]);
    if (acik[1]) parcalar.push([128 - boy, A, boy, G]);
    if (merkez) parcalar.push([A, A, G, G]);
    g.fillStyle = '#8f6f3a';
    parcalar.forEach(([x, y, w, h]) => g.fillRect(x - 3, y - 3, w + 6, h + 6));
    g.fillStyle = '#cfb072';
    parcalar.forEach(([x, y, w, h]) => g.fillRect(x, y, w, h));
    for (let k = 0; k < 120; k++) {
      g.fillStyle = 'rgba(150,115,60,.35)';
      const [x, y, w, h] = parcalar[Math.floor(rnd() * parcalar.length)] || [0, 0, 0, 0];
      g.fillRect(x + rnd() * w, y + rnd() * h, 2, 2);
    }
    // Çıkmaz yol: yolların bittiği yerde kayalar
    if (!merkez) {
      const kaya = (x, y) => {
        g.fillStyle = '#5c5c5c';
        g.beginPath();
        g.arc(x, y, 13, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#8a8a8a';
        g.beginPath();
        g.arc(x - 3, y - 3, 8, 0, Math.PI * 2);
        g.fill();
      };
      if (acik[0]) kaya(64, 44);
      if (acik[2]) kaya(64, 84);
      if (acik[3]) kaya(44, 64);
      if (acik[1]) kaya(84, 64);
    }
    dokuOnbellegi.set(anahtarK, c);
    return c;
  }

  const resimOnbellegi = new Map();
  function karoResmi(acik, merkez) {
    const anahtarK = acik.map(Number).join('') + (merkez ? 'm' : 'c');
    if (!resimOnbellegi.has(anahtarK)) resimOnbellegi.set(anahtarK, karoKanvasi(acik, merkez).toDataURL());
    return resimOnbellegi.get(anahtarK);
  }

  function karoGrubu(kanvas, cevrik, yanRenk = 0x6b4f2a) {
    const grup = new THREE.Group();
    const govde = new THREE.Mesh(new THREE.BoxGeometry(K * 0.96, 0.08, K * 0.96), new THREE.MeshStandardMaterial({ color: yanRenk, roughness: 0.9 }));
    govde.position.y = 0.04;
    govde.castShadow = govde.receiveShadow = true;
    const doku = new THREE.CanvasTexture(kanvas);
    doku.colorSpace = THREE.SRGBColorSpace;
    doku.anisotropy = 4;
    const ust = new THREE.Mesh(new THREE.PlaneGeometry(K * 0.96, K * 0.96), new THREE.MeshStandardMaterial({ map: doku, roughness: 0.95 }));
    ust.rotation.x = -Math.PI / 2;
    ust.position.y = 0.081;
    ust.receiveShadow = true;
    grup.add(govde, ust);
    grup.rotation.y = cevrik ? Math.PI : 0;
    return grup;
  }

  async function karoKoy(x, y, acik, merkez, cevrik) {
    const grup = karoGrubu(karoKanvasi(acik, merkez), cevrik);
    const p = hucreKonum(x, y);
    grup.position.set(p.x, 1.4, p.z);
    dinamik.add(grup);
    karolar.set(anahtar(x, y), grup);
    await animasyon(0.32, t => (grup.position.y = 1.4 * (1 - t)), t => t * t);
    Ses.karoKoy();
    await animasyon(0.15, (t, ham) => (grup.position.y = Math.sin(ham * Math.PI) * 0.06), dogrusal);
    grup.position.y = 0;
  }

  // 💣 Top güllesi: karo havaya uçar, ateş topu ve duman
  async function karoPatlat(x, y) {
    const grup = karolar.get(anahtar(x, y));
    const p = hucreKonum(x, y);
    // Gülle gökten düşer
    const gulle = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.4 }));
    gulle.position.set(p.x - 2, 5, p.z + 2);
    dinamik.add(gulle);
    await animasyon(0.45, t => gulle.position.set(lerp(p.x - 2, p.x, t), lerp(5, 0.2, t * t), lerp(p.z + 2, p.z, t)), dogrusal);
    dinamik.remove(gulle);
    Ses.patlama();
    sarsinti = 0.25;
    if (navigator.vibrate) navigator.vibrate(200);
    const ates = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true }));
    ates.position.set(p.x, 0.3, p.z);
    const isik = new THREE.PointLight(0xff8a20, 30, 6, 1.5);
    isik.position.set(p.x, 0.8, p.z);
    dinamik.add(ates, isik);
    duman(p, 0x555555, 40);
    karolar.delete(anahtar(x, y));
    const donus = V(rnd() * 8, rnd() * 8, rnd() * 8);
    await animasyon(0.8, (t, ham) => {
      ates.scale.setScalar(1 + ham * 2);
      ates.material.opacity = 1 - ham;
      isik.intensity = 30 * (1 - ham);
      if (grup) {
        grup.position.y = ham * 2.5 - ham * ham * 1.5;
        grup.rotation.set(donus.x * ham, donus.y * ham, donus.z * ham);
        grup.scale.setScalar(1 - ham * 0.7);
      }
    }, dogrusal);
    dinamik.remove(ates, isik);
    if (grup) dinamik.remove(grup);
  }

  function duman(p, renk, adet) {
    const konumlar = new Float32Array(adet * 3);
    const hizlar = [];
    for (let k = 0; k < adet; k++) {
      konumlar.set([p.x + (rnd() - 0.5) * 0.4, 0.2 + rnd() * 0.3, p.z + (rnd() - 0.5) * 0.4], k * 3);
      hizlar.push(V((rnd() - 0.5) * 1.5, 0.6 + rnd() * 1.2, (rnd() - 0.5) * 1.5));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(konumlar, 3));
    const malz = new THREE.PointsMaterial({ color: renk, size: 0.18, transparent: true, opacity: 0.8, depthWrite: false });
    const bulut = new THREE.Points(geo, malz);
    dinamik.add(bulut);
    animasyon(1.6, (t, ham) => {
      for (let k = 0; k < adet; k++) {
        konumlar[k * 3] += hizlar[k].x * 0.016;
        konumlar[k * 3 + 1] += hizlar[k].y * 0.016;
        konumlar[k * 3 + 2] += hizlar[k].z * 0.016;
      }
      geo.attributes.position.needsUpdate = true;
      malz.opacity = 0.8 * (1 - ham);
    }, dogrusal).then(() => dinamik.remove(bulut));
  }

  // ---------- Başlangıç iskelesi ve korsan bayrağı ----------
  function baslangicKur(x, y) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#7a5530';
    g.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 6; k++) {  // tahta kalaslar
      g.fillStyle = k % 2 ? '#8d6438' : '#80592f';
      g.fillRect(0, k * 21.3, 128, 20);
      g.fillStyle = '#3a2614';
      g.fillRect(0, k * 21.3 + 20, 128, 1.3);
      g.fillRect(10 + (k % 2) * 50, k * 21.3 + 8, 3, 3);
      g.fillRect(110 - (k % 2) * 40, k * 21.3 + 8, 3, 3);
    }
    const grup = karoGrubu(c, false, 0x4a3018);
    const p = hucreKonum(x, y);
    grup.position.set(p.x, 0, p.z);
    dinamik.add(grup);
    karolar.set(anahtar(x, y), grup);

    // Direk ve dalgalanan kara bayrak
    const direk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0x4a3018 }));
    direk.position.set(p.x - 0.3, 0.8, p.z - 0.3);
    direk.castShadow = true;
    const bc = document.createElement('canvas');
    bc.width = 128;
    bc.height = 84;
    const bg = bc.getContext('2d');
    bg.fillStyle = '#111';
    bg.fillRect(0, 0, 128, 84);
    bg.fillStyle = '#eee';
    bg.beginPath();
    bg.arc(64, 34, 18, 0, Math.PI * 2);
    bg.fill();
    bg.fillRect(54, 44, 20, 12);
    bg.fillStyle = '#111';
    bg.beginPath();
    bg.arc(57, 33, 5, 0, Math.PI * 2);
    bg.arc(71, 33, 5, 0, Math.PI * 2);
    bg.fill();
    bg.strokeStyle = '#eee';
    bg.lineWidth = 7;
    bg.lineCap = 'round';
    bg.beginPath();
    bg.moveTo(36, 58);
    bg.lineTo(92, 78);
    bg.moveTo(92, 58);
    bg.lineTo(36, 78);
    bg.stroke();
    const bd = new THREE.CanvasTexture(bc);
    bd.colorSpace = THREE.SRGBColorSpace;
    const bgeo = new THREE.PlaneGeometry(0.6, 0.4, 10, 4);
    bayrak = { mesh: new THREE.Mesh(bgeo, new THREE.MeshStandardMaterial({ map: bd, side: THREE.DoubleSide, roughness: 0.8 })), ilk: Float32Array.from(bgeo.attributes.position.array) };
    bayrak.mesh.position.set(p.x - 0.3 + 0.3, 1.38, p.z - 0.3);
    bayrak.mesh.castShadow = true;
    dinamik.add(direk, bayrak.mesh);

    // Kenarda bekleyen küçük sandal
    const sandal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 1.3, 16, 1, false, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.8, side: THREE.DoubleSide }),
    );
    sandal.rotation.set(0, 0, Math.PI / 2);
    sandal.rotation.order = 'ZYX';
    sandal.rotation.y = Math.PI / 2;
    sandal.scale.set(1, 1, 0.5);
    sandal.position.set(p.x - 1.25, 0.18, p.z + 0.6);
    sandal.castShadow = true;
    dinamik.add(sandal);
  }

  // ---------- 3 hedef: X işaretli kum tümseği, altında sandık ----------
  function hedefKur(i, x, y) {
    const p = hucreKonum(x, y);
    const grup = new THREE.Group();
    grup.position.set(p.x, 0, p.z);
    const tumsek = new THREE.Mesh(new THREE.SphereGeometry(0.46, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: kumDokusu(64, 1), roughness: 1 }));
    tumsek.scale.y = 0.45;
    tumsek.castShadow = tumsek.receiveShadow = true;
    const xMalz = new THREE.MeshStandardMaterial({ color: 0xc0201a, roughness: 0.6 });
    [-1, 1].forEach(yon => {
      // Tümsek dikeyde 0.45 basık; X tümseğin tepesinde görünsün diye o oranda yukarıda durur
      const cubuk = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.09), xMalz);
      cubuk.position.y = 0.47;
      cubuk.rotation.y = yon * Math.PI / 4;
      tumsek.add(cubuk);
    });
    grup.add(tumsek);
    dinamik.add(grup);
    hedefler[i] = { x, y, grup, tumsek, p };
  }

  function sandikYap() {
    const sandik = new THREE.Group();
    const tahta = new THREE.MeshStandardMaterial({ color: 0x6e4420, roughness: 0.8 });
    const demir = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.8, roughness: 0.3 });
    const govde = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.32, 0.4), tahta);
    govde.position.y = 0.16;
    sandik.add(govde);
    [-0.22, 0.22].forEach(x => {
      const bant = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.33, 0.41), demir);
      bant.position.set(x, 0.16, 0);
      sandik.add(bant);
    });
    const kapakMenteşe = new THREE.Group();
    kapakMenteşe.position.set(0, 0.32, -0.2);
    const kapak = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 16, 1, false, 0, Math.PI), tahta);
    kapak.rotation.z = Math.PI / 2;
    kapak.position.z = 0.2;
    kapakMenteşe.add(kapak);
    sandik.add(kapakMenteşe);
    sandik.traverse(o => (o.castShadow = true));
    return { sandik, kapak: kapakMenteşe };
  }

  // Sandığın açılışı: altın parlar ya da içinden ahtapot kolları fırlar
  async function hedefAc(i, altin) {
    const h = hedefler[i];
    if (!h || h.acildi) return;
    h.acildi = true;
    await animasyon(0.5, t => {
      h.tumsek.scale.set(1 + t * 0.3, 0.45 * (1 - t), 1 + t * 0.3);
    });
    duman(h.p, 0xd9c08a, 25);
    const { sandik, kapak } = sandikYap();
    sandik.position.y = -0.4;
    h.grup.add(sandik);
    await animasyon(0.5, t => (sandik.position.y = -0.4 + 0.4 * t));
    await bekle(0.4);
    await animasyon(0.5, t => (kapak.rotation.x = -1.9 * t));

    if (altin) {
      const yigin = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xb07a00, emissiveIntensity: 0.8, metalness: 0.9, roughness: 0.25 }));
      yigin.scale.y = 0.6;
      yigin.position.y = 0.3;
      sandik.add(yigin);
      const isik = new THREE.PointLight(0xffc840, 0, 5, 1.2);
      isik.position.set(h.p.x, 1, h.p.z);
      dinamik.add(isik);
      Ses.altin();
      paralar(h.p);
      await animasyon(1.2, t => (isik.intensity = 25 * t));
    } else {
      Ses.tuzak();
      sarsinti = 0.2;
      if (navigator.vibrate) navigator.vibrate([150, 50, 250]);
      duman(h.p, 0x2a2a35, 40);
      await kollar(h.p);
    }
  }

  function paralar(p) {
    const malz = new THREE.MeshStandardMaterial({ color: 0xffd34d, metalness: 0.9, roughness: 0.25, emissive: 0x6a4a00 });
    const geo = new THREE.CylinderGeometry(0.05, 0.05, 0.012, 12);
    const liste = [];
    for (let k = 0; k < 30; k++) {
      const para = new THREE.Mesh(geo, malz);
      para.position.set(p.x, 0.4, p.z);
      liste.push({ para, h: V((rnd() - 0.5) * 2.5, 2 + rnd() * 2.5, (rnd() - 0.5) * 2.5), d: V(rnd() * 15, rnd() * 15, 0) });
      dinamik.add(para);
    }
    let sure = 0;
    animasyonlar.push(dt => {
      sure += dt;
      liste.forEach(({ para, h, d }) => {
        h.y -= 9.8 * dt;
        para.position.addScaledVector(h, dt);
        para.rotation.x += d.x * dt;
        para.rotation.y += d.y * dt;
        if (para.position.y < 0.02) {
          para.position.y = 0.02;
          h.multiplyScalar(0.3);
          h.y = Math.abs(h.y);
        }
      });
      return sure < 3;
    });
  }

  // Yanlış sandık: içinden mor ahtapot kolları kıvrılarak çıkar, sonra geri çekilir
  async function kollar(p) {
    const malz = new THREE.MeshStandardMaterial({ color: 0x6b2a7a, roughness: 0.5, emissive: 0x1a0020 });
    const vantuz = new THREE.MeshStandardMaterial({ color: 0xe0a0d0, roughness: 0.6 });
    const kure = new THREE.SphereGeometry(1, 10, 8);
    const kolListesi = [0, 1, 2, 3].map(k => {
      const parcalar = [];
      for (let s = 0; s < 14; s++) {
        const m = new THREE.Mesh(kure, s % 3 === 1 ? vantuz : malz);
        m.scale.setScalar(0.07 * (1 - s / 16));
        m.castShadow = true;
        dinamik.add(m);
        parcalar.push(m);
      }
      return { parcalar, aci: (k / 4) * Math.PI * 2 + 0.4 };
    });
    await animasyon(2.4, (t, ham) => {
      const boy = Math.sin(Math.min(1, ham * 1.6) * Math.PI / 2) * (ham > 0.75 ? 1 - (ham - 0.75) * 4 : 1);
      kolListesi.forEach(({ parcalar, aci }, k) => {
        parcalar.forEach((m, s) => {
          const u = s / parcalar.length;
          const yukseklik = u * 1.3 * boy;
          const kivrim = Math.sin(u * 5 + ham * 12 + k) * 0.18 * u;
          m.position.set(
            p.x + Math.cos(aci) * (0.1 + u * 0.35 * boy) + Math.cos(aci + 1.57) * kivrim,
            0.25 + yukseklik,
            p.z + Math.sin(aci) * (0.1 + u * 0.35 * boy) + Math.sin(aci + 1.57) * kivrim,
          );
          m.visible = boy > 0.02;
        });
      });
    }, dogrusal);
    kolListesi.forEach(({ parcalar }) => parcalar.forEach(m => dinamik.remove(m)));
  }

  // Haritaya bakan oyuncuya özel: sandığın üstünde kısa bir parıltı
  function hedefParlat(i, altin) {
    const h = hedefler[i];
    if (!h) return;
    const isik = new THREE.PointLight(altin ? 0xffd040 : 0x8080ff, 0, 3, 1.2);
    isik.position.set(h.p.x, 0.8, h.p.z);
    dinamik.add(isik);
    animasyon(2.5, (t, ham) => (isik.intensity = Math.sin(ham * Math.PI) * 15), dogrusal).then(() => dinamik.remove(isik));
  }

  // Haritaya bakıldığında herkese: hangi X'e bakıldığı belli olsun (içi değil).
  // Sandığın etrafında beyaz bir halka yanıp söner, üstünde bir büyüteç belirir.
  function hedefGoster(i) {
    const h = hedefler[i];
    if (!h) return;
    const halka = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.5, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    halka.rotation.x = -Math.PI / 2;
    halka.position.set(h.p.x, 0.05, h.p.z);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.font = '96px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🔍', 64, 70);
    const doku = new THREE.CanvasTexture(c);
    const buyutec = new THREE.Sprite(new THREE.SpriteMaterial({ map: doku, transparent: true, depthTest: false }));
    buyutec.scale.set(0.6, 0.6, 1);
    buyutec.position.set(h.p.x, 0.9, h.p.z);
    dinamik.add(halka, buyutec);
    animasyon(3, (t, ham) => {
      const nabiz = 0.5 + 0.5 * Math.sin(ham * Math.PI * 6);
      halka.material.opacity = (1 - ham * 0.7) * (0.4 + 0.6 * nabiz);
      halka.scale.setScalar(1 + nabiz * 0.15);
      buyutec.position.y = 0.9 + Math.sin(ham * Math.PI * 4) * 0.08;
      buyutec.material.opacity = ham > 0.8 ? (1 - ham) * 5 : 1;
    }, dogrusal).then(() => dinamik.remove(halka, buyutec));
  }

  // ---------- İşaretler ve önizleme ----------
  function isaretle(hucreler, renk = 0x50ff70) {
    while (isaretGrubu.children.length) isaretGrubu.remove(isaretGrubu.children[0]);
    const malz = new THREE.MeshBasicMaterial({ color: renk, transparent: true, opacity: 0.35, depthWrite: false });
    hucreler.forEach(({ x, y }) => {
      const kare = new THREE.Mesh(new THREE.PlaneGeometry(K * 0.9, K * 0.9), malz);
      kare.rotation.x = -Math.PI / 2;
      const p = hucreKonum(x, y);
      kare.position.set(p.x, karolar.has(anahtar(x, y)) ? 0.1 : 0.02, p.z);
      isaretGrubu.add(kare);
    });
  }

  function hayaletGoster(x, y, acik, merkez, cevrik) {
    if (hayalet) dinamik.remove(hayalet);
    hayalet = null;
    if (x === null || x === undefined) return;
    hayalet = karoGrubu(karoKanvasi(acik, merkez), cevrik);
    hayalet.traverse(o => {
      if (o.material) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.65;
      }
    });
    const p = hucreKonum(x, y);
    hayalet.position.set(p.x, 0.12, p.z);
    dinamik.add(hayalet);
  }

  // ---------- Kamera ----------
  // Yatay ekranda tahtaya güneyden bakılır (başlangıç solda, sandıklar sağda).
  // Dik telefonda batıdan bakılır: başlangıç aşağıda, sandıklar yukarıda; tahta ekrana daha iyi sığar.
  function genelKonum() {
    const a = kamera.aspect;
    if (a < 0.85) {
      const k = Math.max(1, 0.62 / a);
      return V(-8.2 * k, 10.5 * k, 0);
    }
    const k = Math.max(1.08, 1.5 / a);
    return V(0, 10 * k, 7.2 * k);
  }
  // Tahta ekranda biraz yukarıda dursun: alttaki kartlar ve mesaj alt sıraları kapatmasın
  const genelHedef = () => (kamera.aspect < 0.85 ? V(1.6, 0, 0) : V(0, 0, 1.3));

  function boyutla() {
    const g = window.innerWidth, y = window.innerHeight;
    renderer.setSize(g, y);
    kamera.aspect = g / y;
    kamera.updateProjectionMatrix();
    bakis.konum.copy(genelKonum());
    bakis.hedef.copy(genelHedef());
  }

  // ---------- Fare / dokunma ----------
  function hucreBul(e) {
    const kutu = renderer.domElement.getBoundingClientRect();
    fare.set(((e.clientX - kutu.left) / kutu.width) * 2 - 1, -((e.clientY - kutu.top) / kutu.height) * 2 + 1);
    isin.setFromCamera(fare, kamera);
    const vurulan = isin.intersectObject(tiklamaPlani, false)[0];
    if (!vurulan) return null;
    const x = Math.round(vurulan.point.x / K + (SUTUN - 1) / 2);
    const y = Math.round(vurulan.point.z / K + (SATIR - 1) / 2);
    return x >= 0 && x < SUTUN && y >= 0 && y < SATIR ? { x, y } : null;
  }

  function fareDinle(el) {
    let basX = 0, basY = 0;
    el.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const h = hucreBul(e);
      if ((h?.x ?? -1) !== (uzerinde?.x ?? -1) || (h?.y ?? -1) !== (uzerinde?.y ?? -1)) {
        uzerinde = h;
        uzerineGelince(h);
      }
    });
    el.addEventListener('pointerdown', e => {
      basX = e.clientX;
      basY = e.clientY;
    });
    el.addEventListener('pointerup', e => {
      if (Math.hypot(e.clientX - basX, e.clientY - basY) > 10) return;
      const h = hucreBul(e);
      if (h) tiklaninca(h, e.pointerType);
    });
  }

  // ---------- Her kare ----------
  function dongu() {
    const dt = Math.min(saat.getDelta(), 0.05);
    const z = saat.elapsedTime;
    for (let k = animasyonlar.length - 1; k >= 0; k--) {
      if (animasyonlar[k] && animasyonlar[k](dt) === false) animasyonlar.splice(k, 1);
    }

    // Dalgalar
    const konum = deniz.geometry.attributes.position.array;
    for (let i = 0; i < konum.length; i += 3) {
      const x = denizIlk[i], zz = denizIlk[i + 2];
      konum[i + 1] = Math.sin(x * 0.35 + z * 1.1) * 0.12 + Math.cos(zz * 0.3 + z * 0.9) * 0.1;
    }
    deniz.geometry.attributes.position.needsUpdate = true;
    deniz.geometry.computeVertexNormals();

    // Rüzgârda sallanan palmiyeler ve bayrak
    palmiyeler.forEach(p => {
      p.yapraklar.rotation.z = Math.sin(z * 1.2 + p.faz) * 0.05;
      p.yapraklar.rotation.x = Math.cos(z * 0.9 + p.faz) * 0.04;
    });
    if (bayrak) {
      const b = bayrak.mesh.geometry.attributes.position.array;
      for (let i = 0; i < b.length; i += 3) {
        const u = (bayrak.ilk[i] + 0.3) / 0.6;
        b[i + 2] = Math.sin(bayrak.ilk[i] * 8 - z * 6) * 0.05 * u;
      }
      bayrak.mesh.geometry.attributes.position.needsUpdate = true;
    }

    kamera.position.copy(bakis.konum);
    if (sarsinti > 0) {
      kamera.position.x += (rnd() - 0.5) * sarsinti;
      kamera.position.y += (rnd() - 0.5) * sarsinti;
      sarsinti = Math.max(0, sarsinti - dt * 0.6);
    }
    kamera.lookAt(bakis.hedef);
    renderer.render(sahne, kamera);
  }

  return {
    SUTUN, SATIR,
    baslat, sifirla, baslangicKur, hedefKur, karoKoy, karoPatlat, hedefAc, hedefParlat, hedefGoster,
    dikMi: () => kamera.aspect < 0.85,
    isaretle, hayaletGoster, karoResmi,
    hizli(acik) { hizliMod = acik; },
    tiklayinca(fn) { tiklaninca = fn; },
    uzerineGelinince(fn) { uzerineGelince = fn; },
  };
})();
