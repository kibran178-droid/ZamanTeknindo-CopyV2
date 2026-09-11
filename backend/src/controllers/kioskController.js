const prisma = require("../utils/prismaClient");
const FACE_THRESHOLD = 0.5;

const JAM_MASUK_MAX = process.env.JAM_MASUK_MAX || "08:10";
const JAM_PULANG_MIN = process.env.JAM_PULANG_MIN || "17:00";

function euclidean(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}
function getWIBTodayRange() {
  const wibDateStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const start = new Date(`${wibDateStr}T00:00:00+07:00`);
  const end = new Date(`${wibDateStr}T23:59:59.999+07:00`);
  return { wibDateStr, start, end };
}
function getWIBNow() {
  const wibStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
  return new Date(wibStr);
}
function parseJam(jamStr) {
  const [h, m] = jamStr.split(":").map(Number);
  return h * 60 + m;
}
function getWIBTimeInfo() {
  const wibNow = getWIBNow();
  const jam = wibNow.getHours();
  const menit = wibNow.getMinutes();
  const totalMenit = jam * 60 + menit;
  const jamStr = `${String(jam).padStart(2, "0")}:${String(menit).padStart(2, "0")}`;
  return { wibNow, jam, menit, totalMenit, jamStr };
}

const checkKioskKey = (req, res, next) => {
  const key = req.headers["x-kiosk-key"] || req.body.kioskKey || req.query.kioskKey;
  if (!process.env.KIOSK_SECRET_KEY || key === process.env.KIOSK_SECRET_KEY) return next();
  return res.status(401).json({ message: "Kiosk key tidak valid" });
};

const verifyAdminPin = async (req, res) => {
  const { pin } = req.body;
  const ADMIN_PIN = process.env.ADMIN_KIOSK_PIN || process.env.KIOSK_ADMIN_PIN || "246810";
  if (pin === ADMIN_PIN) return res.json({ ok: true });
  return res.status(401).json({ message: "PIN admin salah" });
};

const getPenggunaListKiosk = async (req, res) => {
  try {
    const users = await prisma.pengguna.findMany({ where: { statusAkun: "aktif" }, select: { id: true, nama: true, email: true, jabatan: true, divisi: true } });
    const faces = await prisma.userFace.findMany({ select: { penggunaId: true } });
    const faceIds = new Set(faces.map(f => f.penggunaId));
    res.json(users.map(u => ({...u, hasFace: faceIds.has(u.id)})));
  } catch (e) { res.status(500).json({ message: e.message }); }
};

const getStatusKiosk = async (req, res) => {
  try {
    const penggunaId = Number(req.params.penggunaId);
    const { wibDateStr, start, end } = getWIBTodayRange();
    const { totalMenit, jamStr } = getWIBTimeInfo();
    const batasMasuk = parseJam(JAM_MASUK_MAX);
    const batasPulang = parseJam(JAM_PULANG_MIN);
    const absen = await prisma.absensi.findFirst({ where: { penggunaId, tanggal: { gte: start, lte: end } } });
    const jamInfo = { jamSekarang: jamStr, totalMenitSekarang: totalMenit, batasMasuk: JAM_MASUK_MAX, batasMasukMenit: batasMasuk, batasPulang: JAM_PULANG_MIN, batasPulangMenit: batasPulang, bolehMasuk: totalMenit <= batasMasuk + 120, bolehPulang: totalMenit >= batasPulang };
    if (!absen) return res.json({ wibDateStr, sudahMasuk: false, tipeSelanjutnya: "masuk", jamInfo });
    if (absen.jamMasuk && !absen.jamPulang) return res.json({ wibDateStr, sudahMasuk: true, tipeSelanjutnya: "pulang", data: absen, jamInfo });
    if (absen.jamMasuk && absen.jamPulang) return res.json({ wibDateStr, sudahMasuk: true, sudahPulang: true, tipeSelanjutnya: "masuk", data: absen, sudahLengkap: true, jamInfo });
    return res.json({ wibDateStr, tipeSelanjutnya: "masuk", data: absen, jamInfo });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

const enrollFace = async (req, res) => {
  try {
    const { penggunaId, descriptors } = req.body;
    if (!penggunaId || !descriptors?.length) return res.status(400).json({ message: "penggunaId & descriptors wajib" });
    const data = await prisma.userFace.upsert({ where: { penggunaId: Number(penggunaId) }, update: { descriptors, quality: "KIOSK" }, create: { penggunaId: Number(penggunaId), descriptors, quality: "KIOSK" } });
    res.json({ message: "Wajah terdaftar", data });
  } catch (e) { console.error(e); res.status(500).json({ message: e.message }); }
};

const recognize = async (req, res) => {
  try {
    const { descriptor } = req.body;
    if (!descriptor) return res.status(400).json({ message: "descriptor wajib" });
    const faces = await prisma.userFace.findMany();
    let best = null; let bestDist = Infinity;
    for (const f of faces) { for (const d of f.descriptors) { const dist = euclidean(descriptor, d); if (dist < bestDist) { bestDist = dist; best = f; } } }
    if (best && bestDist < FACE_THRESHOLD) {
      const pengguna = await prisma.pengguna.findUnique({ where: { id: best.penggunaId }, select: { id:true, nama:true, email:true, jabatan:true, divisi:true, peran:true } });
      return res.json({ matched: true, distance: bestDist, pengguna });
    } else { return res.json({ matched: false, distance: bestDist }); }
  } catch (e) { console.error(e); res.status(500).json({ message: e.message }); }
};

const kioskAbsen = async (req, res) => {
  try {
    let { penggunaId, tipe, foto, latitude, longitude } = req.body;
    const now = new Date();
    const { start, end } = getWIBTodayRange();
    const { totalMenit, jamStr } = getWIBTimeInfo();
    const batasMasuk = parseJam(JAM_MASUK_MAX);
    const batasPulang = parseJam(JAM_PULANG_MIN);
    let absen = await prisma.absensi.findFirst({ where: { penggunaId: Number(penggunaId), tanggal: { gte: start, lte: end } } });
    if (!tipe || tipe === "auto") {
      if (!absen || !absen.jamMasuk) tipe = "masuk";
      else if (!absen.jamPulang) tipe = "pulang";
      else return res.status(400).json({ message: "Sudah absen lengkap hari ini" });
    }
    if (tipe === "masuk") {
      if (absen?.jamMasuk) return res.status(400).json({ message: "Sudah absen masuk" });
      if (totalMenit > batasMasuk + 120) {
        return res.status(400).json({ message: `Absen masuk ditutup. Maksimal jam ${JAM_MASUK_MAX} (toleransi sampai 10:10). Sekarang ${jamStr} WIB` });
      }
      let statusOtomatis = "tepat_waktu"; let keterangan = null; let menitTerlambat = 0;
      if (totalMenit > batasMasuk) {
        statusOtomatis = "telat";
        menitTerlambat = totalMenit - batasMasuk;
        keterangan = `Terlambat ${menitTerlambat} menit (masuk ${jamStr}, batas ${JAM_MASUK_MAX})`;
      }
      const data = absen ? await prisma.absensi.update({
        where: { id: absen.id },
        data: { jamMasuk: now, fotoMasuk: foto, latitudeMasuk: latitude, longitudeMasuk: longitude, statusOtomatis, keterangan, menitTerlambat }
      }) : await prisma.absensi.create({
        data: { penggunaId: Number(penggunaId), tanggal: start, jamMasuk: now, fotoMasuk: foto, latitudeMasuk: latitude, longitudeMasuk: longitude, statusOtomatis, keterangan, menitTerlambat }
      });
      const pesan = statusOtomatis === "telat" ? `Absen masuk berhasil (TERLAMBAT ${menitTerlambat} menit)` : "Absen masuk berhasil";
      return res.json({ message: pesan, data, tipe, statusOtomatis, jamMasuk: jamStr, menitTerlambat });
    } else {
      if (!absen) return res.status(400).json({ message: "Belum absen masuk" });
      if (absen.jamPulang) return res.status(400).json({ message: "Sudah absen pulang" });
      if (totalMenit < batasPulang) {
        const sisa = batasPulang - totalMenit; const sisaJam = Math.floor(sisa / 60); const sisaMenit = sisa % 60;
        return res.status(400).json({ message: `Belum jam pulang. Pulang mulai jam ${JAM_PULANG_MIN}. Sisa ${sisaJam > 0 ? sisaJam + " jam " : ""}${sisaMenit} menit lagi. Sekarang ${jamStr} WIB` });
      }
      const data = await prisma.absensi.update({ where: { id: absen.id }, data: { jamPulang: now, fotoPulang: foto, latitudePulang: latitude, longitudePulang: longitude } });
      return res.json({ message: "Absen pulang berhasil", data, tipe, jamPulang: jamStr });
    }
  } catch (e) { console.error(e); res.status(500).json({ message: e.message }); }
};

const getAllFaces = async (req, res) => {
  try {
    const faces = await prisma.userFace.findMany();
    res.json(faces);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

const submitManualFallback = async (req, res) => {
  try {
    const { penggunaId, foto, alasan } = req.body;
    const data = await prisma.manualAbsenRequest.create({ data: { penggunaId: Number(penggunaId), tipe: "auto", fotoBukti: foto, alasan: alasan || "Wajah tidak terdeteksi", status: "PENDING", requestedAt: new Date() } });
    res.json({ message: "Pengajuan manual dibuat", data });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

module.exports = { checkKioskKey, getAllFaces, getPenggunaListKiosk, verifyAdminPin, getStatusKiosk, enrollFace, recognize, kioskAbsen, absenViaKiosk: kioskAbsen, submitManualFallback };
