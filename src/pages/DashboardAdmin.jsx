import { useState, useEffect, useRef, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, getToken } from "../utils/api";
import { warna, font } from "../styles/theme";
import logoHorizontal from "../assets/logo-horizontal.png";
import logo from "../assets/logo.png";
import AdminIzin from "./AdminIzin";
import PengaturanGaji from "./PengaturanGaji";
import AdminGajiMassal from "./AdminGajiMassal";
import { labelStatusKehadiran } from "../utils/statusKehadiran";
import {
  ClipboardList,
  Clock,
  Users,
  FileEdit,
  Wallet,
  Building2,
  BarChart3,
  ThumbsUp,
  ArrowRight,
  CheckCircle2,
  MapPin,
  Info,
  AlertTriangle,
  FileText,
  UserX,
  Bell,
  UserPlus,
  FileCheck2,
  X,
} from "lucide-react";

const DAFTAR_STATUS = [
  "tepat_waktu",
  "telat",
  "alpha",
  "izin",
  "sakit",
  "cuti",
  "urgent",
];

// Ikon navigasi sidebar -- pakai komponen SVG (lucide-react), bukan emoji.
// Emoji tampilannya beda-beda tergantung OS (Windows/Mac/Android beda gaya
// gambarnya), jadi kesannya gak konsisten/kurang "produk jadi". Ikon SVG
// gini tampilannya SAMA PERSIS di semua perangkat.
const IKON_TAB = {
  rekap: ClipboardList,
  approval: Clock,
  karyawan: Users,
  izin: FileEdit,
  gaji: Wallet,
  "gaji-massal": Wallet,
  kantor: Building2,
};

// Kartu abu-abu berkedip pelan, dipakai sebagai placeholder saat data masih dimuat
function SkeletonBaris({ jumlah = 4 }) {
  return (
    <>
      {Array.from({ length: jumlah }).map((_, i) => (
        <tr key={i} className="skeleton-pulse">
          <td colSpan={99} style={{ padding: "14px 16px" }}>
            <div
              style={{
                height: 12,
                width: `${40 + (i % 3) * 15}%`,
                background: warna.panelAlt,
                borderRadius: 6,
              }}
            />
          </td>
        </tr>
      ))}
    </>
  );
}

export default function DashboardAdmin({ pengguna, onLogout, tanggalRekap, rekapRefreshNonce }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState(() => {
    const tabTersimpan = sessionStorage.getItem("admin-tab");

    const tabValid = [
      "rekap",
      "approval",
      "karyawan",
      "izin",
      "gaji",
      "gaji-massal",
      "kantor",
    ];

    return tabValid.includes(tabTersimpan) ? tabTersimpan : "rekap";
  });
  const [rekap, setRekap] = useState([]);
  const [belumAbsen, setBelumAbsen] = useState([]);
  const [belumAbsenTerbuka, setBelumAbsenTerbuka] = useState(false);
  const [menunggu, setMenunggu] = useState([]);
  const [karyawan, setKaryawan] = useState([]);
  const [jumlahKaryawanAktif, setJumlahKaryawanAktif] = useState(0);

  // Loading dibuat per menu supaya perpindahan tab tidak menahan seluruh halaman.
  const [loading, setLoading] = useState(true);
  const [loadingKaryawan, setLoadingKaryawan] = useState(false);
  const [loadingKantor, setLoadingKantor] = useState(false);

  // Cache sederhana: data hanya diambil sekali sampai diminta refresh.
  const [karyawanSudahDimuat, setKaryawanSudahDimuat] = useState(false);
  const [kantorSudahDimuat, setKantorSudahDimuat] = useState(false);

  // Komponen Izin/Gaji tetap mounted setelah pertama kali dibuka.
  // Gunakan key yang SAMA dengan id tab agar klik "gaji-massal" benar-benar
  // menandai komponen sudah pernah dibuka. Bug lama memakai gajiMassal,
  // sedangkan pindahTab menyimpan key "gaji-massal", sehingga klik pertama
  // menghasilkan area kosong dan baru muncul setelah refresh.
  const [tabPernahDibuka, setTabPernahDibuka] = useState(() => {
    const tabAwal = [
      "rekap",
      "approval",
      "karyawan",
      "izin",
      "gaji",
      "gaji-massal",
      "kantor",
    ].includes(tab)
      ? tab
      : "rekap";

    return {
      rekap: true,
      approval: tabAwal === "approval",
      karyawan: tabAwal === "karyawan",
      izin: tabAwal === "izin",
      gaji: tabAwal === "gaji",
      "gaji-massal": tabAwal === "gaji-massal",
      kantor: tabAwal === "kantor",
    };
  });

  const [pesan, setPesan] = useState("");
  const [pesanSukses, setPesanSukses] = useState("");

  // Kata kunci pencarian, terpisah untuk tiap tab supaya tidak saling ganggu
  const [cariRekap, setCariRekap] = useState("");
  const [cariKaryawan, setCariKaryawan] = useState("");

  // Form aktivasi akun yang lagi dibuka (ganti prompt() bawaan browser)
  const [formAktivasiTerbuka, setFormAktivasiTerbuka] = useState(null); // id akun atau null
  const [formAktivasi, setFormAktivasi] = useState({
    jabatan: "",
    divisi: "",
    kantorId: "",
  });

  // Daftar kantor/cabang, dipakai di dropdown aktivasi & tab Kantor
  const [daftarKantorState, setDaftarKantorState] = useState([]);
  const [formKantor, setFormKantor] = useState({
    namaKantor: "",
    alamat: "",
    latitude: "",
    longitude: "",
  });
  const [kantorEditId, setKantorEditId] = useState(null); // id kantor yang lagi diedit, atau null = mode tambah baru
  const [sedangSimpanKantor, setSedangSimpanKantor] = useState(false);

  // Konfirmasi ubah status karyawan yang lagi dibuka (ganti confirm() bawaan browser)
  const [konfirmasiStatusTerbuka, setKonfirmasiStatusTerbuka] = useState(null); // id karyawan atau null

  // Hasil reset password (password sementara) yang baru saja digenerate,
  // ditampilkan sekali ke Admin supaya bisa disalin & disampaikan manual
  const [resetPasswordHasil, setResetPasswordHasil] = useState(null); // { id, password } atau null

  // Form edit status kehadiran manual yang lagi dibuka
  const [editStatusTerbuka, setEditStatusTerbuka] = useState(null); // id absensi atau null
  const [sedangSimpanStatusId, setSedangSimpanStatusId] = useState(null);
  const [formEditStatus, setFormEditStatus] = useState({
    statusFinal: "",
    catatanAdmin: "",
  });

  // Sidebar mobile (dibuka lewat hamburger di topbar kecil)
  const [sidebarMobileTerbuka, setSidebarMobileTerbuka] = useState(false);

  // Notifikasi Admin -- jumlah dihitung dari akun baru + pengajuan izin
  // yang masih menunggu diproses. Badge menunjukkan "hal yang masih perlu
  // diproses", bukan "notif yang belum pernah dilihat", supaya tidak
  // hilang begitu saja hanya karena admin sempat membuka panelnya.
  const [notifikasi, setNotifikasi] = useState({
    akunBaru: 0,
    izinBaru: 0,
    total: 0,
  });
  const [notifikasiTerbuka, setNotifikasiTerbuka] = useState(false);
  const notifikasiRef = useRef(null);
  const tabRef = useRef(tab);

  // Tutup panel notifikasi kalau admin klik di luar area panel/tombolnya --
  // tanpa ini, panel cuma bisa ditutup dengan klik tombol X, yang terasa
  // aneh dibanding pola dropdown pada umumnya.
  useEffect(() => {
    if (!notifikasiTerbuka) return;

    function tanganiKlikLuar(e) {
      if (notifikasiRef.current && !notifikasiRef.current.contains(e.target)) {
        setNotifikasiTerbuka(false);
      }
    }

    document.addEventListener("mousedown", tanganiKlikLuar);
    return () => document.removeEventListener("mousedown", tanganiKlikLuar);
  }, [notifikasiTerbuka]);

  // Penanda "tabel sudah digeser sampai ujung kanan" (khusus HP) — kalau
  // sudah di ujung, gradient fade di tepi kanan disembunyikan karena tidak
  // ada lagi yang perlu diisyaratkan ke pengguna
  const [rekapDiUjung, setRekapDiUjung] = useState(false);

  // Panel "Tren & Analisis" -- sengaja TIDAK ikut di-fetch bareng data utama
  // (muatData), supaya buka dashboard tetap ringan/cepat setiap hari. Data ini
  // baru diambil kalau admin sendiri yang membuka panelnya.
  const [ringkasanTerbuka, setRingkasanTerbuka] = useState(false);
  const [ringkasan, setRingkasan] = useState(null);
  const [loadingRingkasan, setLoadingRingkasan] = useState(false);

  async function bukaTutupRingkasan() {
    const mauDibuka = !ringkasanTerbuka;
    setRingkasanTerbuka(mauDibuka);
    if (mauDibuka && !ringkasan) {
      setLoadingRingkasan(true);
      try {
        const res = await fetch(`${API_URL}/admin/ringkasan`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        setRingkasan(data.data || null);
      } catch (err) {
        console.error(err);
        setPesan("Gagal memuat tren & analisis.");
      } finally {
        setLoadingRingkasan(false);
      }
    }
  }

  function namaHariSingkat(tanggalISO) {
    const hari = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
    return hari[new Date(`${tanggalISO}T00:00:00.000Z`).getUTCDay()];
  }
  const [karyawanDiUjung, setKaryawanDiUjung] = useState(false);
  function cekUjungScroll(e, setDiUjung) {
    const el = e.target;
    setDiUjung(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    void muatData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tanggalRekap, rekapRefreshNonce]);

  // Sinkronisasi dashboard Admin berjalan otomatis saat tab sedang terlihat.
  // Refresh dibuat silent agar tabel tetap tampil tanpa skeleton/flicker.
  useEffect(() => {
    let intervalId = null;

    const refreshDashboard = () => {
      if (document.visibilityState !== "visible") return;
      void muatData({ silent: true });
      void muatNotifikasi();
      if (tabRef.current === "karyawan") void muatKaryawan(true, { silent: true });
      if (tabRef.current === "kantor") void muatKantor(true, { silent: true });
    };

    const mulai = () => {
      if (intervalId !== null) return;
      refreshDashboard();
      intervalId = window.setInterval(refreshDashboard, 15000);
    };

    const berhenti = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const ketikaVisibilityBerubah = () => {
      if (document.visibilityState === "visible") {
        refreshDashboard();
        mulai();
      } else {
        berhenti();
      }
    };

    mulai();
    document.addEventListener("visibilitychange", ketikaVisibilityBerubah);

    return () => {
      berhenti();
      document.removeEventListener("visibilitychange", ketikaVisibilityBerubah);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tanggalRekap]);

  useEffect(() => {
    if (tab === "karyawan") {
      muatKaryawan();
    }

    // Tab Kantor baru mengambil datanya saat benar-benar dibuka.
    // Tab Menunggu tidak perlu data kantor sampai Admin menekan
    // tombol "Aktifkan Akun".
    if (tab === "kantor") {
      muatKantor();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (!pesan && !pesanSukses) return;

    const timer = window.setTimeout(() => {
      setPesan("");
      setPesanSukses("");
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [pesan, pesanSukses]);

  // Notifikasi Admin dicek begitu dashboard dibuka, lalu diulang tiap 15
  // detik -- supaya admin tidak perlu refresh manual buat tahu ada
  // pengajuan izin/akun baru yang masuk.


  async function muatNotifikasi() {
    const token = getToken();

    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/admin/notifikasi`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return;

      const data = await res.json();

      if (!data?.data) return;

      setNotifikasi({
        akunBaru: Number(data.data.akunBaru) || 0,
        izinBaru: Number(data.data.izinBaru) || 0,
        total: Number(data.data.total) || 0,
      });
    } catch (error) {
      // Notifikasi bukan bagian yang boleh membuat seluruh dashboard
      // ikut gagal kalau gagal dimuat -- cukup dicatat di console.
      console.error("Gagal memuat notifikasi Admin:", error);
    }
  }

  async function muatData({ silent = false } = {}) {
    if (!silent) {
      setLoading(true);
      setPesan("");
    }

    const token = getToken();

    if (!token) {
      if (!silent) setPesan("Sesi login tidak ditemukan. Silakan login kembali.");
      if (!silent) setLoading(false);
      return;
    }

    const headers = {
      Authorization: `Bearer ${token}`,
    };

    try {
      // Initial load hanya mengambil data yang diperlukan untuk
      // dashboard/rekap dan badge Menunggu.
      const responses = await Promise.all([
        fetch(
          tanggalRekap
            ? `${API_URL}/admin/rekap-tanggal?tanggal=${encodeURIComponent(tanggalRekap)}`
            : `${API_URL}/admin/rekap-hari-ini`,
          { headers },
        ),
        fetch(`${API_URL}/admin/akun-menunggu`, { headers }),
      ]);

      const [resRekap, resMenunggu] = responses;

      const daftarResponse = [
        { response: resRekap, nama: "rekap absensi" },
        { response: resMenunggu, nama: "akun menunggu" },
      ];

      for (const item of daftarResponse) {
        if (!item.response.ok) {
          let dataError = {};

          try {
            dataError = await item.response.json();
          } catch {
            // Response bukan JSON; gunakan pesan umum di bawah.
          }

          if (item.response.status === 401 || item.response.status === 403) {
            throw new Error(
              dataError?.pesan ||
                "Sesi login tidak valid atau Anda tidak memiliki akses.",
            );
          }

          throw new Error(dataError?.pesan || `Gagal memuat ${item.nama}.`);
        }
      }

      const [dataRekap, dataMenunggu] = await Promise.all([
        resRekap.json(),
        resMenunggu.json(),
      ]);

      if (!Array.isArray(dataRekap.data)) {
        throw new Error("Format data rekap absensi dari server tidak valid.");
      }

      if (
        dataRekap.belumAbsen !== undefined &&
        !Array.isArray(dataRekap.belumAbsen)
      ) {
        throw new Error(
          "Format data karyawan yang belum absen dari server tidak valid.",
        );
      }

      if (!Array.isArray(dataMenunggu.data)) {
        throw new Error("Format data akun menunggu dari server tidak valid.");
      }

      setRekap(dataRekap.data);
      setBelumAbsen(dataRekap.belumAbsen || []);
      setJumlahKaryawanAktif(dataRekap.jumlahKaryawanAktif || 0);
      setMenunggu(dataMenunggu.data);
    } catch (err) {
      console.error("Gagal memuat data Dashboard Admin:", err);
      if (!silent) {
        setPesan(
          err?.message || "Gagal memuat data dashboard. Cek koneksi ke server.",
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function muatKaryawan(force = false, { silent = false } = {}) {
    if (karyawanSudahDimuat && !force) return;

    const token = getToken();

    if (!token) {
      setPesan("Sesi login tidak ditemukan. Silakan login kembali.");
      return;
    }

    if (!silent) setLoadingKaryawan(true);

    try {
      const res = await fetch(`${API_URL}/admin/karyawan`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.pesan || "Gagal memuat daftar karyawan.");
      }

      if (!Array.isArray(data.data)) {
        throw new Error("Format data karyawan dari server tidak valid.");
      }

      setKaryawan(data.data);
      setKaryawanSudahDimuat(true);
    } catch (err) {
      console.error("Gagal memuat karyawan:", err);
      if (!silent) setPesan(err?.message || "Gagal memuat data karyawan.");
    } finally {
      if (!silent) setLoadingKaryawan(false);
    }
  }

  async function muatKantor(force = false, { silent = false } = {}) {
    if (kantorSudahDimuat && !force) return;

    const token = getToken();

    if (!token) {
      setPesan("Sesi login tidak ditemukan. Silakan login kembali.");
      return;
    }

    if (!silent) setLoadingKantor(true);

    try {
      const res = await fetch(`${API_URL}/admin/kantor`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.pesan || "Gagal memuat data kantor.");
      }

      if (!Array.isArray(data.data)) {
        throw new Error("Format data kantor dari server tidak valid.");
      }

      setDaftarKantorState(data.data);
      setKantorSudahDimuat(true);
      return data.data;
    } catch (err) {
      console.error("Gagal memuat kantor:", err);
      if (!silent) setPesan(err?.message || "Gagal memuat data kantor.");
    } finally {
      if (!silent) setLoadingKantor(false);
    }

    return [];
  }

  async function bukaFormAktivasi(id) {
    const kantorData = kantorSudahDimuat
      ? daftarKantorState
      : await muatKantor();

    setFormAktivasiTerbuka(id);
    setFormAktivasi({
      jabatan: "",
      divisi: "",
      kantorId: kantorData?.[0]?.id ? String(kantorData[0].id) : "",
    });
  }

  async function kirimAktivasi(id) {
    if (!formAktivasi.jabatan.trim() || !formAktivasi.divisi.trim()) {
      setPesan("Jabatan dan divisi wajib diisi.");
      return;
    }
    setPesan("");
    try {
      const res = await fetch(`${API_URL}/admin/akun/${id}/aktifkan`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(formAktivasi),
      });
      const data = await res.json();
      if (!res.ok) return setPesan(data.pesan || "Gagal mengaktifkan akun.");
      setPesanSukses(data.pesan);
      setFormAktivasiTerbuka(null);

      // Rekap + jumlah karyawan aktif berubah setelah aktivasi.
      // Aktivasi mengubah daftar Menunggu dan jumlah karyawan aktif.
      setMenunggu((lama) => lama.filter((item) => item.id !== id));
      setJumlahKaryawanAktif((jumlah) => jumlah + 1);

      // Kalau tab Karyawan sudah pernah dibuka, sinkronkan diam-diam di belakang.
      if (karyawanSudahDimuat) {
        void muatKaryawan(true, { silent: true });
      }
      void muatNotifikasi();
    } catch (err) {
      console.error(err);
      setPesan("Tidak bisa terhubung ke server.");
    }
  }

  function bukaFormTambahKantor() {
    setKantorEditId(null);
    setFormKantor({ namaKantor: "", alamat: "", latitude: "", longitude: "" });
  }

  function bukaFormEditKantor(k) {
    setKantorEditId(k.id);
    setFormKantor({
      namaKantor: k.namaKantor || "",
      alamat: k.alamat || "",
      latitude: k.latitude ?? "",
      longitude: k.longitude ?? "",
    });
  }

  async function simpanKantor() {
    if (!formKantor.namaKantor.trim()) {
      setPesan("Nama kantor wajib diisi.");
      return;
    }
    // Validasi latitude/longitude harus berupa angka KALAU diisi (boleh kosong).
    // Sebelumnya kalau salah ketik (misal kepencet huruf), errornya baru
    // ketahuan di backend dan muncul sebagai pesan generik yang membingungkan.
    const latDiisi = formKantor.latitude.trim() !== "";
    const lngDiisi = formKantor.longitude.trim() !== "";
    if (latDiisi && isNaN(Number(formKantor.latitude))) {
      setPesan(
        "Latitude harus berupa angka (contoh: 0.5071). Kosongkan saja kalau tidak yakin.",
      );
      return;
    }
    if (lngDiisi && isNaN(Number(formKantor.longitude))) {
      setPesan(
        "Longitude harus berupa angka (contoh: 101.4478). Kosongkan saja kalau tidak yakin.",
      );
      return;
    }
    setPesan("");
    setSedangSimpanKantor(true);
    try {
      const sedangEdit = kantorEditId !== null;
      const url = sedangEdit
        ? `${API_URL}/admin/kantor/${kantorEditId}`
        : `${API_URL}/admin/kantor`;
      const res = await fetch(url, {
        method: sedangEdit ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(formKantor),
      });
      const data = await res.json();
      if (!res.ok) return setPesan(data.pesan || "Gagal menyimpan kantor.");
      setPesanSukses(data.pesan);
      setKantorEditId(null);
      setFormKantor({
        namaKantor: "",
        alamat: "",
        latitude: "",
        longitude: "",
      });
      await muatKantor(true);
    } catch (err) {
      console.error(err);
      setPesan("Tidak bisa terhubung ke server.");
    } finally {
      setSedangSimpanKantor(false);
    }
  }

  async function bukaResetPassword(id) {
    if (resetPasswordHasil?.id === id) {
      setResetPasswordHasil(null);
      return;
    }
    setPesan("");
    try {
      const res = await fetch(
        `${API_URL}/admin/karyawan/${id}/reset-password`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      if (!res.ok) return setPesan(data.pesan || "Gagal mereset password.");
      setResetPasswordHasil({ id, password: data.passwordSementara });
    } catch (err) {
      console.error(err);
      setPesan("Tidak bisa terhubung ke server.");
    }
  }

  async function ubahStatusKaryawan(id, statusBaru) {
    try {
      const res = await fetch(`${API_URL}/admin/karyawan/${id}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ statusAkun: statusBaru }),
      });
      const data = await res.json();
      if (!res.ok) return setPesan(data.pesan || "Gagal mengubah status.");
      setPesanSukses(data.pesan);
      setKonfirmasiStatusTerbuka(null);

      // Daftar Karyawan hanya berisi akun aktif, jadi hilangkan baris ini sekarang.
      if (statusBaru === "nonaktif") {
        setKaryawan((lama) => lama.filter((item) => item.id !== id));
        setJumlahKaryawanAktif((jumlah) => Math.max(0, jumlah - 1));
      } else {
        setJumlahKaryawanAktif((jumlah) => jumlah + 1);
        void muatKaryawan(true, { silent: true });
      }
      void muatNotifikasi();
    } catch (err) {
      console.error(err);
      setPesan("Tidak bisa terhubung ke server.");
    }
  }

  function bukaEditStatus(item) {
    setEditStatusTerbuka(item.id);
    setFormEditStatus({
      statusFinal: item.statusFinal || item.statusOtomatis || "tepat_waktu",
      catatanAdmin: item.catatanAdmin || "",
    });
  }

  async function simpanEditStatus(id) {
    if (!formEditStatus.catatanAdmin.trim()) {
      setPesan(
        "Catatan wajib diisi kalau mengubah status secara manual (buat jejak alasan perubahan).",
      );
      return;
    }

    if (sedangSimpanStatusId === id) return;

    setPesan("");
    setSedangSimpanStatusId(id);

    try {
      const res = await fetch(`${API_URL}/admin/absensi/${id}/edit-status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(formEditStatus),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setPesan(data.pesan || "Gagal mengubah status absensi.");
        return;
      }

      const absensiBaru = data?.data;
      setRekap((lama) =>
        lama.map((item) =>
          item.id === id
            ? {
                ...item,
                ...(absensiBaru || {}),
                pengguna: item.pengguna,
                statusFinal: absensiBaru?.statusFinal ?? formEditStatus.statusFinal,
                statusEfektif: absensiBaru?.statusFinal ?? formEditStatus.statusFinal,
                catatanAdmin: absensiBaru?.catatanAdmin ?? formEditStatus.catatanAdmin.trim(),
              }
            : item,
        ),
      );

      setEditStatusTerbuka(null);
      setPesanSukses(data.pesan || "Status absensi berhasil diperbarui.");

      // Badge notifikasi adalah state terpisah. Refresh hanya badge-nya.
      void muatNotifikasi();
    } catch (err) {
      console.error(err);
      setPesan("Tidak bisa terhubung ke server.");
    } finally {
      setSedangSimpanStatusId(null);
    }
  }

  // Bangun URL foto dengan aman -- data lama ada yang tersimpan SUDAH
  // pakai awalan "/uploads/" (bug lama, sudah diperbaiki di backend),
  // ada yang cuma nama file polos. Fungsi ini menangani DUA KEMUNGKINAN
  // itu, supaya foto lama yang sempat tersimpan salah juga ikut normal
  // tampil lagi tanpa perlu karyawan absen ulang.
  function urlFoto(namaFile, urlSigned = null) {
    if (!namaFile) return null;

    if (namaFile.startsWith("http") || namaFile.startsWith("data:") || namaFile.startsWith("/uploads/")) {
      return namaFile;
    }

    if (urlSigned && (urlSigned.includes("token=") || urlSigned.includes("sign="))) {
      return urlSigned;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const bucket = import.meta.env.VITE_SUPABASE_BUCKET || 'foto-absensi';
    
    if (supabaseUrl && !supabaseUrl.includes("xxxxxxxx.supabase.co")) {
      return `${supabaseUrl}/storage/v1/object/public/${bucket}/${namaFile}`;
    }

    return urlSigned || null;
  }

  function formatJam(tanggalIso) {
    if (!tanggalIso) return "–";
    return new Date(tanggalIso).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function cocokKataKunci(teksTarget, kataKunci) {
    if (!kataKunci.trim()) return true;
    return teksTarget.toLowerCase().includes(kataKunci.trim().toLowerCase());
  }

  const rekapTersaring = rekap.filter((item) =>
    cocokKataKunci(
      `${item.pengguna.nama} ${item.pengguna.jabatan || ""} ${item.pengguna.divisi || ""}`,
      cariRekap,
    ),
  );

  const karyawanTersaring = karyawan.filter((item) =>
    cocokKataKunci(
      `${item.nama} ${item.email} ${item.jabatan || ""} ${item.divisi || ""}`,
      cariKaryawan,
    ),
  );

  const karyawanAktifCount = jumlahKaryawanAktif;
  const jumlahTepatWaktu = rekap.filter(
    (r) => (r.statusFinal || r.statusOtomatis) === "tepat_waktu",
  ).length;
  const jumlahTelat = rekap.filter(
    (r) => (r.statusFinal || r.statusOtomatis) === "telat",
  ).length;
  const jumlahIzinSakitDll = rekap.filter((r) =>
    ["izin", "sakit", "cuti", "urgent"].includes(
      r.statusFinal || r.statusOtomatis,
    ),
  ).length;
  const jumlahBelumAbsen = belumAbsen.length;

  const jamSekarang = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Sapaan berdasarkan jam saat ini -- cuma dipakai di tab "rekap" (halaman
  // utama admin), supaya kesan pertama masuk lebih terasa personal ("Command
  // Center"), bukan cuma judul tab yang datar seperti tab-tab lain.
  const jamSaatIni = new Date().getHours();
  const sapaan =
    jamSaatIni < 11
      ? "Selamat pagi"
      : jamSaatIni < 15
        ? "Selamat siang"
        : jamSaatIni < 19
          ? "Selamat sore"
          : "Selamat malam";
  const namaDepanAdmin = (pengguna?.nama || "Admin").trim().split(" ")[0];

  function inisialNama(nama) {
    if (!nama) return "?";
    const bagian = nama.trim().split(" ");
    if (bagian.length === 1) return bagian[0].slice(0, 2).toUpperCase();
    return (bagian[0][0] + bagian[bagian.length - 1][0]).toUpperCase();
  }

  const tabs = [
    { id: "rekap", label: "Rekap Hari Ini" },
    { id: "approval", label: "Menunggu", badge: menunggu.length || null },
    {
      id: "karyawan",
      label: "Karyawan",
    },
    { id: "izin", label: "Izin", badge: notifikasi.izinBaru || null },
    { id: "gaji", label: "Gaji" },
    { id: "gaji-massal", label: "Gaji Massal" },
    { id: "kantor", label: "Kantor Pusat" },
  ];

  // Pengelompokan tab sidebar jadi beberapa seksi (WORKSPACE/PEOPLE/dst) --
  // murni untuk tampilan nav, tidak mengubah daftar `tabs` di atas sama
  // sekali (itu masih dipakai apa adanya untuk judul halaman & badge).
  const grupSidebar = [
    { label: "WORKSPACE", idTab: ["rekap", "approval"] },
    { label: "PEOPLE", idTab: ["karyawan", "izin"] },
    { label: "FINANCE", idTab: ["gaji", "gaji-massal"] },
    { label: "SYSTEM", idTab: ["kantor"] },
  ];

  const judulTab = tabs.find((t) => t.id === tab)?.label || "";

  function pindahTab(idTab) {
    setTab(idTab);
    sessionStorage.setItem("admin-tab", idTab);

    setTabPernahDibuka((sebelumnya) => ({
      ...sebelumnya,
      [idTab]: true,
    }));

    // Bersihkan pesan saat berpindah menu
    setPesan("");
    setPesanSukses("");

    // Tutup form/panel yang masih terbuka
    setFormAktivasiTerbuka(null);
    setKonfirmasiStatusTerbuka(null);
    setEditStatusTerbuka(null);
    setResetPasswordHasil(null);

    setSidebarMobileTerbuka(false);
  }

  const adaPesan = Boolean(pesan || pesanSukses);
  const pesanAdalahError = Boolean(pesan);
  const teksPesan = pesan || pesanSukses;

  return (
    <div style={styles.shell}>
      {/* ============ SIDEBAR (tampil di desktop, tersembunyi & jadi drawer di mobile) ============ */}
      <aside
        className={
          sidebarMobileTerbuka
            ? "admin-sidebar sidebar-mobile-terbuka"
            : "admin-sidebar"
        }
        style={styles.sidebar}
      >
        <div style={styles.sidebarAtas}>
          <img
            src={logoHorizontal}
            alt="Logo PT. Zaman Teknindo"
            style={styles.logoSidebar}
          />
        </div>

        <nav style={styles.navSidebar}>
          {grupSidebar.map((grup) => (
            <div key={grup.label} style={styles.navGrup}>
              <p style={styles.navGrupLabel}>{grup.label}</p>
              {grup.idTab.map((id) => {
                const t = tabs.find((x) => x.id === id);
                if (!t) return null;
                const Ikon = IKON_TAB[t.id];
                return (
                  <button
                    key={t.id}
                    onClick={() => pindahTab(t.id)}
                    style={tab === t.id ? styles.navItemAktif : styles.navItem}
                    className="nav-item-hover"
                  >
                    <Ikon size={17} strokeWidth={2} style={styles.navIkon} />
                    <span style={{ flex: 1, textAlign: "left" }}>
                      {t.label}
                    </span>
                    {t.badge ? (
                      <span style={styles.navBadge}>{t.badge}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={styles.sidebarBawah}>
          <div style={styles.profilSidebar}>
            <div style={styles.avatarLingkaran}>
              {inisialNama(pengguna.nama)}
            </div>
            <div style={{ overflow: "hidden" }}>
              <p style={styles.namaProfil}>{pengguna.nama}</p>
              <p style={styles.perananProfil}>Admin</p>
            </div>
          </div>
          <div style={styles.aksiSidebarRow}>
            <button
              onClick={() => navigate("/ganti-password")}
              style={styles.tombolAksiSidebar}
              className="tombol-aksi-sidebar"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  x="3.5"
                  y="7"
                  width="9"
                  height="6.5"
                  rx="1.5"
                  stroke={warna.tintaLembut}
                  strokeWidth="1.4"
                />
                <path
                  d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"
                  stroke={warna.tintaLembut}
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              Password
            </button>
            <button
              onClick={onLogout}
              style={{
                ...styles.tombolAksiSidebar,
                ...styles.tombolAksiSidebarBahaya,
              }}
              className="tombol-aksi-sidebar-bahaya"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M6 3.5H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2M10.5 11l3-3-3-3M13.5 8H6"
                  stroke={warna.bahaya}
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Keluar
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay gelap saat sidebar mobile terbuka, klik buat nutup */}
      {sidebarMobileTerbuka && (
        <div
          className="overlay-mobile"
          onClick={() => setSidebarMobileTerbuka(false)}
        />
      )}

      {/* ============ AREA KONTEN UTAMA ============ */}
      <div style={styles.mainArea} className="main-area-admin">
        <div style={styles.topbarMobile} className="topbar-mobile">
          <button
            onClick={() => setSidebarMobileTerbuka(true)}
            style={styles.tombolHamburger}
            aria-label="Buka menu navigasi"
          >
            {/* Ikon garis tiga (hamburger) — dulu pakai logo perusahaan di sini,
                orang tidak akan mengira logo itu bisa diklik untuk buka menu */}
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3 5.5H17M3 10H17M3 14.5H17"
                stroke={warna.tinta}
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <img
            src={logo}
            alt="PT. Zaman Teknindo"
            style={styles.topbarLogoKecil}
          />
          <div style={{ width: 32 }} />
        </div>

        <div style={styles.headerAtas}>
          <div>
            <h1 style={styles.judulHalaman}>
              {tab === "rekap" ? `${sapaan}, ${namaDepanAdmin}` : judulTab}
            </h1>
            <p style={styles.subJudulHalaman}>{jamSekarang}</p>
          </div>

          <div
            style={styles.notifikasiWrapper}
            className="notifikasi-wrapper"
            ref={notifikasiRef}
          >
            <button
              type="button"
              onClick={() => setNotifikasiTerbuka((v) => !v)}
              style={styles.notifikasiButton}
              aria-label="Buka notifikasi"
              aria-expanded={notifikasiTerbuka}
            >
              <Bell size={18} strokeWidth={2} />
              {notifikasi.total > 0 && (
                <span style={styles.notifikasiCount}>
                  {notifikasi.total > 99 ? "99+" : notifikasi.total}
                </span>
              )}
            </button>

            {notifikasiTerbuka && (
              <div style={styles.notifikasiPanel} className="notifikasi-panel">
                <div style={styles.notifikasiPanelHeader}>
                  <div>
                    <p style={styles.notifikasiPanelTitle}>Notifikasi</p>
                    <p style={styles.notifikasiPanelSubTitle}>
                      Hal yang perlu diperiksa Admin
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotifikasiTerbuka(false)}
                    style={styles.notifikasiCloseButton}
                    aria-label="Tutup notifikasi"
                  >
                    <X size={16} />
                  </button>
                </div>

                {notifikasi.total === 0 ? (
                  <div style={styles.notifikasiKosong}>
                    <CheckCircle2 size={25} strokeWidth={1.7} />
                    <strong>Tidak ada notifikasi baru</strong>
                    <span>Semua pengajuan dan akun sudah diperiksa.</span>
                  </div>
                ) : (
                  <div style={styles.notifikasiList}>
                    {notifikasi.akunBaru > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setNotifikasiTerbuka(false);
                          pindahTab("approval");
                        }}
                        style={styles.notifikasiItem}
                      >
                        <div
                          style={{
                            ...styles.notifikasiItemIcon,
                            color: warna.aksen,
                            background: warna.aksenLembut,
                          }}
                        >
                          <UserPlus size={17} />
                        </div>
                        <div style={styles.notifikasiItemContent}>
                          <strong style={styles.notifikasiItemJudul}>
                            {notifikasi.akunBaru} akun karyawan baru
                          </strong>
                          <span style={styles.notifikasiItemSub}>
                            Menunggu aktivasi oleh Admin.
                          </span>
                        </div>
                        <ArrowRight size={15} style={styles.notifikasiArrow} />
                      </button>
                    )}

                    {notifikasi.izinBaru > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setNotifikasiTerbuka(false);
                          pindahTab("izin");
                        }}
                        style={styles.notifikasiItem}
                      >
                        <div
                          style={{
                            ...styles.notifikasiItemIcon,
                            color: warna.aksen,
                            background: warna.aksenLembut,
                          }}
                        >
                          <FileCheck2 size={17} />
                        </div>
                        <div style={styles.notifikasiItemContent}>
                          <strong style={styles.notifikasiItemJudul}>
                            {notifikasi.izinBaru} pengajuan izin baru
                          </strong>
                          <span style={styles.notifikasiItemSub}>
                            Menunggu persetujuan Admin.
                          </span>
                        </div>
                        <ArrowRight size={15} style={styles.notifikasiArrow} />
                      </button>
                    )}
                  </div>
                )}

                <div style={styles.notifikasiFooter}>
                  Pemeriksaan otomatis setiap 15 detik
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={styles.content}>
          {adaPesan && (
            <div
              role={pesanAdalahError ? "alert" : "status"}
              aria-live="polite"
              style={pesanAdalahError ? styles.toastError : styles.toastSukses}
            >
              <span
                style={
                  pesanAdalahError
                    ? styles.toastIconError
                    : styles.toastIconSukses
                }
              >
                {pesanAdalahError ? "!" : "✓"}
              </span>
              <span style={styles.toastText}>{teksPesan}</span>
            </div>
          )}

          {tab === "rekap" && (
            <>
              <div style={styles.statGrid}>
                <div
                  style={{
                    ...styles.statCard,
                    borderLeft: `3px solid ${warna.aksen}`,
                  }}
                >
                  <div
                    style={{
                      ...styles.statIconWrap,
                      color: warna.aksen,
                      background: warna.aksenLembut,
                    }}
                  >
                    <Users size={17} strokeWidth={2} />
                  </div>
                  <span style={styles.statAngka}>{karyawanAktifCount}</span>
                  <span style={styles.statLabel}>Karyawan Aktif</span>
                </div>
                <div
                  style={{
                    ...styles.statCard,
                    borderLeft: `3px solid ${warna.sukses}`,
                  }}
                >
                  <div
                    style={{
                      ...styles.statIconWrap,
                      color: warna.sukses,
                      background: warna.suksesLembut,
                    }}
                  >
                    <CheckCircle2 size={17} strokeWidth={2} />
                  </div>
                  <span style={{ ...styles.statAngka, color: warna.sukses }}>
                    {jumlahTepatWaktu}
                  </span>
                  <span style={styles.statLabel}>Tepat Waktu</span>
                </div>
                <div
                  style={{
                    ...styles.statCard,
                    borderLeft: `3px solid ${warna.peringatan}`,
                  }}
                >
                  <div
                    style={{
                      ...styles.statIconWrap,
                      color: warna.peringatan,
                      background: warna.peringatanLembut,
                    }}
                  >
                    <AlertTriangle size={17} strokeWidth={2} />
                  </div>
                  <span
                    style={{ ...styles.statAngka, color: warna.peringatan }}
                  >
                    {jumlahTelat}
                  </span>
                  <span style={styles.statLabel}>Telat</span>
                </div>
                <div
                  style={{
                    ...styles.statCard,
                    borderLeft: `3px solid ${warna.aksen}`,
                  }}
                >
                  <div
                    style={{
                      ...styles.statIconWrap,
                      color: warna.aksen,
                      background: warna.aksenLembut,
                    }}
                  >
                    <FileText size={17} strokeWidth={2} />
                  </div>
                  <span style={{ ...styles.statAngka, color: warna.aksen }}>
                    {jumlahIzinSakitDll}
                  </span>
                  <span style={styles.statLabel}>Izin/Sakit/Cuti</span>
                </div>
                <button
                  type="button"
                  onClick={() => setBelumAbsenTerbuka((v) => !v)}
                  style={{
                    ...styles.statCard,
                    borderLeft: `3px solid ${warna.tintaSamar}`,
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                  }}
                  className="stat-card-belum-absen"
                  aria-expanded={belumAbsenTerbuka}
                >
                  <div
                    style={{
                      ...styles.statIconWrap,
                      color: warna.tintaLembut,
                      background: warna.panelAlt,
                    }}
                  >
                    <UserX size={17} strokeWidth={2} />
                  </div>
                  <span
                    style={{ ...styles.statAngka, color: warna.tintaSamar }}
                  >
                    {jumlahBelumAbsen}
                  </span>
                  <span style={styles.statLabel}>Belum Absen</span>
                  <span style={styles.statHint}>
                    Klik untuk lihat siapa yang belum absen
                  </span>
                </button>
              </div>

              {belumAbsenTerbuka && (
                <div style={styles.panelBelumAbsen}>
                  <div style={styles.panelBelumAbsenHeader}>
                    <div>
                      <p style={styles.panelBelumAbsenJudul}>
                        Karyawan Belum Absen ({jumlahBelumAbsen})
                      </p>
                      <p style={styles.panelBelumAbsenSub}>
                        Karyawan aktif yang belum memiliki record absensi untuk
                        hari ini.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBelumAbsenTerbuka(false)}
                      style={styles.tombolTutupPanel}
                    >
                      Tutup
                    </button>
                  </div>

                  {belumAbsen.length === 0 ? (
                    <div style={styles.belumAbsenKosong}>
                      <CheckCircle2
                        size={18}
                        strokeWidth={1.8}
                        style={{ color: warna.sukses }}
                      />
                      <span>
                        Semua karyawan aktif sudah memiliki absensi hari ini.
                      </span>
                    </div>
                  ) : (
                    <div style={styles.belumAbsenGrid}>
                      {belumAbsen.map((item) => (
                        <div key={item.id} style={styles.belumAbsenItem}>
                          <div style={styles.avatarMini}>
                            {inisialNama(item.nama)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <strong style={styles.belumAbsenNama}>
                              {item.nama}
                            </strong>
                            <p style={styles.belumAbsenSubItem}>
                              {item.jabatan || "-"} · {item.divisi || "-"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={bukaTutupRingkasan}
                style={styles.tombolTogglePanel}
                className="tombol-toggle-panel"
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                  }}
                >
                  <BarChart3 size={15} strokeWidth={2} />
                  Tren & Analisis (7 hari terakhir)
                </span>
                <span
                  style={{
                    transform: ringkasanTerbuka ? "rotate(180deg)" : "none",
                    display: "inline-block",
                    transition: "transform 0.15s ease",
                  }}
                >
                  ▾
                </span>
              </button>

              {ringkasanTerbuka && (
                <div style={styles.panelRingkasan}>
                  {loadingRingkasan && <p style={styles.kosong}>Memuat…</p>}

                  {!loadingRingkasan && ringkasan && (
                    <div
                      style={styles.ringkasanGrid}
                      className="ringkasan-grid"
                    >
                      <div style={styles.ringkasanKotak}>
                        <p style={styles.ringkasanJudul}>Tren Kehadiran</p>
                        <div style={styles.legendaChart}>
                          <span style={styles.legendaItem}>
                            <span
                              style={{
                                ...styles.legendaDot,
                                background: warna.sukses,
                              }}
                            />
                            Tepat waktu
                          </span>
                          <span style={styles.legendaItem}>
                            <span
                              style={{
                                ...styles.legendaDot,
                                background: warna.peringatan,
                              }}
                            />
                            Telat
                          </span>
                          <span style={styles.legendaItem}>
                            <span
                              style={{
                                ...styles.legendaDot,
                                background: warna.aksen,
                              }}
                            />
                            Izin/Cuti
                          </span>
                          <span style={styles.legendaItem}>
                            <span
                              style={{
                                ...styles.legendaDot,
                                background: warna.bahaya,
                              }}
                            />
                            Alpha
                          </span>
                        </div>
                        <div style={styles.chartBarGroup}>
                          {ringkasan.tren7Hari.map((h) => {
                            const total =
                              h.tepatWaktu + h.telat + h.alpha + h.izinDll;
                            const tinggiMax = 56;
                            return (
                              <div key={h.tanggal} style={styles.chartKolom}>
                                <div style={styles.chartBatangWrapper}>
                                  {total === 0 ? (
                                    <div style={styles.chartBatangKosong} />
                                  ) : (
                                    <>
                                      {h.tepatWaktu > 0 && (
                                        <div
                                          style={{
                                            ...styles.chartSegmen,
                                            height:
                                              (h.tepatWaktu / total) *
                                              tinggiMax,
                                            background: warna.sukses,
                                          }}
                                          title={`Tepat waktu: ${h.tepatWaktu}`}
                                        />
                                      )}
                                      {h.telat > 0 && (
                                        <div
                                          style={{
                                            ...styles.chartSegmen,
                                            height:
                                              (h.telat / total) * tinggiMax,
                                            background: warna.peringatan,
                                          }}
                                          title={`Telat: ${h.telat}`}
                                        />
                                      )}
                                      {h.izinDll > 0 && (
                                        <div
                                          style={{
                                            ...styles.chartSegmen,
                                            height:
                                              (h.izinDll / total) * tinggiMax,
                                            background: warna.aksen,
                                          }}
                                          title={`Izin/Sakit/Cuti: ${h.izinDll}`}
                                        />
                                      )}
                                      {h.alpha > 0 && (
                                        <div
                                          style={{
                                            ...styles.chartSegmen,
                                            height:
                                              (h.alpha / total) * tinggiMax,
                                            background: warna.bahaya,
                                          }}
                                          title={`Alpha: ${h.alpha}`}
                                        />
                                      )}
                                    </>
                                  )}
                                </div>
                                <span style={styles.chartLabelHari}>
                                  {namaHariSingkat(h.tanggal)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div style={styles.ringkasanKotak}>
                        <p style={styles.ringkasanJudul}>
                          Perlu Perhatian (30 hari)
                        </p>
                        {ringkasan.sorotanKaryawan.length === 0 && (
                          <p style={styles.kosong}>
                            <ThumbsUp
                              size={14}
                              strokeWidth={2}
                              style={{ verticalAlign: "-2px", marginRight: 5 }}
                            />
                            Tidak ada yang perlu disorot.
                          </p>
                        )}
                        {ringkasan.sorotanKaryawan.map((k, idx) => (
                          <div key={k.id} style={styles.sorotanBaris}>
                            <span style={styles.sorotanNamaWrap}>
                              <span style={styles.sorotanPeringkat}>
                                {idx + 1}
                              </span>
                              <span style={styles.sorotanNama}>{k.nama}</span>
                            </span>
                            <span style={styles.sorotanAngka}>
                              {k.telat > 0 && (
                                <span style={{ color: warna.peringatan }}>
                                  {k.telat}× telat
                                </span>
                              )}
                              {k.telat > 0 && k.alpha > 0 && (
                                <span style={{ margin: "0 4px" }}>·</span>
                              )}
                              {k.alpha > 0 && (
                                <span style={{ color: warna.bahaya }}>
                                  {k.alpha}× alpha
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {rekap.length > 0 && (
                <input
                  type="text"
                  value={cariRekap}
                  onChange={(e) => setCariRekap(e.target.value)}
                  placeholder="Cari nama, jabatan, atau divisi…"
                  style={styles.kotakCari}
                  className="input-fokus"
                />
              )}

              <p style={styles.hintGeser} className="hint-geser">
                <ArrowRight
                  size={13}
                  strokeWidth={2}
                  style={{ verticalAlign: "-2px", marginRight: 4 }}
                />
                Geser tabel ke kanan untuk lihat jam pulang & lokasi
              </p>
              <div style={styles.tabelWrapperLuar}>
                <div
                  style={styles.tabelWrapper}
                  className="tabel-scroll"
                  onScroll={(e) => cekUjungScroll(e, setRekapDiUjung)}
                >
                  <table style={styles.tabel}>
                    <thead>
                      <tr>
                        <th style={{ ...styles.th, ...styles.thSticky }}>
                          Karyawan
                        </th>
                        <th style={styles.th}>Foto</th>
                        <th style={styles.th}>Status</th>
                        <th style={styles.th}>Masuk</th>
                        <th style={styles.th}>Pulang</th>
                        <th style={styles.th}>Lokasi</th>
                        <th style={styles.th}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading && <SkeletonBaris jumlah={4} />}

                      {!loading && rekap.length === 0 && (
                        <tr>
                          <td colSpan={7} style={styles.tdKosong}>
                            Belum ada karyawan yang absen hari ini.
                          </td>
                        </tr>
                      )}
                      {!loading &&
                        rekap.length > 0 &&
                        rekapTersaring.length === 0 && (
                          <tr>
                            <td colSpan={7} style={styles.tdKosong}>
                              Tidak ada hasil untuk "{cariRekap}".
                            </td>
                          </tr>
                        )}

                      {!loading &&
                        rekapTersaring.map((item) => {
                          const status = labelStatusKehadiran(
                            item.statusFinal || item.statusOtomatis,
                          );
                          const sedangEdit = editStatusTerbuka === item.id;
                          return (
                            <Fragment key={item.id}>
                              <tr className="baris-hover">
                                <td
                                  style={{ ...styles.td, ...styles.tdSticky }}
                                >
                                  <div style={styles.tdNamaWrap}>
                                    <div style={styles.avatarTabelMini}>
                                      {inisialNama(item.pengguna.nama)}
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                      <strong
                                        style={{
                                          color: warna.tinta,
                                          fontSize: 13.5,
                                        }}
                                      >
                                        {item.pengguna.nama}
                                      </strong>
                                      <div style={styles.tdSub}>
                                        {item.pengguna.jabatan || "-"} ·{" "}
                                        {item.pengguna.divisi || "-"}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td style={styles.td}>
                                  <div style={styles.fotoAbsenRow}>
                                    {item.fotoMasuk && (
                                      <a
                                        href={urlFoto(item.fotoMasuk, item.fotoMasukUrl)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Lihat foto absen masuk"
                                      >
                                        <img
                                          src={urlFoto(
                                            item.fotoMasuk,
                                            item.fotoMasukUrl,
                                          )}
                                          alt="Foto absen masuk"
                                          style={styles.fotoAbsenThumb}
                                        />
                                      </a>
                                    )}
                                    {item.fotoPulang && (
                                      <a
                                        href={urlFoto(item.fotoPulang, item.fotoPulangUrl)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Lihat foto absen pulang"
                                      >
                                        <img
                                          src={urlFoto(
                                            item.fotoPulang,
                                            item.fotoPulangUrl,
                                          )}
                                          alt="Foto absen pulang"
                                          style={styles.fotoAbsenThumb}
                                        />
                                      </a>
                                    )}
                                    {!item.fotoMasuk && !item.fotoPulang && (
                                      <span
                                        style={{
                                          fontSize: 11,
                                          color: warna.tintaSamar,
                                        }}
                                      >
                                        –
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td style={styles.td}>
                                  <span
                                    style={{
                                      ...styles.badge,
                                      color: status.warna,
                                      background: status.latar,
                                    }}
                                  >
                                    {status.teks}
                                  </span>
                                </td>
                                <td style={{ ...styles.td, ...styles.mono }}>
                                  {formatJam(item.jamMasuk)}
                                </td>
                                <td style={{ ...styles.td, ...styles.mono }}>
                                  {formatJam(item.jamPulang)}
                                </td>
                                <td
                                  style={{
                                    ...styles.td,
                                    fontSize: 12,
                                    color: warna.tintaSamar,
                                    maxWidth: 200,
                                  }}
                                >
                                  {item.alamatMasuk || "–"}
                                </td>
                                <td
                                  style={{ ...styles.td, textAlign: "right" }}
                                >
                                  <button
                                    onClick={() =>
                                      sedangEdit
                                        ? setEditStatusTerbuka(null)
                                        : bukaEditStatus(item)
                                    }
                                    style={styles.tombolEditKecil}
                                  >
                                    {sedangEdit ? "Tutup" : "Ubah Status"}
                                  </button>
                                </td>
                              </tr>
                              {item.catatanAdmin && !sedangEdit && (
                                <tr>
                                  <td
                                    colSpan={7}
                                    style={{ padding: "0 16px 10px 16px" }}
                                  >
                                    <p style={styles.catatanAdmin}>
                                      Catatan Admin: {item.catatanAdmin}
                                    </p>
                                  </td>
                                </tr>
                              )}
                              {sedangEdit && (
                                <tr>
                                  <td
                                    colSpan={7}
                                    style={{
                                      padding: "0 16px 16px 16px",
                                      background: warna.panelAlt,
                                    }}
                                  >
                                    <div style={styles.formInline}>
                                      <label style={styles.labelForm}>
                                        Status baru
                                      </label>
                                      <select
                                        value={formEditStatus.statusFinal}
                                        onChange={(e) =>
                                          setFormEditStatus({
                                            ...formEditStatus,
                                            statusFinal: e.target.value,
                                          })
                                        }
                                        style={styles.selectForm}
                                      >
                                        {DAFTAR_STATUS.map((s) => (
                                          <option key={s} value={s}>
                                            {labelStatusKehadiran(s).teks}
                                          </option>
                                        ))}
                                      </select>
                                      <label style={styles.labelForm}>
                                        Catatan (wajib diisi, jadi jejak alasan
                                        perubahan)
                                      </label>
                                      <textarea
                                        value={formEditStatus.catatanAdmin}
                                        onChange={(e) =>
                                          setFormEditStatus({
                                            ...formEditStatus,
                                            catatanAdmin: e.target.value,
                                          })
                                        }
                                        placeholder="Contoh: Telat karena tugas luar kota, dikonfirmasi lewat WA."
                                        style={styles.textareaForm}
                                      />
                                      <div style={styles.formTombolGroup}>
                                        <button
                                          onClick={() =>
                                            setEditStatusTerbuka(null)
                                          }
                                          style={styles.tombolBatal}
                                        >
                                          Batal
                                        </button>
                                        <button
                                          onClick={() =>
                                            simpanEditStatus(item.id)
                                          }
                                          style={styles.tombolAktifkan}
                                          disabled={sedangSimpanStatusId === item.id}
                                        >
                                          {sedangSimpanStatusId === item.id ? "Menyimpan…" : "Simpan"}
                                        </button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <div
                  className="tabel-fade-kanan"
                  style={{ ...styles.tabelFade, opacity: rekapDiUjung ? 0 : 1 }}
                />
              </div>
            </>
          )}

          {tab === "approval" && (
            <>
              {menunggu.length === 0 && (
                <div style={styles.kosongBox}>
                  <CheckCircle2
                    size={28}
                    strokeWidth={1.6}
                    style={{ ...styles.kosongIkon, color: warna.sukses }}
                  />
                  <p style={styles.kosong}>
                    Tidak ada akun yang menunggu konfirmasi.
                  </p>
                </div>
              )}
              <div style={styles.kartuGrid}>
                {menunggu.map((item) => (
                  <div
                    key={item.id}
                    style={styles.itemCard}
                    className="kartu-hover"
                  >
                    <div style={styles.itemCardHeader}>
                      <div style={styles.avatarMini}>
                        {inisialNama(item.nama)}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <strong style={styles.itemNama}>{item.nama}</strong>
                        <p style={styles.itemSub}>{item.email}</p>
                      </div>
                      <span style={styles.badgeMenunggu}>Menunggu</span>
                    </div>

                    {item.dibuatPada && (
                      <p style={styles.itemMetaDaftar}>
                        <Clock size={11} strokeWidth={2} />
                        Mendaftar{" "}
                        {new Date(item.dibuatPada).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    )}

                    {formAktivasiTerbuka !== item.id ? (
                      <button
                        onClick={() => bukaFormAktivasi(item.id)}
                        style={styles.tombolAktifkan}
                      >
                        Aktifkan Akun
                      </button>
                    ) : (
                      <div style={styles.formInline}>
                        <label style={styles.labelForm}>Jabatan</label>
                        <input
                          value={formAktivasi.jabatan}
                          onChange={(e) =>
                            setFormAktivasi({
                              ...formAktivasi,
                              jabatan: e.target.value,
                            })
                          }
                          placeholder="Contoh: Teknisi"
                          style={styles.inputForm}
                        />
                        <label style={styles.labelForm}>Divisi</label>
                        <input
                          value={formAktivasi.divisi}
                          onChange={(e) =>
                            setFormAktivasi({
                              ...formAktivasi,
                              divisi: e.target.value,
                            })
                          }
                          placeholder="Contoh: Operasional"
                          style={styles.inputForm}
                        />
                        {daftarKantorState.length > 0 && (
                          <>
                            <label style={styles.labelForm}>
                              Kantor / Lokasi Kerja
                            </label>
                            <select
                              value={formAktivasi.kantorId}
                              onChange={(e) =>
                                setFormAktivasi({
                                  ...formAktivasi,
                                  kantorId: e.target.value,
                                })
                              }
                              style={styles.inputForm}
                            >
                              {daftarKantorState.map((k) => (
                                <option key={k.id} value={k.id}>
                                  {k.namaKantor}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                        <div style={styles.formTombolGroup}>
                          <button
                            onClick={() => setFormAktivasiTerbuka(null)}
                            style={styles.tombolBatal}
                          >
                            Batal
                          </button>
                          <button
                            onClick={() => kirimAktivasi(item.id)}
                            style={styles.tombolAktifkan}
                          >
                            Simpan & Aktifkan
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "karyawan" && (
            <>
              {!loadingKaryawan && karyawan.length > 0 && (
                <input
                  type="text"
                  value={cariKaryawan}
                  onChange={(e) => setCariKaryawan(e.target.value)}
                  placeholder="Cari nama, email, jabatan, atau divisi…"
                  style={styles.kotakCari}
                  className="input-fokus"
                />
              )}

              <p style={styles.hintGeser} className="hint-geser">
                <ArrowRight
                  size={13}
                  strokeWidth={2}
                  style={{ verticalAlign: "-2px", marginRight: 4 }}
                />
                Geser tabel ke kanan untuk lihat status
              </p>
              <div style={styles.tabelWrapperLuar}>
                <div
                  style={styles.tabelWrapper}
                  className="tabel-scroll"
                  onScroll={(e) => cekUjungScroll(e, setKaryawanDiUjung)}
                >
                  <table style={styles.tabel}>
                    <thead>
                      <tr>
                        <th style={{ ...styles.th, ...styles.thSticky }}>
                          Nama
                        </th>
                        <th style={styles.th}>Email</th>
                        <th style={styles.th}>Jabatan / Divisi</th>
                        <th style={styles.th}>Status</th>
                        <th style={styles.th}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingKaryawan && <SkeletonBaris jumlah={6} />}

                      {!loadingKaryawan && karyawan.length === 0 && (
                        <tr>
                          <td colSpan={5} style={styles.tdKosong}>
                            Belum ada karyawan aktif.
                          </td>
                        </tr>
                      )}
                      {!loading &&
                        karyawan.length > 0 &&
                        karyawanTersaring.length === 0 && (
                          <tr>
                            <td colSpan={5} style={styles.tdKosong}>
                              Tidak ada hasil untuk "{cariKaryawan}".
                            </td>
                          </tr>
                        )}

                      {!loading &&
                        karyawanTersaring.map((item) => (
                          <Fragment key={item.id}>
                            <tr className="baris-hover">
                              <td style={{ ...styles.td, ...styles.tdSticky }}>
                                <div style={styles.tdNamaWrap}>
                                  <div style={styles.avatarTabelMini}>
                                    {inisialNama(item.nama)}
                                  </div>
                                  <strong
                                    style={{
                                      color: warna.tinta,
                                      fontSize: 13.5,
                                    }}
                                  >
                                    {item.nama}
                                  </strong>
                                </div>
                              </td>
                              <td
                                style={{
                                  ...styles.td,
                                  color: warna.tintaLembut,
                                  fontSize: 12.5,
                                }}
                              >
                                {item.email}
                              </td>
                              <td style={styles.td}>
                                {item.jabatan || "-"} · {item.divisi || "-"}
                                {item.kantor?.namaKantor ? (
                                  <div style={styles.tdSub}>
                                    {item.kantor.namaKantor}
                                  </div>
                                ) : null}
                              </td>
                              <td style={styles.td}>
                                <span
                                  style={{
                                    ...styles.badge,
                                    color:
                                      item.statusAkun === "aktif"
                                        ? warna.sukses
                                        : warna.tintaSamar,
                                    background:
                                      item.statusAkun === "aktif"
                                        ? warna.suksesLembut
                                        : warna.panelAlt,
                                  }}
                                >
                                  {item.statusAkun === "aktif"
                                    ? "Aktif"
                                    : "Nonaktif"}
                                </span>
                              </td>
                              <td style={{ ...styles.td, textAlign: "right" }}>
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 6,
                                    justifyContent: "flex-end",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <button
                                    onClick={() => bukaResetPassword(item.id)}
                                    style={styles.tombolEditKecil}
                                  >
                                    Reset Password
                                  </button>
                                  {item.statusAkun === "aktif" ? (
                                    <button
                                      onClick={() =>
                                        setKonfirmasiStatusTerbuka(
                                          konfirmasiStatusTerbuka === item.id
                                            ? null
                                            : item.id,
                                        )
                                      }
                                      style={styles.tombolNonaktifkanKecil}
                                    >
                                      {konfirmasiStatusTerbuka === item.id
                                        ? "Tutup"
                                        : "Nonaktifkan"}
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        ubahStatusKaryawan(item.id, "aktif")
                                      }
                                      style={styles.tombolEditKecil}
                                    >
                                      Aktifkan Kembali
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {resetPasswordHasil?.id === item.id && (
                              <tr>
                                <td
                                  colSpan={5}
                                  style={{
                                    padding: "0 16px 16px 16px",
                                    background: warna.panelAlt,
                                  }}
                                >
                                  <div style={styles.hasilResetBox}>
                                    <p style={styles.hasilResetTeks}>
                                      Password sementara untuk{" "}
                                      <strong>{item.nama}</strong>:
                                    </p>
                                    <div style={styles.hasilResetKode}>
                                      {resetPasswordHasil.password}
                                    </div>
                                    <p style={styles.hasilResetCatatan}>
                                      Sampaikan ini secara manual (WA/telepon)
                                      ke karyawan, lalu minta segera diganti
                                      lewat menu "Ganti Password".
                                    </p>
                                    <button
                                      onClick={() =>
                                        setResetPasswordHasil(null)
                                      }
                                      style={styles.tombolBatal}
                                    >
                                      Tutup
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )}
                            {konfirmasiStatusTerbuka === item.id && (
                              <tr>
                                <td
                                  colSpan={5}
                                  style={{
                                    padding: "0 16px 16px 16px",
                                    background: warna.panelAlt,
                                  }}
                                >
                                  <div style={styles.konfirmasiInline}>
                                    <span style={styles.konfirmasiTeks}>
                                      Yakin nonaktifkan {item.nama}?
                                    </span>
                                    <div style={styles.formTombolGroup}>
                                      <button
                                        onClick={() =>
                                          setKonfirmasiStatusTerbuka(null)
                                        }
                                        style={styles.tombolBatal}
                                      >
                                        Batal
                                      </button>
                                      <button
                                        onClick={() =>
                                          ubahStatusKaryawan(
                                            item.id,
                                            "nonaktif",
                                          )
                                        }
                                        style={styles.tombolNonaktifkan}
                                      >
                                        Ya, Nonaktifkan
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div
                  className="tabel-fade-kanan"
                  style={{
                    ...styles.tabelFade,
                    opacity: karyawanDiUjung ? 0 : 1,
                  }}
                />
              </div>
            </>
          )}

          {tabPernahDibuka.izin && (
            <div style={{ display: tab === "izin" ? "block" : "none" }}>
              <AdminIzin />
            </div>
          )}

          {tabPernahDibuka.gaji && (
            <div style={{ display: tab === "gaji" ? "block" : "none" }}>
              <PengaturanGaji />
            </div>
          )}

          {tabPernahDibuka["gaji-massal"] && (
            <div style={{ display: tab === "gaji-massal" ? "block" : "none" }}>
              <AdminGajiMassal />
            </div>
          )}

          {tab === "kantor" && (
            <>
              <div style={styles.kantorInfoBanner}>
                <div style={styles.kantorInfoIcon}>
                  <Building2 size={18} strokeWidth={2} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={styles.kantorInfoTitle}>
                    Kantor Pusat PT. Zaman Teknindo
                  </p>
                  <p style={styles.kantorInfoText}>
                    Kantor perusahaan berada di Pekanbaru. Karyawan dapat
                    bekerja atau bertugas di berbagai wilayah Indonesia,
                    sehingga data kantor ini digunakan sebagai referensi
                    organisasi, sedangkan lokasi absensi mengikuti lokasi aktual
                    karyawan.
                  </p>
                </div>
              </div>

              <div style={styles.kartuFormKantor}>
                <div style={styles.headerFormKantor}>
                  <div>
                    <p style={styles.judulFormKantor}>
                      {kantorEditId !== null
                        ? "Edit Data Kantor Pusat"
                        : "Data Kantor Pusat"}
                    </p>
                    <p style={styles.subJudulFormKantor}>
                      Isi alamat dan koordinat resmi kantor. Koordinat boleh
                      dikosongkan sampai data lokasi resmi tersedia.
                    </p>
                  </div>
                  {kantorEditId !== null && (
                    <span style={styles.badgeKantorEdit}>Mode Edit</span>
                  )}
                </div>

                <div style={styles.formGridKantor}>
                  <div style={styles.fieldKantor}>
                    <label style={styles.labelForm}>Nama Kantor</label>
                    <input
                      value={formKantor.namaKantor}
                      onChange={(e) =>
                        setFormKantor({
                          ...formKantor,
                          namaKantor: e.target.value,
                        })
                      }
                      placeholder="Contoh: Kantor Pusat PT. Zaman Teknindo"
                      style={styles.inputFormKantor}
                    />
                  </div>

                  <div style={styles.fieldKantor}>
                    <label style={styles.labelForm}>Alamat Kantor</label>
                    <input
                      value={formKantor.alamat}
                      onChange={(e) =>
                        setFormKantor({ ...formKantor, alamat: e.target.value })
                      }
                      placeholder="Alamat resmi kantor di Pekanbaru"
                      style={styles.inputFormKantor}
                    />
                  </div>

                  <div style={styles.fieldKantor}>
                    <label style={styles.labelForm}>
                      <span style={styles.labelDenganIkon}>
                        <MapPin size={13} />
                        Latitude
                      </span>
                      <span style={styles.labelOpsional}>(opsional)</span>
                    </label>
                    <input
                      value={formKantor.latitude}
                      onChange={(e) =>
                        setFormKantor({
                          ...formKantor,
                          latitude: e.target.value,
                        })
                      }
                      placeholder="Masukkan latitude resmi"
                      style={styles.inputFormKantor}
                      inputMode="decimal"
                    />
                  </div>

                  <div style={styles.fieldKantor}>
                    <label style={styles.labelForm}>
                      <span style={styles.labelDenganIkon}>
                        <MapPin size={13} />
                        Longitude
                      </span>
                      <span style={styles.labelOpsional}>(opsional)</span>
                    </label>
                    <input
                      value={formKantor.longitude}
                      onChange={(e) =>
                        setFormKantor({
                          ...formKantor,
                          longitude: e.target.value,
                        })
                      }
                      placeholder="Masukkan longitude resmi"
                      style={styles.inputFormKantor}
                      inputMode="decimal"
                    />
                  </div>
                </div>

                <div style={styles.kantorActionRow}>
                  {kantorEditId !== null && (
                    <button
                      onClick={bukaFormTambahKantor}
                      style={styles.tombolBatal}
                    >
                      Batal Edit
                    </button>
                  )}
                  <button
                    onClick={simpanKantor}
                    style={styles.tombolAktifkan}
                    disabled={sedangSimpanKantor}
                  >
                    {sedangSimpanKantor
                      ? "Menyimpan…"
                      : kantorEditId !== null
                        ? "Simpan Perubahan"
                        : "Simpan Kantor Pusat"}
                  </button>
                </div>
              </div>

              <div style={styles.kantorListHeader}>
                <div>
                  <h2 style={styles.kantorListTitle}>Data Kantor Tersimpan</h2>
                  <p style={styles.kantorListSubTitle}>
                    Saat ini cukup gunakan satu data kantor pusat sesuai kondisi
                    perusahaan.
                  </p>
                </div>
                <span style={styles.kantorCountBadge}>
                  {loadingKantor
                    ? "Memuat…"
                    : `${daftarKantorState.length} data`}
                </span>
              </div>

              <div style={styles.kartuGrid}>
                {loadingKantor ? (
                  <div style={{ width: "100%" }}>
                    <table style={styles.tabel}>
                      <tbody>
                        <SkeletonBaris jumlah={4} />
                      </tbody>
                    </table>
                  </div>
                ) : (
                  daftarKantorState.map((k) => (
                    <div
                      key={k.id}
                      style={styles.kantorCard}
                      className="kartu-hover"
                    >
                      <div style={styles.kantorCardTop}>
                        <div style={styles.kantorCardIcon}>
                          <Building2 size={18} />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <strong style={styles.itemNama}>
                            {k.namaKantor}
                          </strong>
                          <p style={styles.itemSub}>
                            {k.alamat || "Alamat belum diisi"}
                          </p>
                        </div>
                        <span style={styles.badgeKantorAktif}>
                          Kantor Pusat
                        </span>
                      </div>

                      <div style={styles.kantorMetaGrid}>
                        <div style={styles.kantorMetaItem}>
                          <span style={styles.kantorMetaLabel}>Karyawan</span>
                          <strong style={styles.kantorMetaValue}>
                            {k._count?.pengguna ?? 0}
                          </strong>
                        </div>
                        <div style={styles.kantorMetaItem}>
                          <span style={styles.kantorMetaLabel}>Koordinat</span>
                          <strong style={styles.kantorMetaValue}>
                            {k.latitude != null && k.longitude != null
                              ? "Tersedia"
                              : "Belum diisi"}
                          </strong>
                        </div>
                      </div>

                      <div style={styles.kantorCardFooter}>
                        <span style={styles.kantorHint}>
                          <Info size={13} />
                          Lokasi absensi mengikuti lokasi aktual karyawan.
                        </span>
                        <button
                          onClick={() => bukaFormEditKantor(k)}
                          style={styles.tombolEditKantor}
                        >
                          Edit Data
                        </button>
                      </div>
                    </div>
                  ))
                )}

                {!loadingKantor && daftarKantorState.length === 0 && (
                  <div style={styles.kantorEmptyBox}>
                    <Building2 size={28} strokeWidth={1.6} />
                    <p style={styles.kantorEmptyTitle}>
                      Data kantor pusat belum tersimpan
                    </p>
                    <p style={styles.kantorEmptyText}>
                      Isi form di atas menggunakan alamat kantor resmi PT. Zaman
                      Teknindo di Pekanbaru.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  // Dulu "minHeight: 100vh" tanpa batas overflow -- akibatnya kalau konten
  // sebuah tab panjang (misal halaman Gaji), SELURUH halaman ikut discroll
  // termasuk sidebar-nya, jadi sidebar kelihatan "ikut kabur" ke atas.
  // Sekarang shell dikunci setinggi layar (height, bukan minHeight) + overflow
  // hidden, supaya sidebar & konten masing-masing scroll sendiri-sendiri --
  // pola "app shell" standar: sidebar diam, cuma konten kanan yang jalan.
  shell: {
    display: "flex",
    height: "100svh",
    overflow: "hidden",
    background: warna.latar,
    fontFamily: font.display,
  },

  // ---------- SIDEBAR ----------
  sidebar: {
    width: 232,
    background: warna.panel,
    borderRight: `1px solid ${warna.garis}`,
    display: "flex",
    flexDirection: "column",
    padding: "22px 14px",
    flexShrink: 0,
    overflowY: "auto",
  },
  sidebarAtas: { padding: "0 8px", marginBottom: 26 },
  logoSidebar: {
    height: 42,
    maxWidth: "100%",
    width: "auto",
    objectFit: "contain",
    objectPosition: "left center",
    display: "block",
  },
  navSidebar: { display: "flex", flexDirection: "column", gap: 4, flex: 1 },
  navGrup: { display: "flex", flexDirection: "column", gap: 2 },
  navGrupLabel: {
    margin: "12px 10px 4px",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: warna.tintaSamar,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    background: "none",
    border: "none",
    borderRadius: 8,
    fontSize: 13.5,
    color: warna.tintaLembut,
    cursor: "pointer",
    fontWeight: 500,
    textAlign: "left",
  },
  navItemAktif: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    background: warna.aksenLembut,
    border: "none",
    borderRadius: 8,
    fontSize: 13.5,
    color: warna.aksen,
    cursor: "pointer",
    fontWeight: 700,
    textAlign: "left",
  },
  navIkon: { flexShrink: 0 },
  navBadge: {
    background: warna.bahaya,
    color: "#fff",
    fontSize: 10.5,
    fontWeight: 700,
    borderRadius: 20,
    padding: "1px 7px",
  },
  sidebarBawah: {
    borderTop: `1px solid ${warna.garis}`,
    paddingTop: 14,
    marginTop: 10,
  },
  profilSidebar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 8px",
    marginBottom: 10,
  },
  avatarLingkaran: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: warna.tinta,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
  },
  namaProfil: {
    margin: 0,
    fontSize: 13,
    color: warna.tinta,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  perananProfil: { margin: 0, fontSize: 11, color: warna.tintaSamar },
  // Dua tombol aksi (Ganti Password & Keluar) berdampingan sebagai kartu
  // kecil bertepi, bukan lagi teks polos tanpa bingkai
  aksiSidebarRow: { display: "flex", gap: 6 },
  tombolAksiSidebar: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    background: warna.panelAlt,
    border: `1px solid ${warna.garis}`,
    borderRadius: 8,
    padding: "8px 6px",
    fontSize: 11.5,
    fontWeight: 600,
    color: warna.tintaLembut,
    cursor: "pointer",
  },
  tombolAksiSidebarBahaya: { color: warna.bahaya },

  // ---------- MAIN AREA ----------
  mainArea: {
    flex: 1,
    minWidth: 0,
    padding: "26px 32px",
    overflowY: "auto",
    height: "100%",
  },
  topbarMobile: {
    display: "none",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    position: "sticky",
    top: 0,
    zIndex: 10,
    background: warna.latar,
    padding: "4px 0",
  },
  tombolHamburger: {
    background: warna.panel,
    border: `1px solid ${warna.garis}`,
    borderRadius: 8,
    padding: 8,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
  },
  topbarLogoKecil: { height: 28, objectFit: "contain" },
  topbarJudul: { fontSize: 15, fontWeight: 700, color: warna.tinta },
  headerAtas: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 22,
  },
  judulHalaman: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
    color: warna.tinta,
  },
  subJudulHalaman: {
    margin: "4px 0 0 0",
    fontSize: 13,
    color: warna.tintaLembut,
  },

  notifikasiWrapper: { position: "relative", flexShrink: 0 },
  notifikasiButton: {
    position: "relative",
    width: 40,
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    border: `1px solid ${warna.garis}`,
    background: warna.panel,
    color: warna.tinta,
    cursor: "pointer",
  },
  notifikasiCount: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    padding: "0 5px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    background: warna.bahaya,
    color: "#fff",
    border: "2px solid #fff",
    fontSize: 9,
    fontWeight: 800,
    lineHeight: 1,
  },
  notifikasiPanel: {
    position: "absolute",
    top: 48,
    right: 0,
    width: 340,
    maxWidth: "calc(100vw - 32px)",
    background: warna.panel,
    border: `1px solid ${warna.garis}`,
    borderRadius: 14,
    boxShadow: "0 16px 40px rgba(22,35,61,0.14)",
    overflow: "hidden",
    zIndex: 30,
  },
  notifikasiPanelHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 14px 12px",
    borderBottom: `1px solid ${warna.garis}`,
  },
  notifikasiPanelTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 750,
    color: warna.tinta,
  },
  notifikasiPanelSubTitle: {
    margin: "3px 0 0",
    fontSize: 10.5,
    color: warna.tintaSamar,
  },
  notifikasiCloseButton: {
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    borderRadius: 8,
    background: warna.panelAlt,
    color: warna.tintaLembut,
    cursor: "pointer",
    flexShrink: 0,
  },
  notifikasiList: { display: "flex", flexDirection: "column" },
  notifikasiItem: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    border: "none",
    borderBottom: `1px solid ${warna.garis}`,
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
  },
  notifikasiItemIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  notifikasiItemContent: {
    minWidth: 0,
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  notifikasiItemJudul: { fontSize: 12, fontWeight: 700, color: warna.tinta },
  notifikasiItemSub: { fontSize: 11, color: warna.tintaLembut },
  notifikasiArrow: { color: warna.tintaSamar, flexShrink: 0 },
  notifikasiKosong: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "28px 18px",
    color: warna.tintaSamar,
    textAlign: "center",
  },
  notifikasiFooter: {
    padding: "9px 14px",
    background: warna.panelAlt,
    color: warna.tintaSamar,
    fontSize: 9.5,
    textAlign: "center",
  },

  content: { maxWidth: 1040 },

  toastBase: {
    position: "fixed",
    top: 20,
    right: 20,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "min(380px, calc(100vw - 40px))",
    boxSizing: "border-box",
    padding: "12px 15px",
    borderRadius: 12,
    background: warna.panel,
    fontFamily: font.display,
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.45,
    boxShadow: "0 12px 30px rgba(22, 35, 61, 0.14)",
  },
  toastSukses: {
    position: "fixed",
    top: 20,
    right: 20,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "min(380px, calc(100vw - 40px))",
    boxSizing: "border-box",
    padding: "12px 15px",
    borderRadius: 12,
    border: `1px solid ${warna.aksenLembut}`,
    background: warna.panel,
    color: warna.tinta,
    fontFamily: font.display,
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.45,
    boxShadow: "0 12px 30px rgba(22, 35, 61, 0.14)",
  },
  toastError: {
    position: "fixed",
    top: 20,
    right: 20,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "min(380px, calc(100vw - 40px))",
    boxSizing: "border-box",
    padding: "12px 15px",
    borderRadius: 12,
    border: `1px solid ${warna.bahayaLembut}`,
    background: warna.panel,
    color: warna.bahaya,
    fontFamily: font.display,
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.45,
    boxShadow: "0 12px 30px rgba(22, 35, 61, 0.14)",
  },
  toastIconSukses: {
    width: 24,
    height: 24,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    background: warna.aksenLembut,
    color: warna.aksen,
    fontSize: 13,
    fontWeight: 800,
  },
  toastIconError: {
    width: 24,
    height: 24,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    background: warna.bahayaLembut,
    color: warna.bahaya,
    fontSize: 13,
    fontWeight: 800,
  },
  toastText: {
    flex: 1,
    minWidth: 0,
  },

  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
    marginBottom: 18,
  },

  // ---------- Panel Tren & Analisis (collapsible) ----------
  tombolTogglePanel: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: warna.panel,
    border: `1px solid ${warna.garis}`,
    borderRadius: 10,
    padding: "12px 16px",
    fontSize: 13,
    fontWeight: 600,
    color: warna.tinta,
    cursor: "pointer",
    marginBottom: 12,
  },
  panelRingkasan: { marginBottom: 18 },
  ringkasanGrid: { display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 },
  ringkasanKotak: {
    background: warna.panel,
    border: `1px solid ${warna.garis}`,
    borderRadius: 10,
    padding: "14px 16px",
  },
  ringkasanJudul: {
    fontSize: 12.5,
    fontWeight: 600,
    color: warna.tintaLembut,
    margin: "0 0 12px 0",
  },
  chartBarGroup: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
    height: 76,
  },
  chartKolom: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
    flex: 1,
  },
  chartBatangWrapper: {
    display: "flex",
    flexDirection: "column-reverse",
    alignItems: "center",
    width: "100%",
    maxWidth: 26,
  },
  chartSegmen: { width: "100%", borderRadius: 2 },
  chartBatangKosong: {
    width: "100%",
    height: 3,
    borderRadius: 2,
    background: warna.panelAlt,
  },
  chartLabelHari: { fontSize: 10.5, color: warna.tintaSamar },
  sorotanBaris: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "7px 0",
    borderBottom: `1px solid ${warna.garis}`,
    fontSize: 12.5,
  },
  sorotanNama: { color: warna.tinta },
  sorotanNamaWrap: { display: "flex", alignItems: "center", gap: 8 },
  sorotanPeringkat: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: warna.panelAlt,
    color: warna.tintaSamar,
    fontSize: 10,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  legendaChart: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px 12px",
    margin: "-6px 0 12px",
  },
  legendaItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 10.5,
    color: warna.tintaLembut,
  },
  legendaDot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0 },
  sorotanAngka: {
    fontSize: 11.5,
    color: warna.tintaLembut,
    fontWeight: 600,
    fontFamily: font.mono,
  },
  statCard: {
    background: warna.panel,
    borderRadius: 10,
    padding: "16px 18px",
    border: `1px solid ${warna.garis}`,
    borderLeft: `3px solid ${warna.tinta}`,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  statAngka: {
    fontSize: 26,
    fontWeight: 700,
    color: warna.tinta,
    fontFamily: font.mono,
    lineHeight: 1,
  },
  statLabel: { fontSize: 12, color: warna.tintaLembut, fontWeight: 500 },
  statHint: { fontSize: 10.5, color: warna.tintaSamar, marginTop: 1 },
  panelBelumAbsen: {
    background: warna.panel,
    border: `1px solid ${warna.garis}`,
    borderRadius: 10,
    padding: "14px 16px",
    marginBottom: 12,
  },
  panelBelumAbsenHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  panelBelumAbsenJudul: {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    color: warna.tinta,
  },
  panelBelumAbsenSub: {
    margin: "3px 0 0",
    fontSize: 11.5,
    color: warna.tintaSamar,
  },
  tombolTutupPanel: {
    background: "transparent",
    border: `1px solid ${warna.garis}`,
    color: warna.tintaLembut,
    borderRadius: 7,
    padding: "6px 9px",
    fontSize: 11.5,
    cursor: "pointer",
    flexShrink: 0,
  },
  belumAbsenGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
    gap: 8,
  },
  belumAbsenItem: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "9px 10px",
    background: warna.panelAlt,
    border: `1px solid ${warna.garis}`,
    borderRadius: 8,
    minWidth: 0,
  },
  avatarMini: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: warna.aksen,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 10.5,
    fontWeight: 700,
    flexShrink: 0,
  },
  tdNamaWrap: { display: "flex", alignItems: "center", gap: 9 },
  avatarTabelMini: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: warna.aksenLembut,
    color: warna.aksen,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 9.5,
    fontWeight: 700,
    flexShrink: 0,
  },
  belumAbsenNama: {
    display: "block",
    fontSize: 12.5,
    color: warna.tinta,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  belumAbsenSubItem: {
    margin: "2px 0 0",
    fontSize: 10.5,
    color: warna.tintaSamar,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  belumAbsenKosong: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 8,
    background: warna.panelAlt,
    color: warna.tintaLembut,
    fontSize: 12,
  },

  kotakCari: {
    width: "100%",
    maxWidth: 360,
    padding: "10px 14px",
    marginBottom: 14,
    borderRadius: 10,
    border: `1px solid ${warna.garis}`,
    fontSize: 13.5,
    color: warna.tinta,
    background: warna.panel,
    boxSizing: "border-box",
    fontFamily: font.display,
  },

  // ---------- TABEL ----------
  // Wrapper diberi position:relative supaya bisa ditumpuki gradient fade
  // (lihat "tabelFade") sebagai penanda "masih ada kolom di sebelah kanan, geser dong"
  tabelWrapperLuar: { position: "relative" },
  tabelWrapper: {
    background: warna.panel,
    border: `1px solid ${warna.garis}`,
    borderRadius: 12,
    overflow: "auto",
    maxWidth: "100%",
    WebkitOverflowScrolling: "touch",
  },
  // Gradient tipis di tepi kanan tabel, HANYA terlihat kalau tabelnya memang
  // lebih lebar dari kontainer (lihat className "tabel-fade" + CSS di index.css)
  tabelFade: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: 28,
    background: `linear-gradient(to right, transparent, ${warna.panel})`,
    pointerEvents: "none",
    borderRadius: "0 12px 12px 0",
  },
  tabel: { width: "100%", borderCollapse: "collapse", minWidth: 640 },
  th: {
    textAlign: "left",
    fontSize: 11,
    fontWeight: 700,
    color: warna.tintaSamar,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    padding: "12px 16px",
    borderBottom: `1px solid ${warna.garis}`,
    background: warna.panelAlt,
  },
  // Kolom pertama (nama karyawan) dibuat "lengket" ke kiri saat tabel digeser
  // ke samping di HP, supaya orang tetap tahu baris ini punya siapa
  thSticky: { position: "sticky", left: 0, zIndex: 1 },
  td: {
    padding: "13px 16px",
    borderBottom: `1px solid ${warna.garis}`,
    fontSize: 13,
    color: warna.tinta,
    verticalAlign: "top",
  },
  tdSticky: {
    position: "sticky",
    left: 0,
    background: warna.panel,
    zIndex: 1,
    boxShadow: `1px 0 0 ${warna.garis}`,
  },
  tdSub: { fontSize: 11.5, color: warna.tintaLembut, marginTop: 2 },
  tdKosong: {
    textAlign: "center",
    padding: "40px 16px",
    color: warna.tintaSamar,
    fontSize: 13.5,
  },
  mono: { fontFamily: font.mono, fontWeight: 600 },
  hintGeser: {
    alignItems: "center",
    gap: 6,
    fontSize: 11.5,
    color: warna.tintaSamar,
    margin: "0 0 8px 2px",
  },

  badge: {
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: 10,
    whiteSpace: "nowrap",
  },

  // ---------- KARTU (dipakai buat tab Menunggu) ----------
  kartuGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 10,
  },
  itemCard: {
    background: warna.panel,
    borderRadius: 10,
    padding: 16,
    border: `1px solid ${warna.garis}`,
    borderLeft: `3px solid ${warna.peringatan}`,
    transition:
      "border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease",
  },
  itemCardHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  badgeMenunggu: {
    flexShrink: 0,
    fontSize: 10.5,
    fontWeight: 700,
    color: warna.peringatan,
    background: warna.peringatanLembut,
    padding: "3px 8px",
    borderRadius: 999,
  },
  itemMetaDaftar: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    color: warna.tintaSamar,
    margin: "-4px 0 12px",
  },
  itemNama: { fontSize: 14.5, color: warna.tinta },
  itemSub: { fontSize: 12.5, color: warna.tintaLembut, margin: "3px 0 0 0" },

  kosongBox: {
    textAlign: "center",
    padding: "48px 24px",
    background: warna.panel,
    borderRadius: 10,
    border: `1px dashed ${warna.garis}`,
  },
  kosongIkon: {
    display: "block",
    marginBottom: 8,
    marginLeft: "auto",
    marginRight: "auto",
  },
  kosong: {
    textAlign: "center",
    color: warna.tintaSamar,
    fontSize: 13.5,
    margin: 0,
  },

  catatanAdmin: {
    fontSize: 11.5,
    color: warna.tintaLembut,
    background: "#fff",
    borderLeft: `3px solid ${warna.aksen}`,
    padding: "8px 10px",
    borderRadius: 8,
    margin: 0,
  },
  tombolEditKecil: {
    padding: "7px 12px",
    background: "none",
    color: warna.tinta,
    border: `1px solid ${warna.garis}`,
    borderRadius: 8,
    fontSize: 11.5,
    cursor: "pointer",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  formInline: {
    paddingTop: 12,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    maxWidth: 420,
  },
  labelForm: {
    fontSize: 11,
    color: warna.tintaLembut,
    fontWeight: 600,
    marginTop: 6,
  },
  inputForm: {
    padding: "8px 10px",
    border: `1px solid ${warna.garis}`,
    borderRadius: 8,
    fontSize: 13,
    color: warna.tinta,
    fontFamily: font.display,
  },
  selectForm: {
    padding: "8px 10px",
    border: `1px solid ${warna.garis}`,
    borderRadius: 8,
    fontSize: 13,
    color: warna.tinta,
    fontFamily: font.display,
    background: "#fff",
  },
  textareaForm: {
    padding: "8px 10px",
    border: `1px solid ${warna.garis}`,
    borderRadius: 8,
    fontSize: 13,
    color: warna.tinta,
    fontFamily: font.display,
    minHeight: 56,
    resize: "vertical",
  },
  formTombolGroup: { display: "flex", gap: 8, marginTop: 8 },
  tombolBatal: {
    flex: 1,
    padding: "9px 14px",
    background: "none",
    color: warna.tintaLembut,
    border: `1px solid ${warna.garis}`,
    borderRadius: 8,
    fontSize: 12.5,
    cursor: "pointer",
    fontWeight: 600,
  },
  konfirmasiInline: { paddingTop: 12 },
  konfirmasiTeks: { fontSize: 12.5, color: warna.tinta, fontWeight: 500 },
  hasilResetBox: { paddingTop: 12, maxWidth: 420 },
  hasilResetTeks: { fontSize: 12.5, color: warna.tinta, margin: "0 0 8px 0" },
  hasilResetKode: {
    fontFamily: font.mono,
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: warna.aksen,
    background: "#fff",
    border: `1.5px dashed ${warna.aksen}`,
    borderRadius: 8,
    padding: "10px 14px",
    textAlign: "center",
    marginBottom: 8,
    userSelect: "all",
  },
  hasilResetCatatan: {
    fontSize: 11.5,
    color: warna.tintaLembut,
    margin: "0 0 10px 0",
    lineHeight: 1.5,
  },
  tombolAktifkan: {
    padding: "9px 16px",
    background: warna.aksen,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 12.5,
    cursor: "pointer",
    fontWeight: 600,
  },
  tombolNonaktifkan: {
    padding: "9px 16px",
    background: "#fff",
    color: warna.bahaya,
    border: `1px solid ${warna.bahaya}`,
    borderRadius: 8,
    fontSize: 12.5,
    cursor: "pointer",
    fontWeight: 600,
  },
  tombolNonaktifkanKecil: {
    padding: "7px 12px",
    background: "none",
    color: warna.bahaya,
    border: `1px solid ${warna.bahaya}`,
    borderRadius: 8,
    fontSize: 11.5,
    cursor: "pointer",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },

  kantorInfoBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    background: warna.aksenLembut,
    border: `1px solid ${warna.garis}`,
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 14,
  },
  kantorInfoIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: warna.panel,
    color: warna.aksen,
    border: `1px solid ${warna.garis}`,
  },
  kantorInfoTitle: {
    margin: 0,
    fontSize: 13.5,
    fontWeight: 700,
    color: warna.tinta,
  },
  kantorInfoText: {
    margin: "4px 0 0",
    fontSize: 11.5,
    lineHeight: 1.6,
    color: warna.tintaLembut,
  },
  kartuFormKantor: {
    background: warna.panel,
    borderRadius: 12,
    padding: 20,
    border: `1px solid ${warna.garis}`,
    marginBottom: 18,
  },
  headerFormKantor: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  judulFormKantor: {
    fontSize: 15,
    fontWeight: 700,
    color: warna.tinta,
    margin: 0,
  },
  subJudulFormKantor: {
    fontSize: 11.5,
    color: warna.tintaLembut,
    margin: "4px 0 0",
    lineHeight: 1.55,
    maxWidth: 680,
  },
  badgeKantorEdit: {
    flexShrink: 0,
    padding: "4px 9px",
    borderRadius: 999,
    background: warna.peringatanLembut,
    color: warna.peringatan,
    fontSize: 10.5,
    fontWeight: 700,
  },
  formGridKantor: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
    marginTop: 4,
  },
  fieldKantor: { minWidth: 0 },
  labelDenganIkon: { display: "inline-flex", alignItems: "center", gap: 5 },
  labelOpsional: { color: warna.tintaSamar, marginLeft: 4, fontWeight: 500 },
  inputFormKantor: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    border: `1px solid ${warna.garis}`,
    borderRadius: 9,
    fontSize: 13,
    color: warna.tinta,
    fontFamily: font.display,
    background: "#fff",
    outline: "none",
  },
  kantorActionRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 16,
  },
  kantorListHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  kantorListTitle: {
    margin: 0,
    fontSize: 14.5,
    fontWeight: 700,
    color: warna.tinta,
  },
  kantorListSubTitle: {
    margin: "3px 0 0",
    fontSize: 11.5,
    color: warna.tintaSamar,
  },
  kantorCountBadge: {
    flexShrink: 0,
    padding: "5px 9px",
    borderRadius: 999,
    background: warna.panelAlt,
    color: warna.tintaLembut,
    border: `1px solid ${warna.garis}`,
    fontSize: 10.5,
    fontWeight: 600,
  },
  kantorCard: {
    background: warna.panel,
    borderRadius: 12,
    padding: 16,
    border: `1px solid ${warna.garis}`,
    transition:
      "border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease",
  },
  kantorCardTop: { display: "flex", alignItems: "flex-start", gap: 10 },
  kantorCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: warna.aksenLembut,
    color: warna.aksen,
  },
  badgeKantorAktif: {
    flexShrink: 0,
    padding: "4px 8px",
    borderRadius: 999,
    background: warna.suksesLembut,
    color: warna.sukses,
    fontSize: 10,
    fontWeight: 700,
  },
  kantorMetaGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginTop: 14,
  },
  kantorMetaItem: {
    background: warna.panelAlt,
    border: `1px solid ${warna.garis}`,
    borderRadius: 9,
    padding: "9px 10px",
  },
  kantorMetaLabel: {
    display: "block",
    fontSize: 10.5,
    color: warna.tintaSamar,
    marginBottom: 3,
  },
  kantorMetaValue: { fontSize: 12.5, color: warna.tinta },
  kantorCardFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 12,
    paddingTop: 11,
    borderTop: `1px solid ${warna.garis}`,
  },
  kantorHint: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
    fontSize: 10.5,
    color: warna.tintaSamar,
    lineHeight: 1.4,
  },
  tombolEditKantor: {
    flexShrink: 0,
    padding: "7px 12px",
    background: "none",
    color: warna.tinta,
    border: `1px solid ${warna.garis}`,
    borderRadius: 8,
    fontSize: 11.5,
    cursor: "pointer",
    fontWeight: 600,
  },
  kantorEmptyBox: {
    gridColumn: "1 / -1",
    textAlign: "center",
    padding: "42px 24px",
    background: warna.panel,
    borderRadius: 12,
    border: `1px dashed ${warna.garis}`,
    color: warna.tintaSamar,
  },
  kantorEmptyTitle: {
    margin: "8px 0 4px",
    color: warna.tinta,
    fontSize: 13.5,
    fontWeight: 600,
  },
  kantorEmptyText: {
    margin: 0,
    maxWidth: 520,
    marginInline: "auto",
    fontSize: 11.5,
    lineHeight: 1.6,
    color: warna.tintaSamar,
  },
  infoKosong: { color: warna.tintaSamar, fontSize: 13.5, gridColumn: "1 / -1" },

  fotoAbsenRow: { display: "flex", gap: 8, marginTop: 10 },
  fotoAbsenThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    objectFit: "cover",
    border: `1px solid ${warna.garis}`,
    cursor: "pointer",
  },
  fotoAbsenLabel: {
    fontSize: 10,
    color: warna.tintaSamar,
    textAlign: "center",
    marginTop: 3,
  },
};
