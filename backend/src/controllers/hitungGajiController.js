const prisma = require("../utils/prismaClient");

const {
  tahunBulanSekarangWIB,
  statusEfektif,
  JAM_MASUK_STANDAR_DEFAULT,
} = require("../utils/waktuIndonesia");
const { ambilSetHariLibur } = require("../utils/hariLibur");

function tanggalUTC(tahun, bulan, tanggal) {
  const b = String(bulan).padStart(2, "0");
  const t = String(tanggal).padStart(2, "0");

  return new Date(`${tahun}-${b}-${t}T00:00:00.000Z`);
}

function daftarHariKerja(tahun, bulan) {
  const hariDalamBulan = new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
  const daftar = [];

  for (let tanggal = 1; tanggal <= hariDalamBulan; tanggal++) {
    const d = tanggalUTC(tahun, bulan, tanggal);
    const hari = d.getUTCDay();

    if (hari !== 0 && hari !== 6) {
      daftar.push(d);
    }
  }

  return daftar;
}

function validasiTahunBulan(req) {
  const sekarangWIB = tahunBulanSekarangWIB();
  const tahunMentah = req.query.tahun;
  const bulanMentah = req.query.bulan;

  const tahun = tahunMentah == null || tahunMentah === "" ? sekarangWIB.tahun : Number(tahunMentah);
  const bulan = bulanMentah == null || bulanMentah === "" ? sekarangWIB.bulan : Number(bulanMentah);

  if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2100) {
    const error = new Error("Tahun tidak valid. Gunakan tahun antara 2000-2100.");
    error.code = "INPUT_INVALID";
    throw error;
  }

  if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) {
    const error = new Error("Bulan tidak valid. Gunakan angka 1-12.");
    error.code = "INPUT_INVALID";
    throw error;
  }

  if (tahun > sekarangWIB.tahun || (tahun === sekarangWIB.tahun && bulan > sekarangWIB.bulan)) {
    const error = new Error("Periode gaji mendatang belum dapat dihitung atau dibuat laporannya.");
    error.code = "INPUT_INVALID";
    throw error;
  }

  return { tahun, bulan };
}

function validasiPenggunaId(req) {
  const penggunaId = Number(req.params.penggunaId);

  if (!Number.isInteger(penggunaId) || penggunaId <= 0) {
    const error = new Error("ID karyawan tidak valid.");
    error.code = "INPUT_INVALID";
    throw error;
  }

  return penggunaId;
}

function buatPetaAbsensi(semuaAbsensi) {
  const petaAbsensi = new Map();

  for (const a of semuaAbsensi) {
    const kunci = a.tanggal.toISOString().slice(0, 10);
    petaAbsensi.set(kunci, a);
  }

  return petaAbsensi;
}

function hitungDariData({ penggunaId, tahun, bulan, gajiData, pengaturan, hariKerjaDihitung, petaAbsensi }) {
  if (!gajiData) throw new Error("Gaji pokok karyawan ini belum diatur oleh Admin.");

  const hitungan = { tepat_waktu: 0, telat: 0, alpha: 0, izin: 0, sakit: 0, cuti: 0, urgent: 0 };
  const jamMasukStandar = pengaturan?.jamMasukStandar || JAM_MASUK_STANDAR_DEFAULT;

  for (const tanggal of hariKerjaDihitung) {
    const kunci = tanggal.toISOString().slice(0, 10);
    const absen = petaAbsensi.get(kunci);

    if (!absen) {
      hitungan.alpha += 1;
      continue;
    }

    const status = statusEfektif(absen, jamMasukStandar);

    if (status && Object.prototype.hasOwnProperty.call(hitungan, status)) {
      hitungan[status] += 1;
    } else {
      hitungan.alpha += 1;
    }
  }

  const gajiPokok = Number(gajiData.gajiPokok);
  const potonganTelat = Number(pengaturan.potonganTelat);
  const potonganAlpha = Number(pengaturan.potonganAlpha);
  const totalPotongan = hitungan.telat * potonganTelat + hitungan.alpha * potonganAlpha;
  const gajiDiterima = Math.max(gajiPokok - totalPotongan, 0);

  return {
    penggunaId,
    tahun,
    bulan,
    jumlahTepatWaktu: hitungan.tepat_waktu,
    jumlahTelat: hitungan.telat,
    jumlahAlpha: hitungan.alpha,
    jumlahIzin: hitungan.izin,
    jumlahSakit: hitungan.sakit,
    jumlahCuti: hitungan.cuti,
    gajiPokok,
    totalPotongan,
    gajiDiterima,
  };
}

async function siapkanKonteksGaji(tahun, bulan) {
  const pengaturan = await prisma.pengaturanPotongan.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      potonganTelat: 10000,
      potonganAlpha: 15000,
      jamMasukStandar: JAM_MASUK_STANDAR_DEFAULT,
    },
  });

  const hariKerja = daftarHariKerja(tahun, bulan);
  const setHariLibur = await ambilSetHariLibur(tahun);
  const hariKerjaSetelahLibur = hariKerja.filter((d) => !setHariLibur.has(d.toISOString().slice(0, 10)));
  const sekarangWIB = tahunBulanSekarangWIB();
  const bulanIniBerjalan = tahun === sekarangWIB.tahun && bulan === sekarangWIB.bulan;

  // Hari yang sedang berjalan belum boleh dianggap alpha.
  const tanggalHariIniWIB = tanggalUTC(sekarangWIB.tahun, sekarangWIB.bulan, sekarangWIB.tanggal);
  const hariKerjaDihitung = bulanIniBerjalan
    ? hariKerjaSetelahLibur.filter((d) => d < tanggalHariIniWIB)
    : hariKerjaSetelahLibur;

  const awalBulan = tanggalUTC(tahun, bulan, 1);
  const akhirBulan = new Date(Date.UTC(tahun, bulan, 0, 23, 59, 59));

  return { pengaturan, hariKerjaDihitung, awalBulan, akhirBulan };
}

async function hitungGajiKaryawan(penggunaId, tahun, bulan) {
  const { pengaturan, hariKerjaDihitung, awalBulan, akhirBulan } = await siapkanKonteksGaji(tahun, bulan);
  const gajiData = await prisma.gajiKaryawan.findUnique({ where: { penggunaId } });
  const semuaAbsensi = await prisma.absensi.findMany({
    where: { penggunaId, tanggal: { gte: awalBulan, lte: akhirBulan } },
  });
  return hitungDariData({ penggunaId, tahun, bulan, gajiData, pengaturan, hariKerjaDihitung, petaAbsensi: buatPetaAbsensi(semuaAbsensi) });
}

function pesanAmanGagalGaji(error) {
  if (error?.message === "Gaji pokok karyawan ini belum diatur oleh Admin.") return error.message;
  return "Perhitungan gaji karyawan ini gagal. Silakan periksa data gaji dan absensinya.";
}

async function hitungDanSimpanSatu(req, res) {
  try {
    const penggunaId = validasiPenggunaId(req);
    const { tahun, bulan } = validasiTahunBulan(req);
    const hasil = await hitungGajiKaryawan(penggunaId, tahun, bulan);
    const laporan = await prisma.laporanGaji.upsert({ where: { penggunaId_tahun_bulan: { penggunaId, tahun, bulan } }, update: hasil, create: hasil });
    return res.json({ pesan: "Perhitungan gaji berhasil disimpan.", data: laporan });
  } catch (error) {
    console.error(error);
    if (error?.code === "INPUT_INVALID") return res.status(400).json({ pesan: error.message });
    return res.status(500).json({ pesan: "Gagal menghitung gaji. Silakan coba lagi." });
  }
}

async function hitungDanSimpanSemua(req, res) {
  try {
    const { tahun, bulan } = validasiTahunBulan(req);
    const { pengaturan, hariKerjaDihitung, awalBulan, akhirBulan } = await siapkanKonteksGaji(tahun, bulan);
    const karyawanAktif = await prisma.pengguna.findMany({
      where: { peran: "karyawan", statusAkun: "aktif" },
      select: { id: true, nama: true },
    });
    const semuaGaji = await prisma.gajiKaryawan.findMany();
    const semuaAbsensi = await prisma.absensi.findMany({
      where: {
        tanggal: { gte: awalBulan, lte: akhirBulan },
        pengguna: { peran: "karyawan", statusAkun: "aktif" },
      },
    });
    const petaGaji = new Map(semuaGaji.map((item) => [item.penggunaId, item]));
    const petaAbsensiPerKaryawan = new Map();
    for (const absensi of semuaAbsensi) {
      if (!petaAbsensiPerKaryawan.has(absensi.penggunaId)) petaAbsensiPerKaryawan.set(absensi.penggunaId, []);
      petaAbsensiPerKaryawan.get(absensi.penggunaId).push(absensi);
    }
    const hasilSemua = [];
    const gagal = [];
    for (const k of karyawanAktif) {
      try {
        hasilSemua.push(hitungDariData({
          penggunaId: k.id,
          tahun,
          bulan,
          gajiData: petaGaji.get(k.id) || null,
          pengaturan,
          hariKerjaDihitung,
          petaAbsensi: buatPetaAbsensi(petaAbsensiPerKaryawan.get(k.id) || []),
        }));
      } catch (err) {
        gagal.push({ nama: k.nama, alasan: pesanAmanGagalGaji(err) });
      }
    }
    if (hasilSemua.length > 0) {
      const laporan = await prisma.$transaction(hasilSemua.map((hasil) => prisma.laporanGaji.upsert({
        where: { penggunaId_tahun_bulan: { penggunaId: hasil.penggunaId, tahun, bulan } },
        update: hasil,
        create: hasil,
      })));
      return res.json({ pesan: `Perhitungan gaji selesai untuk ${laporan.length} dari ${karyawanAktif.length} karyawan.`, data: laporan, gagal });
    }
    return res.json({ pesan: `Perhitungan gaji selesai untuk 0 dari ${karyawanAktif.length} karyawan.`, data: [], gagal });
  } catch (error) {
    console.error(error);
    if (error?.code === "INPUT_INVALID") return res.status(400).json({ pesan: error.message });
    return res.status(500).json({ pesan: "Gagal menghitung gaji semua karyawan. Silakan coba lagi." });
  }
}

async function lihatLaporanBulanan(req, res) {
  try {
    const { tahun, bulan } = validasiTahunBulan(req);
    const data = await prisma.laporanGaji.findMany({
      where: { tahun, bulan },
      include: { pengguna: { select: { nama: true, jabatan: true, divisi: true } } },
      orderBy: { pengguna: { nama: "asc" } },
    });
    return res.json({ data });
  } catch (error) {
    console.error(error);
    if (error?.code === "INPUT_INVALID") return res.status(400).json({ pesan: error.message });
    return res.status(500).json({ pesan: "Gagal mengambil laporan gaji. Silakan coba lagi." });
  }
}

module.exports = { hitungGajiKaryawan, hitungDanSimpanSatu, hitungDanSimpanSemua, lihatLaporanBulanan };
