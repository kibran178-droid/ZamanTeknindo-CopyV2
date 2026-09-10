
import { useEffect, useRef, useState, useMemo } from "react";
import * as faceapi from "face-api.js";
import { warna, font } from "../styles/theme";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const KIOSK_KEY = import.meta.env.VITE_KIOSK_KEY || "kiosk_rahasia_zaman_2025";

const JAM_MASUK_MAX_STR = "08:10";
const JAM_PULANG_MIN_STR = "17:00";
const JAM_MASUK_MAX_MENIT = 8 * 60 + 10;
const JAM_PULANG_MIN_MENIT = 17 * 60;
const TOLERANSI_MASUK = 120;

function useWIBClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const wibNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const totalMenit = wibNow.getHours() * 60 + wibNow.getMinutes();
  const jam = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now);
  const tanggal = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  const isTerlambat = totalMenit > JAM_MASUK_MAX_MENIT && totalMenit <= JAM_MASUK_MAX_MENIT + TOLERANSI_MASUK;
  const isMasukDitutup = totalMenit > JAM_MASUK_MAX_MENIT + TOLERANSI_MASUK && totalMenit < JAM_PULANG_MIN_MENIT;
  const isJamMasuk = totalMenit >= 5 * 60 && totalMenit <= JAM_MASUK_MAX_MENIT;
  const isJamPulang = totalMenit >= JAM_PULANG_MIN_MENIT;
  const statusJam = isTerlambat ? `TERLAMBAT - Lewat ${JAM_MASUK_MAX_STR}` : isJamMasuk ? `Jam Masuk - Max ${JAM_MASUK_MAX_STR}` : isMasukDitutup ? `Masuk Ditutup - Pulang ${JAM_PULANG_MIN_STR}` : isJamPulang ? `Jam Pulang - Mulai ${JAM_PULANG_MIN_STR}` : `Diluar Jam Kerja`;
  return { jam, tanggal, totalMenit, isTerlambat, isMasukDitutup, isJamMasuk, isJamPulang, statusJam };
}

export default function Kiosk() {
  const videoRef = useRef(null);
  const { jam, tanggal, totalMenit, isTerlambat, isMasukDitutup, statusJam } = useWIBClock();
  const [modelOk, setModelOk] = useState(false);
  const [camOk, setCamOk] = useState(false);
  const [mode, setMode] = useState("idle");
  const [status, setStatus] = useState("Memuat model...");
  const [users, setUsers] = useState([]);
  const [cari, setCari] = useState("");
  const [tab, setTab] = useState("belum");
  const [showPin, setShowPin] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [selected, setSelected] = useState(null);
  const [matchedUser, setMatchedUser] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
          faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
          faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
        ]);
        setModelOk(true); setStatus("Posisikan wajah di dalam kotak");
      } catch { setStatus("Model gagal load"); }
    })();
  }, []);
  useEffect(() => {
    if (!modelOk) return;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false });
        if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play(); setCamOk(true); }
      } catch { setStatus("Allow kamera"); }
    })();
  }, [modelOk]);

  async function loadUsers() {
    try {
      const r = await fetch(`${API_BASE}/kiosk/pengguna-list`, { headers: { "x-kiosk-key": KIOSK_KEY } });
      if (r.ok) { const data = await r.json(); setUsers(Array.isArray(data) ? data : data.data || []); }
    } catch {}
  }
  async function verifyPin() {
    if (!pin.trim()) { setPinError("PIN tidak boleh kosong"); return; }
    setPinError("");
    try {
      const r = await fetch(`${API_BASE}/kiosk/verify-admin-pin`, { method: "POST", headers: { "Content-Type": "application/json", "x-kiosk-key": KIOSK_KEY }, body: JSON.stringify({ pin }) });
      if (r.ok) { setUnlocked(true); setShowPin(false); setPin(""); setPinError(""); loadUsers(); }
      else setPinError("PIN salah!");
    } catch { setPinError("Gagal verifikasi"); }
  }
  async function handleEnroll() {
    if (!selected) return;
    setMode("scanning"); setStatus(`Daftarkan ${selected.nama}...`);
    try {
      const descriptors = [];
      for (let i = 0; i < 3; i++) {
        setStatus(`Capture ${i+1}/3`);
        await new Promise(r => setTimeout(r, 800));
        const det = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 })).withFaceLandmarks().withFaceDescriptor();
        if (!det) { i--; continue; }
        descriptors.push(Array.from(det.descriptor));
      }
      const r = await fetch(`${API_BASE}/kiosk/enroll`, { method: "POST", headers: { "Content-Type": "application/json", "x-kiosk-key": KIOSK_KEY }, body: JSON.stringify({ penggunaId: selected.id, descriptors }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.message);
      setStatus(`✓ ${selected.nama} terdaftar!`); setMode("success"); setSelected(null); loadUsers();
      setTimeout(() => { setMode("idle"); setStatus("Posisikan wajah di dalam kotak"); }, 2500);
    } catch (e) { setStatus("Gagal: " + e.message); setMode("idle"); }
  }
  async function handlePresensi() {
    if (isMasukDitutup) { setStatus(`Masuk ditutup. Max ${JAM_MASUK_MAX_STR}`); return; }
    setMode("scanning"); setStatus("Mendeteksi..."); setMatchedUser(null);
    try {
      let det=null, att=0;
      while(att<30){ det=await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({inputSize:320})).withFaceLandmarks().withFaceDescriptor(); if(det) break; att++; await new Promise(r=>setTimeout(r,120)); }
      if(!det) throw new Error("Wajah tidak terdeteksi");
      const c=document.createElement("canvas"); c.width=videoRef.current.videoWidth; c.height=videoRef.current.videoHeight; c.getContext("2d").drawImage(videoRef.current,0,0); const foto=c.toDataURL("image/jpeg",0.7);
      setStatus("Mengenali...");
      const rec=await fetch(`${API_BASE}/kiosk/recognize`,{method:"POST",headers:{"Content-Type":"application/json","x-kiosk-key":KIOSK_KEY},body:JSON.stringify({descriptor:Array.from(det.descriptor)})});
      const recJ=await rec.json(); if(!rec.ok||!recJ.matched){ setStatus("Wajah tidak dikenal"); setMode("idle"); return; }
      setMatchedUser(recJ.pengguna);
      const st=await fetch(`${API_BASE}/kiosk/status/${recJ.pengguna.id}`,{headers:{"x-kiosk-key":KIOSK_KEY}});
      const stJ=st.ok?await st.json():{tipeSelanjutnya:"masuk"};
      if(stJ.tipeSelanjutnya==="pulang" && totalMenit<JAM_PULANG_MIN_MENIT){ const sisa=JAM_PULANG_MIN_MENIT-totalMenit; setStatus(`Belum jam pulang. Sisa ${Math.floor(sisa/60)}j ${sisa%60}m`); setMode("idle"); return; }
      const abs=await fetch(`${API_BASE}/kiosk/absen`,{method:"POST",headers:{"Content-Type":"application/json","x-kiosk-key":KIOSK_KEY},body:JSON.stringify({penggunaId:recJ.pengguna.id,tipe:stJ.tipeSelanjutnya,foto})});
      const absJ=await abs.json(); if(!abs.ok) throw new Error(absJ.message);
      setStatus(`✓ ${absJ.message}`); setMode("success");
      setTimeout(()=>{ setMode("idle"); setMatchedUser(null); setStatus("Posisikan wajah di dalam kotak"); },3000);
    }catch(e){ setStatus(e.message); setMode("idle"); }
  }
  const filtered=useMemo(()=>{ let list=tab==="belum"?users.filter(u=>!u.hasFace):users.filter(u=>u.hasFace); if(cari) list=list.filter(u=>u.nama.toLowerCase().includes(cari.toLowerCase())); return list; },[users,cari,tab]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0B1215", fontFamily: font.display, overflow: "hidden" }}>
      <video ref={videoRef} autoPlay muted playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 32%, rgba(11,18,21,0.65) 72%)" }} />
      <div style={{ position: "absolute", top: 16, left: 16, right: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start", zIndex: 20 }}>
        <button onClick={() => setShowPin(true)} style={{ width: 44, height: 44, borderRadius: 12, background: unlocked ? "#E4F3EA" : "#FFF", display: "grid", placeItems: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={unlocked ? "#0B6E45" : "#16233D"} strokeWidth="1.8"><rect x="3" y="11" width="18" height="11" rx="2.5"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          <div style={{ padding: "10px 16px", borderRadius: 14, background: "rgba(22,35,61,0.88)", textAlign: "right", border: "1px solid rgba(255,255,255,0.14)" }}>
            <div style={{ color: "#fff", fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{jam}</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 10.5, marginTop: 5 }}>{tanggal} • WIB</div>
          </div>
          <div style={{ padding: "5px 10px", borderRadius: 99, background: isTerlambat ? "#FBE7E4" : "#E4F3EA", color: isTerlambat ? "#C0392B" : "#0B6E45", fontSize: 10, fontWeight: 700 }}>{statusJam}</div>
        </div>
      </div>
      {unlocked && (
        <div style={{ position: "absolute", left: 16, top: 80, bottom: 100, width: 360, background: warna.panel, borderRadius: 16, border: `1px solid ${warna.garis}`, zIndex: 15, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: 14, borderBottom: `1px solid ${warna.garis}` }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Pendaftaran Wajah</div>
            <input value={cari} onChange={e => setCari(e.target.value)} placeholder="Cari..." style={{ marginTop: 10, width: "100%", height: 36, borderRadius: 10, border: `1px solid ${warna.garis}`, padding: "0 12px", fontSize: 12 }} />
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <button onClick={() => setTab("belum")} style={{ flex: 1, height: 32, borderRadius: 8, border: 0, background: tab === "belum" ? warna.bahaya : warna.panelAlt, color: tab === "belum" ? "#fff" : warna.tinta, fontSize: 11, fontWeight: 700 }}>Belum</button>
              <button onClick={() => setTab("sudah")} style={{ flex: 1, height: 32, borderRadius: 8, border: 0, background: tab === "sudah" ? warna.sukses : warna.panelAlt, color: tab === "sudah" ? "#fff" : warna.tinta, fontSize: 11, fontWeight: 700 }}>Sudah</button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filtered.map(u => (
              <div key={u.id} onClick={() => !u.hasFace && setSelected(u)} style={{ padding: "11px 14px", background: u.hasFace ? "#E4F3EA" : "#FBE7E4", borderLeft: `4px solid ${u.hasFace ? "#0B6E45" : "#C0392B"}`, borderBottom: "1px solid #eee", cursor: !u.hasFace ? "pointer" : "default" }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{u.nama}</div>
                <div style={{ fontSize: 10, color: u.hasFace ? "#0B6E45" : "#C0392B" }}>{u.hasFace ? "✓ Sudah" : "• Belum"}</div>
              </div>
            ))}
          </div>
          <button onClick={() => { setUnlocked(false); setSelected(null); }} style={{ margin: 10, height: 34, borderRadius: 8, border: `1px solid ${warna.garis}`, background: warna.panel, fontSize: 12, fontWeight: 600 }}>Kunci lagi</button>
        </div>
      )}
      <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -48%)", width: "min(62vw, 480px)", height: "min(68vh, 520px)", zIndex: 5, marginLeft: unlocked ? 190 : 0 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 28, border: `2.5px solid ${mode === "scanning" ? warna.aksen : "#fff"}` }} />
        {["tl","tr","bl","br"].map(p => (
          <div key={p} style={{ position: "absolute", width: 40, height: 40, borderColor: warna.aksen, borderStyle: "solid",
            ...(p==="tl"?{top:-4,left:-4,borderWidth:"7px 0 0 7px",borderTopLeftRadius:24}:{}),
            ...(p==="tr"?{top:-4,right:-4,borderWidth:"7px 7px 0 0",borderTopRightRadius:24}:{}),
            ...(p==="bl"?{bottom:-4,left:-4,borderWidth:"0 0 7px 7px",borderBottomLeftRadius:24}:{}),
            ...(p==="br"?{bottom:-4,right:-4,borderWidth:"0 7px 7px 0",borderBottomRightRadius:24}:{}),
          }} />
        ))}
      </div>
      <div style={{ position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)", marginLeft: unlocked ? 190 : 0, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: "min(92vw, 420px)" }}>
        <div style={{ padding: "9px 16px", borderRadius: 99, background: mode === "success" ? "#E4F3EA" : isTerlambat ? "#FBE7E4" : "rgba(0,0,0,0.55)", color: mode === "success" ? "#0B6E45" : isTerlambat ? "#C0392B" : "#fff", fontSize: 12.5, fontWeight: 600, textAlign: "center" }}>
          {selected ? `Daftarkan: ${selected.nama}` : matchedUser ? `Halo, ${matchedUser.nama}` : status}
        </div>
        {selected ? (
          <button onClick={handleEnroll} disabled={mode==="scanning"} style={{ width: "100%", height: 52, borderRadius: 14, background: warna.aksen, color: "#fff", fontWeight: 800, fontSize: 13, border: 0 }}>DAFTARKAN WAJAH</button>
        ) : (
          <button onClick={handlePresensi} disabled={mode==="scanning" || !modelOk} style={{ width: "100%", height: 52, borderRadius: 14, background: isMasukDitutup ? "#5a5a5a" : warna.aksen, color: "#fff", fontWeight: 800, fontSize: 13.5, border: 0, opacity: isMasukDitutup ? 0.7 : 1 }}>{isMasukDitutup ? `MASUK DITUTUP (MAX ${JAM_MASUK_MAX_STR})` : mode==="scanning" ? "MEMINDAI..." : "MULAI PRESENSI"}</button>
        )}
        <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.65)" }}>Masuk max {JAM_MASUK_MAX_STR} • Pulang mulai {JAM_PULANG_MIN_STR} WIB</div>
      </div>
      {showPin && (
        <div style={{ position: "absolute", inset: 0, zIndex: 30, background: "rgba(11,18,21,0.62)", backdropFilter: "blur(10px)", display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ width: 340, padding: 20, borderRadius: 16, background: warna.panel, border: `1px solid ${warna.garis}` }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>PIN Admin Kiosk</div>
            <input type="password" value={pin} onChange={e => { setPin(e.target.value); if(pinError) setPinError(""); }} onKeyDown={e=>{ if(e.key==="Enter") verifyPin(); }} placeholder="Masukkan PIN admin" autoFocus style={{ marginTop: 14, width: "100%", height: 42, borderRadius: 10, border: `1px solid ${pinError ? "#C0392B" : warna.garis}`, padding: "0 12px" }} />
            {pinError && <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "#FBE7E4", color: "#C0392B", fontSize: 11, fontWeight: 600 }}>{pinError}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={() => { setShowPin(false); setPin(""); setPinError(""); }} style={{ flex: 1, height: 40, borderRadius: 10, border: `1px solid ${warna.garis}`, background: warna.panel }}>Batal</button>
              <button onClick={verifyPin} style={{ flex: 1, height: 40, borderRadius: 10, border: 0, background: warna.aksen, color: "#fff", fontWeight: 700 }}>Buka</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
