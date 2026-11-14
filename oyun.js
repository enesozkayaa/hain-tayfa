// =============================================================
// Hain Tayfa - oyun kuralları ve ekranlar
// Korsanlar adada iskeleden 3 X işaretine doğru yol açar; birinin altında hazine sandığı var.
// Aralarına gizlenmiş hainler (🐀) yolu sabote eder. Yol hazineye ulaşırsa sadık tayfa kazanır,
// kartlar biterse hainler kazanır.
//
// Online için (Lanetli Vazolar'daki gibi): oyun bütün telefonlarda aynı "tohum"la çalışır.
// Her hamle bir "girdi" olur ve oda sahibi üzerinden herkese aynı sırayla gider.
// =============================================================

const RENKLER = [
  { ad: 'Kırmızı', hex: '#e23b3b' },
  { ad: 'Mavi', hex: '#3b82f6' },
  { ad: 'Yeşil', hex: '#22c55e' },
  { ad: 'Sarı', hex: '#facc15' },
  { ad: 'Mor', hex: '#a855f7' },
  { ad: 'Turuncu', hex: '#f97316' },
];
const ALETLER = {
  kazma: { ikon: '⛏️', ad: 'Kazma' },
  fener: { ikon: '🏮', ad: 'Fener' },
  pusula: { ikon: '🧭', ad: 'Pusula' },
};
const BASLANGIC = { x: 0, y: 3 };
const HEDEFLER = [{ x: 8, y: 1 }, { x: 8, y: 3 }, { x: 8, y: 5 }];
const HEDEF_ADLARI = ['üstteki', 'ortadaki', 'alttaki'];
const ISIM_ANAHTARI = 'hainTayfa.isimler';

// Yol kartları: [açık kenarlar (K=kuzey D=doğu G=güney B=batı), yol ortadan geçiyor mu, adet]
// Ortadan geçmeyenler "çıkmaz yol": kenarlara uyar ama yolu keser.
const YOL_KARTLARI = [
  ['DB', true, 4], ['KG', true, 3], ['KDGB', true, 5], ['KDB', true, 5], ['KDG', true, 5], ['DG', true, 4], ['GB', true, 5],
  ['KDGB', false, 1], ['KDB', false, 1], ['KDG', false, 1], ['DB', false, 1], ['KG', false, 1], ['DG', false, 1], ['GB', false, 1], ['D', false, 1], ['K', false, 1],
];
const YON = 'KDGB';
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

// Bu cihazın rolü: yerel (tek telefon), ev (odayı açan), misafir (katılan). ag.js değiştirir.
const AG = { mod: 'yerel', benimNo: 0 };
const HIZLI = { acik: false };

const $ = id => document.getElementById(id);
const bekle = ms => (HIZLI.acik ? Promise.resolve() : new Promise(coz => setTimeout(coz, ms)));

// Tohumlu rastgele sayı: aynı tohum, her telefonda aynı sayı dizisi
let tohum = 1;
function rastgele() {
  tohum = (tohum + 0x6d2b79f5) | 0;
  let t = Math.imul(tohum ^ (tohum >>> 15), 1 | tohum);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function karistir(liste) {
  for (let i = liste.length - 1; i > 0; i--) {
    const j = Math.floor(rastgele() * (i + 1));
    [liste[i], liste[j]] = [liste[j], liste[i]];
  }
  return liste;
}

const durum = {
  asama: 'menu',      // menu | rol | oyun | bitti
  oyuncular: [],      // { ad, hex, hain, el: [kart], aletler: { kazma, fener, pusula }, koptu }
  tahta: new Map(),   // "x,y" → { tip: yol | baslangic | hedef, acik: [K,D,G,B], merkez, gizli, no }
  hedefler: [],       // { x, y, altin, acildi }
  deste: [],
  sira: 0,
  secili: -1,         // seçili kartın eldeki sırası
  cevrik: false,      // yol kartı ters çevrildi mi
  hainAyari: 'rastgele',
  oyuncuSayisi: 4,
  hazir: null,
  adim: 0,
  kuyruk: [],
  isleniyor: false,
};

const aktif = () => durum.oyuncular[durum.sira];
const cevrimici = () => AG.mod !== 'yerel';
const benimSiram = () => !cevrimici() || durum.sira === AG.benimNo;
const ben = () => durum.oyuncular[cevrimici() ? AG.benimNo : durum.sira];
const guvenli = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const adEtiketi = o => `<span style="color:${o.hex}">${guvenli(o.ad)}</span>`;

// Türkçe ekler: "Mavi'de", "Ali'nin", "Ali'ye"
function kalinMi(kelime) {
  const unluler = kelime.toLocaleLowerCase('tr').match(/[aeıioöuü]/g) || ['e'];
  return 'aıou'.includes(unluler[unluler.length - 1]);
}
function sonUnlu(kelime) {
  const unluler = kelime.toLocaleLowerCase('tr').match(/[aeıioöuü]/g) || ['e'];
  return unluler[unluler.length - 1];
}
const ekDa = ad => `'${/[fstkçşhp]$/i.test(ad) ? 't' : 'd'}${kalinMi(ad) ? 'a' : 'e'}`;
const ekA = ad => `'${/[aeıioöuü]$/i.test(ad) ? 'y' : ''}${kalinMi(ad) ? 'a' : 'e'}`;
// Alet adına iyelik eki: "kazmasını / fenerini" (belirtme) ve "kazması / feneri" (yalın)
const aletBelirtme = a => ALETLER[a].ad.toLocaleLowerCase('tr') + (/[aeıioöuü]$/.test(a) ? (kalinMi(a) ? 'sını' : 'sini') : (kalinMi(a) ? 'ını' : 'ini'));
const aletYalin = a => ALETLER[a].ad.toLocaleLowerCase('tr') + (/[aeıioöuü]$/.test(a) ? (kalinMi(a) ? 'sı' : 'si') : (kalinMi(a) ? 'ı' : 'i'));
const ekNin = ad => {
  const u = { a: 'ı', ı: 'ı', o: 'u', u: 'u', e: 'i', i: 'i', ö: 'ü', ü: 'ü' }[sonUnlu(ad)];
  return `'${/[aeıioöuü]$/i.test(ad) ? 'n' : ''}${u}n`;
};

// ---------- Tahta yardımcıları ----------
const anahtar = (x, y) => `${x},${y}`;
const hucre = (x, y) => durum.tahta.get(anahtar(x, y));
const tahtadaMi = (x, y) => x >= 0 && x < Sahne.SUTUN && y >= 0 && y < Sahne.SATIR;
const kenarlar = harfler => [...YON].map(h => harfler.includes(h));
const cevir = (acik, cevrik) => (cevrik ? [acik[2], acik[3], acik[0], acik[1]] : acik);

// İskeleden yürüyerek nerelere gidilebilir? Hazineye ulaşmak için çıkmaz yoldan öteye geçilemez.
// gecirgen: yol koyarken çıkmaz yollar engel sayılmaz; böylece kayanın arkasına da yol döşenebilir
// (sonradan kaya top güllesiyle uçurulup yerine düz yol konunca yol birleşir).
function ulasim(gecirgen = false) {
  const gecilen = new Set([anahtar(BASLANGIC.x, BASLANGIC.y)]);
  const sira = [BASLANGIC];
  const hedefler = new Set();
  while (sira.length) {
    const { x, y } = sira.shift();
    const h = hucre(x, y);
    for (let s = 0; s < 4; s++) {
      if (!h.acik[s]) continue;
      const nx = x + DX[s], ny = y + DY[s];
      const n = hucre(nx, ny);
      if (!n) continue;
      if (n.tip === 'hedef' && n.gizli) {
        hedefler.add(n.no);
        continue;
      }
      if (!n.acik[(s + 2) % 4] || (!n.merkez && !gecirgen) || gecilen.has(anahtar(nx, ny))) continue;
      gecilen.add(anahtar(nx, ny));
      sira.push({ x: nx, y: ny });
    }
  }
  return { gecilen, hedefler };
}

// Bu yol kartı buraya konabilir mi? Kenarlar komşularla uymalı ve iskeleye bağlanmalı.
function yerUygunMu(x, y, acik, gecilen = ulasim(true).gecilen) {
  if (!tahtadaMi(x, y) || hucre(x, y)) return false;
  let bagli = false;
  for (let s = 0; s < 4; s++) {
    const nx = x + DX[s], ny = y + DY[s];
    const n = hucre(nx, ny);
    if (!n || (n.tip === 'hedef' && n.gizli)) continue;
    if (acik[s] !== n.acik[(s + 2) % 4]) return false;
    if (acik[s] && gecilen.has(anahtar(nx, ny))) bagli = true;
  }
  return bagli;
}

function uygunYerler(kart, cevrik) {
  const { gecilen } = ulasim(true);
  const acik = cevir(kart.acik, cevrik);
  const liste = [];
  for (let y = 0; y < Sahne.SATIR; y++) {
    for (let x = 0; x < Sahne.SUTUN; x++) if (yerUygunMu(x, y, acik, gecilen)) liste.push({ x, y });
  }
  return liste;
}

const aletlerTamam = o => Object.values(o.aletler).every(Boolean);
const kirilabilir = (o, alet, no) => no !== durum.sira && durum.oyuncular[no].aletler[alet];
const tamirEdilecek = (kart, o) => kart.aletler.find(a => !o.aletler[a]);

// ---------- Deste ----------
function desteKur(ayar = {}) {
  const sayi = (v, varsayilan) => Math.max(0, Math.min(10, Number.isFinite(+v) && v !== '' && v != null ? +v : varsayilan));   // oda sahibinin seçtiği adet
  const deste = [];
  YOL_KARTLARI.forEach(([harfler, merkez, adet]) => {
    for (let n = 0; n < adet; n++) deste.push({ tur: 'yol', acik: kenarlar(harfler), merkez });
  });
  Object.keys(ALETLER).forEach(alet => {
    for (let n = 0; n < 3; n++) deste.push({ tur: 'kir', alet });
    for (let n = 0; n < 2; n++) deste.push({ tur: 'tamir', aletler: [alet] });
  });
  [['kazma', 'fener'], ['fener', 'pusula'], ['kazma', 'pusula']].forEach(aletler => deste.push({ tur: 'tamir', aletler }));
  for (let n = 0; n < sayi(ayar.top, 4); n++) deste.push({ tur: 'top' });
  for (let n = 0; n < sayi(ayar.harita, 3); n++) deste.push({ tur: 'harita' });
  return karistir(deste);
}

// ---------- Girdiler: her hamle buradan geçer ----------
function girdi(tip, veri = {}, no = cevrimici() ? AG.benimNo : durum.sira) {
  const g = { tip, no, adim: durum.adim, ...veri };
  if (cevrimici()) Ag.girdiGonder(g);
  else girdiAl(g);
}

function girdiAl(g) {
  durum.kuyruk.push(g);
  kuyrukIsle();
}

function kuyrukIsle() {
  if (durum.isleniyor) return;
  durum.isleniyor = true;
  while (durum.kuyruk.length) {
    const g = durum.kuyruk[0];
    if (g.adim > durum.adim) break;  // bu telefon o adıma henüz gelmedi (animasyon sürüyor): bekle
    durum.kuyruk.shift();
    if (g.adim < durum.adim || !durum.hazir) continue;  // eski ya da tekrar eden girdi
    if (!['oyna', 'at'].includes(g.tip) || g.no !== durum.sira) continue;
    durum.hazir = null;
    if (g.tip === 'oyna') oyna(g);
    else at(g);
  }
  durum.isleniyor = false;
}

function hazirOl() {
  durum.hazir = 'tur';
  durum.adim++;
  if (HIZLI.acik && !durum.kuyruk.length) hizliBitir();
  if (cevrimici()) Ag.hazirOldu();
  kuyrukIsle();
}

function hizliBitir() {
  HIZLI.acik = false;
  Sahne.hizli(false);
  Ses.sustur(false);
  $('baglantiEkrani').hidden = true;
}

// ---------- Menü ----------
function menuKur() {
  let kayitli = [];
  try {
    kayitli = JSON.parse(localStorage.getItem(ISIM_ANAHTARI)) || [];
  } catch (e) { /* ilk kez oynanıyor */ }

  const sayilar = $('oyuncuSayisi');
  [2, 3, 4, 5, 6].forEach(n => {
    const b = document.createElement('button');
    b.textContent = n;
    b.onclick = () => {
      durum.oyuncuSayisi = n;
      isimleriCiz();
    };
    sayilar.appendChild(b);
  });

  function isimleriCiz() {
    [...sayilar.children].forEach(b => b.classList.toggle('secili', +b.textContent === durum.oyuncuSayisi));
    const kutu = $('isimler');
    const eski = [...kutu.querySelectorAll('input')].map(i => i.value);
    kutu.innerHTML = '';
    for (let k = 0; k < durum.oyuncuSayisi; k++) {
      const satir = document.createElement('label');
      satir.className = 'isimSatiri';
      satir.innerHTML = `<span class="nokta" style="background:${RENKLER[k].hex}"></span>`;
      const giris = document.createElement('input');
      giris.maxLength = 12;
      giris.placeholder = RENKLER[k].ad;
      giris.value = eski[k] ?? kayitli[k] ?? '';
      satir.appendChild(giris);
      kutu.appendChild(satir);
    }
    hainSecenekleri($('yerelHain'), durum.oyuncuSayisi);
  }
  isimleriCiz();

  $('baslaBtn').onclick = () => {
    const isimler = [...$('isimler').querySelectorAll('input')].map((g, k) => g.value.trim() || RENKLER[k].ad);
    try {
      localStorage.setItem(ISIM_ANAHTARI, JSON.stringify(isimler));
    } catch (e) { /* kaydedilemezse sorun değil */ }
    oyunuBaslat(isimler, Math.floor(Math.random() * 2 ** 31), { hain: $('yerelHain').value, top: $('yerelTop').value, harita: $('yerelHarita').value });
  };
  $('tekrarBtn').onclick = menuyeDon;
  $('sesBtn').onclick = () => sesDugmesi(Ses.acKapa());
  $('menuBtn').onclick = () => {
    Ses.secim();
    $('cikisMetni').textContent = cevrimici()
      ? 'Emin misin? Online oyundan çıkacaksın. Aynı oda kodu ve aynı adla geri girebilirsin.'
      : 'Emin misin? Bu oyun silinecek.';
    $('cikisEkrani').hidden = false;
  };
  $('cikisHayir').onclick = () => ($('cikisEkrani').hidden = true);
  $('cikisEvet').onclick = menuyeDon;
  $('rolBtn').onclick = () => rolGoster(ben());
  sesDugmesi(Ses.acik);
}

// Hain sayısı seçenekleri: "Rastgele" (kimse kaç hain olduğunu bilmez) ya da 0..(kişi-1)
function hainSecenekleri(secim, kisi) {
  const onceki = secim.value || 'rastgele';
  secim.innerHTML = '<option value="rastgele">🎲 Rastgele (gizli)</option>'
    + Array.from({ length: kisi }, (_, h) => `<option value="${h}">${h} hain</option>`).join('');
  secim.value = [...secim.options].some(o => o.value === onceki) ? onceki : 'rastgele';
}

function sesDugmesi(acik) {
  $('sesBtn').textContent = acik ? '🔊' : '🔇';
}

function menuyeDon() {
  try {
    sessionStorage.removeItem('hainTayfa.otomatikKatil');
  } catch (e) { /* zaten yoksa sorun değil */ }
  location.reload();
}

// ---------- Oyunun başlaması ----------
function hainSayisi(ayar, n) {
  if (ayar !== 'rastgele') return Math.max(0, Math.min(n - 1, Number(ayar) || 0));
  const secenekler = n <= 3 ? [0, 1, 1] : n <= 5 ? [1, 1, 2] : [1, 2, 2];
  return secenekler[Math.floor(rastgele() * secenekler.length)];
}

function oyunuBaslat(isimler, yeniTohum, ayar) {
  Ses.ortamBaslat();
  tohum = yeniTohum;
  const n = isimler.length;
  const hainler = new Set(karistir([...Array(n).keys()]).slice(0, hainSayisi(ayar.hain, n)));
  durum.oyuncular = isimler.map((ad, k) => ({
    ad, hex: RENKLER[k].hex, hain: hainler.has(k), el: [], koptu: false,
    aletler: { kazma: true, fener: true, pusula: true },
  }));
  Object.assign(durum, { tahta: new Map(), sira: 0, secili: -1, cevrik: false, hazir: null, adim: 0, kuyruk: [], isleniyor: false });
  durum.hainAyari = ayar.hain;

  // Tahta: iskele ve 3 gizli hedef (biri hazine)
  const altin = Math.floor(rastgele() * 3);
  durum.hedefler = HEDEFLER.map((h, i) => ({ ...h, altin: i === altin, acildi: false }));
  Sahne.sifirla();
  durum.tahta.set(anahtar(BASLANGIC.x, BASLANGIC.y), { tip: 'baslangic', acik: [true, true, true, true], merkez: true });
  Sahne.baslangicKur(BASLANGIC.x, BASLANGIC.y);
  durum.hedefler.forEach((h, i) => {
    durum.tahta.set(anahtar(h.x, h.y), { tip: 'hedef', gizli: true, no: i, acik: [true, true, true, true], merkez: true });
    Sahne.hedefKur(i, h.x, h.y);
  });

  // Kartları dağıt
  durum.deste = desteKur(ayar);
  const elBoyu = n <= 5 ? 6 : 5;
  durum.oyuncular.forEach(o => (o.el = durum.deste.splice(-elBoyu)));

  $('menu').hidden = true;
  $('menuBtn').hidden = false;
  $('rolBtn').hidden = false;
  oyunculariCiz();
  if (cevrimici()) {
    durum.asama = 'oyun';
    if (!HIZLI.acik) rolGoster(ben());
    siraBasla();
  } else {
    rolleriSiraylaGoster(0);
  }
}

// Tek telefonda: herkes sırayla, diğerleri bakmadan rolünü görür
async function rolleriSiraylaGoster(no) {
  durum.asama = 'rol';
  if (no >= durum.oyuncular.length) {
    durum.asama = 'oyun';
    durum.sira = 0;
    siraBasla();
    return;
  }
  const o = durum.oyuncular[no];
  durum.sira = no;
  await perde(`🏴‍☠️ ${adEtiketi(o)}, rolünü gör`, `Telefonu ${o.ad}${ekA(o.ad)} ver. Diğerleri bakmasın!`, `Ben ${o.ad}, göster`);
  await rolGoster(o);
  rolleriSiraylaGoster(no + 1);
}

function rolGoster(o) {
  return new Promise(coz => {
    const hainMi = o.hain;
    $('rolKarti').className = 'rolKarti ' + (hainMi ? 'hain' : 'tayfa');
    $('rolKarti').innerHTML = hainMi
      ? `<div class="ikon">🐀</div><h2>HAİN</h2><p>Tayfaya yardım ediyormuş gibi yap ama hazineye giden yolu gizlice boz! Kartlar biterse sen kazanırsın.</p>`
      : `<div class="ikon">🏴‍☠️</div><h2>SADIK TAYFA</h2><p>Arkadaşlarınla iskeleden hazineye giden yolu aç. Ama dikkat: aranızda hain olabilir!</p>`;
    $('rolNot').textContent = durum.hainAyari === 'rastgele' ? '🎲 Kaç hain olduğu gizli. Hiç olmayabilir de!' : `Bu oyunda ${durum.hainAyari} hain var.`;
    $('rolEkrani').hidden = false;
    $('rolTamam').onclick = () => {
      $('rolEkrani').hidden = true;
      Ses.secim();
      coz();
    };
  });
}

function perde(baslik, aciklama, dugme) {
  return new Promise(coz => {
    $('perdeBaslik').innerHTML = baslik;
    $('perdeAciklama').textContent = aciklama;
    $('perdeBtn').textContent = dugme;
    $('perde').hidden = false;
    $('perdeBtn').onclick = () => {
      $('perde').hidden = true;
      Ses.secim();
      coz();
    };
  });
}

// ---------- Tur ----------
async function siraBasla() {
  durum.secili = -1;
  durum.cevrik = false;
  Sahne.isaretle([]);
  Sahne.hayaletGoster(null);
  oyunculariCiz();
  desteyiCiz();
  const o = aktif();
  if (!cevrimici()) {
    $('el').hidden = true;
    hazirOl();
    await perde(`Sıra ${adEtiketi(o)}${ekDa(o.ad)}`, `Telefonu ${o.ad}${ekA(o.ad)} ver. Diğerleri onun kartlarına bakmasın!`, `Ben ${o.ad}, hazırım`);
  } else {
    hazirOl();
  }
  if (durum.asama !== 'oyun') return;
  if (benimSiram()) Ses.sira();
  mesaj(benimSiram()
    ? `${cevrimici() ? 'Sıra sende' : `Sıra ${adEtiketi(o)}${ekDa(o.ad)}`}! Bir kart seç ve oyna ya da işine yaramayan bir kartı at.`
    : `Sıra ${adEtiketi(o)}${ekDa(o.ad)}...`);
  eliCiz();
}

// Hamle geçerli mi? (herkeste aynı sonucu verir)
function hamleGecerli(o, kart, g) {
  if (kart.tur === 'yol') return aletlerTamam(o) && yerUygunMu(g.x, g.y, cevir(kart.acik, !!g.cevrik));
  if (kart.tur === 'kir') return Number.isInteger(g.hedef) && !!durum.oyuncular[g.hedef] && kirilabilir(o, kart.alet, g.hedef);
  if (kart.tur === 'tamir') return Number.isInteger(g.hedef) && !!durum.oyuncular[g.hedef] && !!tamirEdilecek(kart, durum.oyuncular[g.hedef]);
  if (kart.tur === 'top') return hucre(g.x, g.y)?.tip === 'yol';
  if (kart.tur === 'harita') return !!durum.hedefler[g.hedef] && !durum.hedefler[g.hedef].acildi;
  return false;
}

async function oyna(g) {
  const o = durum.oyuncular[g.no];
  const kart = o.el[g.k];
  if (!kart || !hamleGecerli(o, kart, g)) {
    hazirOl();
    return;
  }
  o.el.splice(g.k, 1);
  isaretleriTemizle();
  Ses.kart();

  if (kart.tur === 'yol') {
    const acik = cevir(kart.acik, !!g.cevrik);
    durum.tahta.set(anahtar(g.x, g.y), { tip: 'yol', acik, merkez: kart.merkez });
    mesaj(`${adEtiketi(o)} ${kart.merkez ? 'yol açtı' : 'bir yol koydu... ama ortası kayalık!'}`);
    await Sahne.karoKoy(g.x, g.y, kart.acik, kart.merkez, !!g.cevrik);
    await hedefleriKontrolEt(g.no);
  } else if (kart.tur === 'kir') {
    const h = durum.oyuncular[g.hedef];
    h.aletler[kart.alet] = false;
    Ses.kirildi();
    oyunculariCiz();
    mesaj(`💥 ${adEtiketi(o)}, ${adEtiketi(h)}${ekNin(h.ad)} ${ALETLER[kart.alet].ikon} ${aletBelirtme(kart.alet)} kırdı! ${adEtiketi(h)} tamir edene kadar yol koyamaz.`);
    await bekle(1400);
  } else if (kart.tur === 'tamir') {
    const h = durum.oyuncular[g.hedef];
    const alet = tamirEdilecek(kart, h);
    h.aletler[alet] = true;
    Ses.tamir();
    oyunculariCiz();
    const kimin = h === o ? 'kendi' : `${adEtiketi(h)}${ekNin(h.ad)}`;
    mesaj(`🔧 ${adEtiketi(o)}, ${kimin} ${ALETLER[alet].ikon} ${aletBelirtme(alet)} tamir etti.`);
    await bekle(1200);
  } else if (kart.tur === 'top') {
    durum.tahta.delete(anahtar(g.x, g.y));
    mesaj(`💣 ${adEtiketi(o)} top güllesiyle bir yolu havaya uçurdu!`);
    await Sahne.karoPatlat(g.x, g.y);
  } else if (kart.tur === 'harita') {
    const h = durum.hedefler[g.hedef];
    Ses.harita();
    const goren = cevrimici() ? g.no === AG.benimNo : true;
    if (goren && !HIZLI.acik) {
      Sahne.hedefParlat(g.hedef, h.altin);
      await haritaGoster(g.hedef, h.altin);
    } else {
      // Diğerleri neye bakıldığını görür (içini değil)
      Sahne.hedefGoster(g.hedef);
      mesaj(`🗺️ ${adEtiketi(o)} eski haritayla <b>${HEDEF_ADLARI[g.hedef]}</b> X işaretinin altına baktı 🔍 Ne gördü acaba?`);
      await bekle(3000);
    }
  }
  if (durum.asama !== 'oyun') return;
  kartCek(o);
  await bekle(400);
  sonrakiOyuncu();
}

async function at(g) {
  const o = durum.oyuncular[g.no];
  if (!o.el[g.k]) {
    hazirOl();
    return;
  }
  o.el.splice(g.k, 1);
  isaretleriTemizle();
  Ses.kart();
  mesaj(`🗑️ ${adEtiketi(o)} bir kartı denize attı.`);
  kartCek(o);
  await bekle(900);
  sonrakiOyuncu();
}

function kartCek(o) {
  if (durum.deste.length) o.el.push(durum.deste.pop());
  oyunculariCiz();
  desteyiCiz();
}

// Yol bir X işaretine ulaştı mı? Ulaştıysa sandık açılır.
async function hedefleriKontrolEt(no) {
  for (;;) {
    const { hedefler } = ulasim();
    if (!hedefler.size) return;
    const i = [...hedefler].sort()[0];
    const h = durum.hedefler[i];
    h.acildi = true;
    const c = hucre(h.x, h.y);
    c.gizli = false;
    mesaj(`❌ Yol ${HEDEF_ADLARI[i]} X işaretine ulaştı! Kazılıyor...`);
    await Sahne.hedefAc(i, h.altin);
    if (h.altin) {
      bitir('tayfa');
      return;
    }
    // Yanlış sandık: içinden ahtapot çıkar ve yolu açanın bir aleti kırılır
    const o = durum.oyuncular[no];
    const saglam = Object.keys(o.aletler).filter(a => o.aletler[a]);
    if (saglam.length) {
      const alet = saglam[Math.floor(rastgele() * saglam.length)];
      o.aletler[alet] = false;
      oyunculariCiz();
      mesaj(`🐙 Boş sandık... ve içinden ahtapot çıktı! ${adEtiketi(o)}${ekNin(o.ad)} ${ALETLER[alet].ikon} ${aletYalin(alet)} kırıldı.`);
    } else {
      mesaj('🐙 Boş sandık... ve içinden ahtapot çıktı!');
    }
    await bekle(1800);
  }
}

function sonrakiOyuncu() {
  if (durum.oyuncular.every(o => !o.el.length)) {
    bitir('hain');
    return;
  }
  const n = durum.oyuncular.length;
  do durum.sira = (durum.sira + 1) % n;
  while (!durum.oyuncular[durum.sira].el.length);
  siraBasla();
}

async function bitir(kazanan) {
  durum.asama = 'bitti';
  durum.hazir = null;
  if (HIZLI.acik) hizliBitir();
  isaretleriTemizle();
  $('el').hidden = true;
  $('eylemler').hidden = true;
  $('menuBtn').hidden = true;
  $('rolBtn').hidden = true;
  const hainler = durum.oyuncular.filter(o => o.hain);
  // Hainler kazandıysa hazinenin nerede olduğu da gösterilir
  if (kazanan === 'hain') {
    const i = durum.hedefler.findIndex(h => h.altin);
    mesaj('⌛ Kartlar bitti! Hazine aslında şuradaymış...');
    await Sahne.hedefAc(i, true);
  }
  const benHainMiyim = cevrimici() ? ben().hain : null;
  const kazandim = benHainMiyim === null ? null : (kazanan === 'hain') === benHainMiyim;
  if (kazandim === false) Ses.kaybetme();
  else Ses.kazanma();
  $('sonucBaslik').innerHTML = kazanan === 'tayfa'
    ? '🏴‍☠️ Sadık tayfa hazineyi buldu!'
    : hainler.length ? '🐀 Hainler kazandı! Hazineye ulaşılamadı.' : '🌊 Hazine bulunamadı... ve aranızda hain yoktu! 😅';
  $('sonucAciklama').innerHTML = `<ul class="rolListesi">${durum.oyuncular.map(o => `<li class="${o.hain ? 'hain' : ''}">${o.hain ? '🐀' : '🏴‍☠️'} ${adEtiketi(o)} — ${o.hain ? '<b>HAİN</b>' : 'sadık tayfa'}</li>`).join('')}</ul>`
    + (kazandim === null ? '' : kazandim ? '<p>🎉 Sen kazandın!</p>' : '<p>Bu sefer kaybettin.</p>');
  $('sonuc').hidden = false;
  mesaj('');
}

// ---------- Harita sonucu (sadece bakan kişiye) ----------
function haritaGoster(i, altin) {
  return new Promise(coz => {
    $('haritaMetni').innerHTML = `${HEDEF_ADLARI[i][0].toLocaleUpperCase('tr') + HEDEF_ADLARI[i].slice(1)} X işaretinin altında...<br><b class="${altin ? 'altin' : 'bos'}">${altin ? '💰 HAZİNE VAR!' : '🪨 Boş, sadece kum ve taş.'}</b>`;
    $('haritaNot').textContent = cevrimici()
      ? 'Bunu sadece sen gördün. İstersen söyle, istersen... yalan söyle. 🤫'
      : 'Bunu sadece sen gör, sonra telefonu sıradakine ver.';
    $('haritaEkrani').hidden = false;
    $('haritaTamam').onclick = () => {
      $('haritaEkrani').hidden = true;
      coz();
    };
  });
}

// ---------- Elimdeki kartlar ----------
function kartGorunumu(kart) {
  if (kart.tur === 'yol') {
    return `<img src="${Sahne.karoResmi(kart.acik, kart.merkez)}" alt="yol">${kart.merkez ? '' : '<span class="etiket">çıkmaz</span>'}`;
  }
  if (kart.tur === 'kir') return `<span class="buyuk">${ALETLER[kart.alet].ikon}</span><span class="etiket kirmizi">Kır</span>`;
  if (kart.tur === 'tamir') return `<span class="buyuk">${kart.aletler.map(a => ALETLER[a].ikon).join('')}</span><span class="etiket yesil">Tamir</span>`;
  if (kart.tur === 'top') return '<span class="buyuk">💣</span><span class="etiket">Top güllesi</span>';
  return '<span class="buyuk">🗺️</span><span class="etiket">Harita</span>';
}

function eliCiz() {
  const o = ben();
  const kutu = $('el');
  kutu.innerHTML = '';
  if (!o || durum.asama !== 'oyun') {
    kutu.hidden = true;
    return;
  }
  kutu.hidden = false;
  kutu.classList.toggle('pasif', !benimSiram());
  o.el.forEach((kart, k) => {
    const b = document.createElement('button');
    b.className = `kartEl ${kart.tur}${k === durum.secili ? ' secili' : ''}`;
    b.innerHTML = kartGorunumu(kart);
    // Kart resmi tahtanın ekrandaki yönüyle aynı dursun: telefon dikken tahta yan döner
    // (iskele aşağıda), o zaman kart resmi de 90 derece döndürülür
    if (kart.tur === 'yol') {
      const aci = (Sahne.dikMi() ? -90 : 0) + (k === durum.secili && durum.cevrik ? 180 : 0);
      if (aci) b.querySelector('img').style.transform = `rotate(${aci}deg)`;
    }
    b.onclick = () => kartSec(k);
    kutu.appendChild(b);
  });
  $('eylemler').hidden = !benimSiram() || durum.secili < 0;
  $('cevirBtn').hidden = o.el[durum.secili]?.tur !== 'yol';
}

function kartSec(k) {
  if (!benimSiram() || durum.hazir !== 'tur' || !$('perde').hidden) return;
  Ses.secim();
  if (durum.secili !== k) durum.cevrik = false;
  durum.secili = durum.secili === k ? -1 : k;
  eliCiz();
  secimiGoster();
}

// Seçili karta göre tahtada nereye oynanabileceğini göster
function secimiGoster() {
  const o = ben();
  const kart = o.el[durum.secili];
  Sahne.hayaletGoster(null);
  oyunculariCiz();
  if (!kart) {
    Sahne.isaretle([]);
    mesaj('Bir kart seç ve oyna ya da işine yaramayan bir kartı at.');
    return;
  }
  if (kart.tur === 'yol') {
    if (!aletlerTamam(o)) {
      Sahne.isaretle([]);
      mesaj('🔧 Bir aletin kırık! Tamir edilene kadar yol koyamazsın. Başka kart oyna ya da bu kartı at.');
      return;
    }
    const yerler = uygunYerler(kart, durum.cevrik);
    Sahne.isaretle(yerler);
    mesaj(yerler.length
      ? 'Yeşil karelerden birine dokun. Kartı ters çevirmek için ↻ Çevir.'
      : 'Bu kart şu an hiçbir yere uymuyor. ↻ Çevir\'i dene ya da kartı at.');
  } else if (kart.tur === 'kir') {
    Sahne.isaretle([]);
    mesaj(`Kimin ${ALETLER[kart.alet].ikon} aletini kıracaksın? Yukarıdan bir oyuncuya dokun.`);
  } else if (kart.tur === 'tamir') {
    Sahne.isaretle([]);
    mesaj('Kimin aletini tamir edeceksin? Yukarıdan bir oyuncuya dokun (kendin de olabilirsin).');
  } else if (kart.tur === 'top') {
    const yollar = [...durum.tahta.entries()].filter(([, h]) => h.tip === 'yol').map(([k]) => {
      const [x, y] = k.split(',').map(Number);
      return { x, y };
    });
    Sahne.isaretle(yollar, 0xff4030);
    mesaj(yollar.length ? '💣 Havaya uçuracağın yolu seç (kırmızı kareler).' : 'Tahtada uçurulacak yol yok. Kartı at.');
  } else {
    const hedefler = durum.hedefler.filter(h => !h.acildi).map(({ x, y }) => ({ x, y }));
    Sahne.isaretle(hedefler, 0xffd040);
    mesaj('🗺️ Altına bakmak istediğin X işaretine dokun. Sonucu sadece sen göreceksin.');
  }
}

function isaretleriTemizle() {
  durum.secili = -1;
  Sahne.isaretle([]);
  Sahne.hayaletGoster(null);
  $('eylemler').hidden = true;
  eliCiz();
}

function hucreTiklandi({ x, y }) {
  const o = ben();
  const kart = o?.el[durum.secili];
  if (!kart || !benimSiram() || durum.hazir !== 'tur') return;
  if (kart.tur === 'yol') {
    if (aletlerTamam(o) && yerUygunMu(x, y, cevir(kart.acik, durum.cevrik))) girdi('oyna', { k: durum.secili, x, y, cevrik: durum.cevrik });
    else Ses.hata();
  } else if (kart.tur === 'top') {
    if (hucre(x, y)?.tip === 'yol') girdi('oyna', { k: durum.secili, x, y });
    else Ses.hata();
  } else if (kart.tur === 'harita') {
    const i = durum.hedefler.findIndex(h => h.x === x && h.y === y && !h.acildi);
    if (i >= 0) girdi('oyna', { k: durum.secili, hedef: i });
    else Ses.hata();
  }
}

function oyuncuTiklandi(no) {
  const kart = ben()?.el[durum.secili];
  if (!kart || !benimSiram() || durum.hazir !== 'tur') return;
  if (kart.tur === 'kir' && kirilabilir(aktif(), kart.alet, no)) girdi('oyna', { k: durum.secili, hedef: no });
  else if (kart.tur === 'tamir' && tamirEdilecek(kart, durum.oyuncular[no])) girdi('oyna', { k: durum.secili, hedef: no });
  else Ses.hata();
}

// ---------- Ekran parçaları ----------
function oyunculariCiz() {
  const kart = benimSiram() ? ben()?.el[durum.secili] : null;
  $('oyuncular').innerHTML = durum.oyuncular.map((o, no) => {
    const aletler = Object.keys(ALETLER).map(a => `<span class="alet${o.aletler[a] ? '' : ' kirik'}">${ALETLER[a].ikon}</span>`).join('');
    const hedefOlur = kart && ((kart.tur === 'kir' && kirilabilir(aktif(), kart.alet, no)) || (kart.tur === 'tamir' && tamirEdilecek(kart, o)));
    const sinif = ['oyuncu', no === durum.sira && durum.asama === 'oyun' ? 'aktif' : '', hedefOlur ? 'hedefOlur' : '', o.koptu ? 'koptu' : ''].join(' ');
    const sen = cevrimici() && no === AG.benimNo ? ' <small>(sen)</small>' : '';
    return `<button class="${sinif}" style="--renk:${o.hex}" data-no="${no}"><span class="nokta"></span><b>${guvenli(o.ad)}</b>${sen}${o.koptu ? ' 📡' : ''}<span class="aletler">${aletler}</span><span class="kartSayisi">🃏${o.el.length}</span></button>`;
  }).join('');
  $('oyuncular').querySelectorAll('.oyuncu').forEach(b => (b.onclick = () => oyuncuTiklandi(+b.dataset.no)));
}

function desteyiCiz() {
  $('deste').hidden = durum.asama !== 'oyun';
  $('deste').textContent = `🃏 Destede ${durum.deste.length} kart`;
}

function mesaj(html) {
  $('mesaj').innerHTML = html;
  $('mesaj').hidden = !html;
}

// ---------- Başlangıç ----------
Sahne.baslat($('sahne'));
Sahne.tiklayinca(hucreTiklandi);
// Telefon döndürülünce kart resimlerinin yönü de güncellensin
window.addEventListener('resize', () => {
  if (durum.asama === 'oyun') eliCiz();
});
// iPhone'da iki parmakla ya da çift dokunuşla sayfa yakınlaşmasın
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });

Sahne.uzerineGelinince(h => {
  const kart = ben()?.el[durum.secili];
  if (!h || !kart || kart.tur !== 'yol' || !benimSiram() || !aletlerTamam(ben())) {
    Sahne.hayaletGoster(null);
    return;
  }
  if (yerUygunMu(h.x, h.y, cevir(kart.acik, durum.cevrik))) Sahne.hayaletGoster(h.x, h.y, kart.acik, kart.merkez, durum.cevrik);
  else Sahne.hayaletGoster(null);
});
$('cevirBtn').onclick = () => {
  durum.cevrik = !durum.cevrik;
  Ses.secim();
  eliCiz();
  secimiGoster();
};
$('atBtn').onclick = () => {
  if (durum.secili >= 0 && benimSiram() && durum.hazir === 'tur') girdi('at', { k: durum.secili });
};
menuKur();
