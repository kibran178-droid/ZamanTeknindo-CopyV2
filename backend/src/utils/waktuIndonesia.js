
// utils/waktuIndonesia.js - UPDATED jam 08:10 & 17:00
const JAM_MASUK_STANDAR_DEFAULT = process.env.JAM_MASUK_STANDAR || "08:10";
const JAM_PULANG_STANDAR_DEFAULT = process.env.JAM_PULANG_STANDAR || "17:00";

function tahunBulanSekarangWIB() {
  const now = new Date();
  const wibStr = now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
  const wib = new Date(wibStr);
  return { tahun: wib.getFullYear(), bulan: wib.getMonth() + 1, tanggal: wib.getDate(), jam: wib.getHours(), menit: wib.getMinutes() };
}

function parseJam(jamStr) {
  const [h,m] = (jamStr || "08:10").split(":").map(Number);
  return h*60+m;
}

function jamMasukWIBToMenit(date) {
  if(!date) return null;
  const wibStr = new Date(date).toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
  const wib = new Date(wibStr);
  return wib.getHours()*60 + wib.getMinutes();
}

function statusEfektif(absen, jamMasukStandar) {
  // absen bisa punya status manual: izin, sakit, cuti, urgent
  if (!absen) return "alpha";
  if (absen.status === "izin" || absen.statusOtomatis === "izin") return "izin";
  if (absen.status === "sakit" || absen.statusOtomatis === "sakit") return "sakit";
  if (absen.status === "cuti" || absen.statusOtomatis === "cuti") return "cuti";
  if (absen.status === "urgent" || absen.statusOtomatis === "urgent") return "urgent";
  
  // Jika tidak ada jam masuk -> alpha
  if (!absen.jamMasuk) return "alpha";
  
  // Bandingkan jam masuk WIB dengan standar 08:10
  const standar = jamMasukStandar || JAM_MASUK_STANDAR_DEFAULT;
  const batasMenit = parseJam(standar);
  const masukMenit = jamMasukWIBToMenit(absen.jamMasuk);
  
  if (masukMenit === null) return "alpha";
  
  // Lewat 08:10 = telat (sesuai hitungGajiController lama)
  if (masukMenit > batasMenit) return "telat";
  
  return "tepat_waktu";
}

module.exports = {
  tahunBulanSekarangWIB,
  statusEfektif,
  JAM_MASUK_STANDAR_DEFAULT,
  JAM_PULANG_STANDAR_DEFAULT,
  parseJam,
  jamMasukWIBToMenit,
};
