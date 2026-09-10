import { useEffect, useState, lazy, Suspense, Component } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import { getPenggunaLogin, getToken, hapusSesiLogin } from "./utils/api";
import { pasangWebPushOtomatis } from "./utils/webPush";
import { warna } from "./styles/theme";

const Daftar = lazy(() => import("./pages/Daftar"));
const DashboardKaryawan = lazy(() => import("./pages/DashboardKaryawan"));
const RiwayatAbsensi = lazy(() => import("./pages/RiwayatAbsensi"));
const PengajuanIzin = lazy(() => import("./pages/PengajuanIzin"));
const DashboardAdmin = lazy(() => import("./pages/DashboardAdmin"));
const AdminArsip = lazy(() => import("./pages/AdminArsip"));
const AdminEditKaryawan = lazy(() => import("./pages/AdminEditKaryawan"));
const GantiPassword = lazy(() => import("./pages/GantiPassword"));
const Kiosk = lazy(() => import("./pages/Kiosk"));

const STATUS_ADMIN_TANPA_ABSENSI = [
  { value: "alpha", label: "Alpha" },
  { value: "izin", label: "Izin" },
  { value: "sakit", label: "Sakit" },
  { value: "cuti", label: "Cuti" },
  { value: "urgent", label: "Urgent" },
];

function tanggalHariIniWIB() {
  const bagian = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const hasil = {};
  for (const part of bagian) {
    if (part.type !== "literal") hasil[part.type] = part.value;
  }
  return `${hasil.year}-${hasil.month}-${hasil.day}`;
}

function formatTanggalIndonesia(tanggal) {
  if (!tanggal) return "-";
  return new Date(`${tanggal}T00:00:00.000Z`).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function MemuatHalaman({ penuh = false }) {
  return (
    <div style={{ width: "100%", minHeight: penuh ? "100svh" : "48svh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, boxSizing: "border-box", color: warna.tintaSamar, fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontSize: 14, background: warna.latar }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "11px 15px", borderRadius: 12, border: `1px solid ${warna.garis}`, background: warna.panel, boxShadow: "0 8px 24px rgba(22,35,61,0.06)", fontWeight: 650 }}>
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: warna.aksen, boxShadow: `0 0 0 5px ${warna.aksenLembut}`, flexShrink: 0 }} />
        Memuat halaman...
      </div>
    </div>
  );
}

class BatasKesalahanAplikasi extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("Kesalahan render aplikasi:", error, info);
  }
  cobaLagi = () => this.setState({ hasError: false, error: null });
  kembaliKeLogin = () => {
    hapusSesiLogin();
    window.location.href = "/login";
  };
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ width: "100%", minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, boxSizing: "border-box", background: warna.latar, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
        <div style={{ width: "100%", maxWidth: 520, padding: 24, borderRadius: 18, border: `1px solid ${warna.garis}`, background: warna.panel, boxShadow: "0 18px 48px rgba(22,35,61,0.10)" }}>
          <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 13, background: warna.aksenLembut, color: warna.aksen, fontSize: 21, fontWeight: 900, marginBottom: 14 }}>!</div>
          <h1 style={{ margin: 0, color: warna.tinta, fontSize: 21, lineHeight: 1.25 }}>Halaman mengalami kendala</h1>
          <p style={{ margin: "9px 0 18px", color: warna.tintaLembut, fontSize: 14, lineHeight: 1.6 }}>Sistem tidak dibiarkan menjadi layar putih. Coba muat ulang halaman terlebih dahulu. Jika masih gagal, kembali ke login untuk membuat sesi baru.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button type="button" onClick={this.cobaLagi} style={{ minHeight: 42, padding: "10px 15px", border: 0, borderRadius: 11, background: warna.aksen, color: "#fff", fontWeight: 750, cursor: "pointer" }}>Coba lagi</button>
            <button type="button" onClick={this.kembaliKeLogin} style={{ minHeight: 42, padding: "10px 15px", border: `1px solid ${warna.garis}`, borderRadius: 11, background: warna.panel, color: warna.tinta, fontWeight: 750, cursor: "pointer" }}>Kembali ke login</button>
          </div>
        </div>
      </div>
    );
  }
}

function RuteTerproteksi({ pengguna, peranDiizinkan, children }) {
  if (!pengguna) return <Navigate to="/login" replace />;
  if (peranDiizinkan && !peranDiizinkan.includes(pengguna.peran)) {
    return <Navigate to={pengguna.peran === "admin" ? "/admin" : "/karyawan"} replace />;
  }
  return children;
}

function AdminContextBar({ tanggal, onTanggalChange, onRekapRefresh }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState(() => {
    try {
      return sessionStorage.getItem("admin-tab") || "rekap";
    } catch {
      return "rekap";
    }
  });
  const [panelTerbuka, setPanelTerbuka] = useState(false);
  const [belumAbsen, setBelumAbsen] = useState([]);
  const [loadingBelumAbsen, setLoadingBelumAbsen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [status, setStatus] = useState("alpha");
  const [catatan, setCatatan] = useState("");
  const [simpanId, setSimpanId] = useState(null);
  const [pesan, setPesan] = useState("");
  const [rekapToolbarTerlihat, setRekapToolbarTerlihat] = useState(true);

  useEffect(() => {
    let mounted = true;
    function syncTab() {
      if (!mounted) return;
      try {
        setTab(sessionStorage.getItem("admin-tab") || "rekap");
      } catch {
        // Abaikan storage yang tidak tersedia.
      }
    }
    syncTab();
    const interval = window.setInterval(syncTab, 250);
    window.addEventListener("focus", syncTab);
    window.addEventListener("pageshow", syncTab);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", syncTab);
      window.removeEventListener("pageshow", syncTab);
    };
  }, []);

  useEffect(() => {
    if (tab !== "rekap") return;
    setPanelTerbuka(false);
    setEditId(null);
    setPesan("");
  }, [tab, tanggal]);

  // Toolbar tanggal hanya tampil di bagian atas halaman Rekap.
  // Saat tabel discroll, toolbar disembunyikan agar tidak pernah menutupi
  // baris absensi. Kembali ke atas => toolbar muncul lagi.
  useEffect(() => {
    if (tab !== "rekap") return;

    const target = document.querySelector(".main-area-admin");
    if (!target) return;

    const ketikaScroll = () => {
      const diAtas = target.scrollTop <= 80;
      setRekapToolbarTerlihat(diAtas);
      if (!diAtas) setPanelTerbuka(false);
    };

    ketikaScroll();
    target.addEventListener("scroll", ketikaScroll, { passive: true });
    return () => target.removeEventListener("scroll", ketikaScroll);
  }, [tab]);

  useEffect(() => {
    if (tab !== "rekap") return;
    let mounted = true;
    async function muat() {
      setLoadingBelumAbsen(true);
      try {
        const res = await fetch(`${API_URL}/admin/rekap-tanggal?tanggal=${encodeURIComponent(tanggal)}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.pesan || "Gagal memuat rekap tanggal.");
        if (mounted) setBelumAbsen(Array.isArray(data?.belumAbsen) ? data.belumAbsen : []);
      } catch (error) {
        console.error("Gagal memuat daftar belum absen:", error);
        if (mounted) setBelumAbsen([]);
      } finally {
        if (mounted) setLoadingBelumAbsen(false);
      }
    }
    void muat();
    return () => {
      mounted = false;
    };
  }, [tab, tanggal]);

  if (location.pathname === "/admin/arsip" || location.pathname === "/admin/edit-karyawan") return null;

  let label = "";
  let aksi = null;
  if (tab === "karyawan") {
    label = "Edit Karyawan";
    aksi = () => navigate("/admin/edit-karyawan");
  } else if (tab === "gaji" || tab === "gaji-massal") {
    label = "Arsip & Data";
    aksi = () => navigate("/admin/arsip");
  }

  async function aturStatusTanpaAbsensi(id) {
    if (!catatan.trim()) {
      setPesan("Catatan wajib diisi.");
      return;
    }
    setSimpanId(id);
    setPesan("");
    try {
      const res = await fetch(`${API_URL}/admin/absensi/tanggal/${encodeURIComponent(tanggal)}/pengguna/${id}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ statusFinal: status, catatanAdmin: catatan.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.pesan || "Gagal menyimpan status.");
      setBelumAbsen((sebelumnya) => sebelumnya.filter((item) => item.id !== id));
      setEditId(null);
      setCatatan("");
      setPesan("Status berhasil dicatat.");
      onRekapRefresh();
    } catch (error) {
      setPesan(error?.message || "Gagal menyimpan status.");
    } finally {
      setSimpanId(null);
    }
  }

  if (tab === "rekap") {
    return (
      <>
        <div
          className="admin-rekap-toolbar"
          style={{
            ...styles.adminRekapToolbar,
            opacity: rekapToolbarTerlihat ? 1 : 0,
            visibility: rekapToolbarTerlihat ? "visible" : "hidden",
            pointerEvents: rekapToolbarTerlihat ? "auto" : "none",
            transform: rekapToolbarTerlihat ? "translateY(0)" : "translateY(-12px)",
          }}
        >
          <div style={styles.adminRekapDateCopy}>
            <span style={styles.adminRekapEyebrow}>TANGGAL REKAP</span>
            <strong style={styles.adminRekapDate}>{formatTanggalIndonesia(tanggal)}</strong>
          </div>
          <div style={styles.adminRekapControls}>
            <input type="date" value={tanggal} max={tanggalHariIniWIB()} onChange={(e) => onTanggalChange(e.target.value, false)} style={styles.adminRekapInput} aria-label="Pilih tanggal rekap" />
            <button type="button" onClick={() => setPanelTerbuka((v) => !v)} style={styles.adminRekapButton} aria-expanded={panelTerbuka}>
              {loadingBelumAbsen ? "Memuat…" : `Belum absen (${belumAbsen.length})`}
            </button>
            <button type="button" onClick={() => onTanggalChange(tanggalHariIniWIB(), false)} style={styles.adminRekapToday}>Hari ini</button>
          </div>
        </div>

        {panelTerbuka && (
          <div className="admin-belum-panel" style={styles.adminBelumPanel}>
            <div style={styles.adminBelumHeader}>
              <div>
                <strong style={styles.adminBelumTitle}>Karyawan belum absen</strong>
                <span style={styles.adminBelumSub}>{formatTanggalIndonesia(tanggal)}</span>
              </div>
              <button type="button" onClick={() => setPanelTerbuka(false)} style={styles.adminBelumClose}>Tutup</button>
            </div>
            {belumAbsen.length === 0 ? (
              <div style={styles.adminBelumEmpty}>Semua karyawan aktif sudah memiliki record absensi pada tanggal ini.</div>
            ) : (
              <div style={styles.adminBelumList}>
                {belumAbsen.map((item) => (
                  <div key={item.id} style={styles.adminBelumItem}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <strong style={styles.adminBelumName}>{item.nama}</strong>
                      <span style={styles.adminBelumMeta}>{item.jabatan || "-"} · {item.divisi || "-"}</span>
                    </div>
                    {editId !== item.id ? (
                      <button type="button" onClick={() => { setEditId(item.id); setStatus("alpha"); setCatatan(""); setPesan(""); }} style={styles.adminBelumEdit}>Atur Status</button>
                    ) : (
                      <div style={styles.adminBelumForm}>
                        <select value={status} onChange={(e) => setStatus(e.target.value)} style={styles.adminBelumSelect}>
                          {STATUS_ADMIN_TANPA_ABSENSI.map((itemStatus) => <option key={itemStatus.value} value={itemStatus.value}>{itemStatus.label}</option>)}
                        </select>
                        <textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={500} placeholder="Alasan perubahan status..." style={styles.adminBelumTextarea} />
                        <div style={styles.adminBelumActions}>
                          <button type="button" onClick={() => setEditId(null)} style={styles.adminBelumCancel}>Batal</button>
                          <button type="button" onClick={() => void aturStatusTanpaAbsensi(item.id)} disabled={simpanId === item.id} style={styles.adminBelumSave}>{simpanId === item.id ? "Menyimpan…" : "Simpan"}</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {pesan && <div style={styles.adminBelumMessage}>{pesan}</div>}
          </div>
        )}
      </>
    );
  }

  return label && aksi ? (
    <div style={styles.adminContextBar}>
      <button type="button" onClick={aksi} style={styles.contextButton}>{tab === "karyawan" ? "✎" : "▣"}<span>{label}</span></button>
    </div>
  ) : null;
}

function AdminShell({ pengguna, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const arsipTerbuka = location.pathname === "/admin/arsip";
  const hariIni = tanggalHariIniWIB();
  const [tanggalRekap, setTanggalRekap] = useState(() => {
    try {
      const tersimpan = sessionStorage.getItem("admin-tanggal-rekap");
      return tersimpan && /^\d{4}-\d{2}-\d{2}$/.test(tersimpan) ? tersimpan : hariIni;
    } catch {
      return hariIni;
    }
  });
  const [rekapRefreshNonce, setRekapRefreshNonce] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") window.__adminTanggalRekap = tanggalRekap;
    try {
      sessionStorage.setItem("admin-tanggal-rekap", tanggalRekap);
    } catch {
      // Abaikan storage yang tidak tersedia.
    }
  }, [tanggalRekap]);

  useEffect(() => {
    if (typeof window !== "undefined") window.__adminTanggalRekap = tanggalRekap;
  }, []);

  function onTanggalChange(tanggalBaru) {
    const aman = tanggalBaru && tanggalBaru <= hariIni ? tanggalBaru : hariIni;
    if (typeof window !== "undefined") window.__adminTanggalRekap = aman;
    try {
      sessionStorage.setItem("admin-tanggal-rekap", aman);
    } catch {
      // Abaikan storage yang tidak tersedia.
    }
    setTanggalRekap(aman);
  }

  return (
    <div style={styles.adminShell}>
      {!arsipTerbuka && <AdminContextBar tanggal={tanggalRekap} onTanggalChange={onTanggalChange} onRekapRefresh={() => setRekapRefreshNonce((nilai) => nilai + 1)} />}
      <DashboardAdmin
        pengguna={pengguna}
        onLogout={onLogout}
        tanggalRekap={tanggalRekap}
        rekapRefreshNonce={rekapRefreshNonce}
      />
      {arsipTerbuka && (
        <div className="admin-page-archive" style={styles.arsipOverlay} role="dialog" aria-modal="true" aria-label="Arsip dan Cleanup Absensi">
          <div style={styles.arsipOverlayInner}><AdminArsip kembaliKeDashboard={() => navigate("/admin")} /></div>
        </div>
      )}
    </div>
  );
}

function RuteAplikasi({ pengguna, setPengguna, onLogout }) {
  const navigate = useNavigate();
  return (
    <Suspense fallback={<MemuatHalaman penuh />}>
      <Routes>
        <Route path="/kiosk" element={<Kiosk />} />
        <Route path="/login" element={pengguna ? <Navigate to={pengguna.peran === "admin" ? "/admin" : "/karyawan"} replace /> : <Login onLoginBerhasil={(data) => { setPengguna(data); navigate(data.peran === "admin" ? "/admin" : "/karyawan", { replace: true }); }} kePendaftaran={() => navigate("/daftar")} />} />
        <Route path="/daftar" element={pengguna ? <Navigate to={pengguna.peran === "admin" ? "/admin" : "/karyawan"} replace /> : <Daftar keLogin={() => navigate("/login")} />} />
        <Route path="/karyawan" element={<RuteTerproteksi pengguna={pengguna} peranDiizinkan={["karyawan"]}><DashboardKaryawan pengguna={pengguna} onLogout={onLogout} /></RuteTerproteksi>} />
        <Route path="/karyawan/riwayat" element={<RuteTerproteksi pengguna={pengguna} peranDiizinkan={["karyawan"]}><RiwayatAbsensi kembali={() => navigate("/karyawan")} /></RuteTerproteksi>} />
        <Route path="/karyawan/izin" element={<RuteTerproteksi pengguna={pengguna} peranDiizinkan={["karyawan"]}><PengajuanIzin kembali={() => navigate("/karyawan")} /></RuteTerproteksi>} />
        <Route path="/ganti-password" element={<RuteTerproteksi pengguna={pengguna}><GantiPassword kembali={() => navigate(pengguna?.peran === "admin" ? "/admin" : "/karyawan")} /></RuteTerproteksi>} />
        <Route path="/admin/edit-karyawan" element={<RuteTerproteksi pengguna={pengguna} peranDiizinkan={["admin"]}><div className="admin-page-edit-karyawan"><AdminEditKaryawan /></div></RuteTerproteksi>} />
        <Route path="/admin/*" element={<RuteTerproteksi pengguna={pengguna} peranDiizinkan={["admin"]}><Routes><Route path="*" element={<AdminShell pengguna={pengguna} onLogout={onLogout} />} /></Routes></RuteTerproteksi>} />
        <Route path="*" element={<Navigate to={pengguna ? (pengguna.peran === "admin" ? "/admin" : "/karyawan") : "/login"} replace />} />
      </Routes>
    </Suspense>
  );
}

const styles = {
  adminShell: { minHeight: "100svh", position: "relative" },
  adminContextBar: { position: "fixed", right: 28, bottom: 24, zIndex: 10001 },
  contextButton: { minHeight: 44, display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 14px", border: `1px solid ${warna.garis}`, borderRadius: 12, background: warna.panel, color: warna.tinta, boxShadow: "0 10px 28px rgba(22,35,61,0.12)", fontSize: 12, fontWeight: 750, cursor: "pointer" },
  adminRekapToolbar: { position: "fixed", top: 88, left: "calc(232px + 28px)", right: 28, zIndex: 10002, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 9px", border: `1px solid ${warna.garis}`, borderRadius: 12, background: "rgba(255,255,255,0.98)", boxShadow: "0 10px 28px rgba(22,35,61,0.10)", backdropFilter: "blur(12px)", boxSizing: "border-box", transition: "opacity 0.16s ease, transform 0.16s ease, visibility 0.16s ease" },
  adminRekapDateCopy: { minWidth: 0, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" },
  adminRekapEyebrow: { color: warna.aksen, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em" },
  adminRekapDate: { color: warna.tinta, fontSize: 12 },
  adminRekapControls: { display: "flex", alignItems: "center", gap: 6, flexShrink: 0 },
  adminRekapInput: { minHeight: 34, padding: "6px 8px", border: `1px solid ${warna.garis}`, borderRadius: 8, background: warna.panel, color: warna.tinta, fontSize: 11.5, fontWeight: 650 },
  adminRekapButton: { minHeight: 34, padding: "6px 10px", border: `1px solid ${warna.garis}`, borderRadius: 8, background: warna.panelAlt, color: warna.tinta, fontSize: 10.8, fontWeight: 700, cursor: "pointer" },
  adminRekapToday: { minHeight: 34, padding: "6px 10px", border: `1px solid ${warna.garis}`, borderRadius: 8, background: warna.panel, color: warna.aksen, fontSize: 10.8, fontWeight: 750, cursor: "pointer" },
  adminBelumPanel: { position: "fixed", top: 132, right: 28, width: "min(540px, calc(100vw - 56px))", maxHeight: "min(68dvh, 620px)", overflowY: "auto", zIndex: 10003, padding: 14, border: `1px solid ${warna.garis}`, borderRadius: 14, background: warna.panel, boxShadow: "0 18px 48px rgba(22,35,61,0.16)", boxSizing: "border-box" },
  adminBelumHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 },
  adminBelumTitle: { display: "block", color: warna.tinta, fontSize: 13 },
  adminBelumSub: { display: "block", marginTop: 3, color: warna.tintaSamar, fontSize: 10.5 },
  adminBelumClose: { minHeight: 34, padding: "7px 10px", border: `1px solid ${warna.garis}`, borderRadius: 9, background: warna.panelAlt, color: warna.tinta, fontSize: 11, fontWeight: 700, cursor: "pointer" },
  adminBelumList: { display: "grid", gap: 8 },
  adminBelumItem: { display: "flex", alignItems: "flex-start", gap: 10, padding: 10, borderRadius: 11, border: `1px solid ${warna.garis}`, background: warna.panelAlt, flexWrap: "wrap" },
  adminBelumName: { display: "block", color: warna.tinta, fontSize: 12.5 },
  adminBelumMeta: { display: "block", marginTop: 2, color: warna.tintaSamar, fontSize: 10.5 },
  adminBelumEdit: { minHeight: 34, padding: "7px 10px", border: `1px solid ${warna.garis}`, borderRadius: 9, background: warna.panel, color: warna.aksen, fontSize: 11, fontWeight: 750, cursor: "pointer" },
  adminBelumForm: { width: "100%", display: "grid", gap: 7 },
  adminBelumSelect: { minHeight: 36, width: "100%", padding: "7px 9px", border: `1px solid ${warna.garis}`, borderRadius: 9, background: warna.panel, color: warna.tinta, fontSize: 11.5 },
  adminBelumTextarea: { minHeight: 74, width: "100%", resize: "vertical", padding: "8px 9px", border: `1px solid ${warna.garis}`, borderRadius: 9, background: warna.panel, color: warna.tinta, fontSize: 11.5, fontFamily: "inherit", boxSizing: "border-box" },
  adminBelumActions: { display: "flex", justifyContent: "flex-end", gap: 7 },
  adminBelumCancel: { minHeight: 35, padding: "7px 10px", border: `1px solid ${warna.garis}`, borderRadius: 9, background: warna.panel, color: warna.tinta, fontSize: 11, fontWeight: 700, cursor: "pointer" },
  adminBelumSave: { minHeight: 35, padding: "7px 12px", border: 0, borderRadius: 9, background: warna.aksen, color: "#fff", fontSize: 11, fontWeight: 750, cursor: "pointer" },
  adminBelumMessage: { marginTop: 9, padding: "8px 10px", borderRadius: 9, background: warna.aksenLembut, color: warna.tinta, fontSize: 11, lineHeight: 1.45 },
  adminBelumEmpty: { padding: "12px 10px", borderRadius: 10, background: warna.suksesLembut, color: warna.tinta, fontSize: 11.5, lineHeight: 1.5 },
  arsipOverlay: { position: "fixed", inset: 0, zIndex: 20000, width: "100vw", height: "100dvh", overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", boxSizing: "border-box", background: warna.latar },
  arsipOverlayInner: { width: "100%", maxWidth: 1480, minHeight: "100%", margin: "0 auto", padding: "24px 28px 40px", boxSizing: "border-box" },
};

if (typeof document !== "undefined") {
  const styleId = "admin-rekap-layout-fix";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      /* Sisakan ruang di antara header dan statistik untuk toolbar tanggal. */
      .main-area-admin > div:nth-child(3) { padding-top: 52px !important; }
      @media (max-width: 760px) {
        .main-area-admin > div:nth-child(3) { padding-top: 48px !important; }
        .admin-rekap-toolbar {
          top: 72px !important;
          left: 16px !important;
          right: 16px !important;
          padding: 6px 7px !important;
        }
        .admin-rekap-date-copy { display: none !important; }
        .admin-rekap-toolbar { justify-content: flex-end !important; }
        .admin-rekap-toolbar input[type="date"] { min-height: 34px !important; max-width: 132px; font-size: 11px !important; }
        .admin-rekap-toolbar button { min-height: 34px !important; font-size: 10px !important; padding: 7px 8px !important; }
        .admin-belum-panel { top: 116px !important; right: 16px !important; width: calc(100vw - 32px) !important; }
      }
    `;
    document.head.appendChild(style);
  }
}

export default function App() {
  const [pengguna, setPengguna] = useState(undefined);
  useEffect(() => {
    setPengguna(getPenggunaLogin() || null);
  }, []);
  useEffect(() => {
    pasangWebPushOtomatis();
  }, []);
  function handleLogout() {
    hapusSesiLogin();
    setPengguna(null);
  }
  if (pengguna === undefined) return <MemuatHalaman penuh />;
  return (
    <BatasKesalahanAplikasi>
      <BrowserRouter>
        <RuteAplikasi pengguna={pengguna} setPengguna={setPengguna} onLogout={handleLogout} />
      </BrowserRouter>
    </BatasKesalahanAplikasi>
  );
}
