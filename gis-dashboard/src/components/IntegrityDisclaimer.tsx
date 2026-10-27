import { useEffect, useState } from "react";
import {
  ShieldCheck,
  Leaf,
  CheckCircle2,
  Info,
  ArrowRight,
  Database,
  Scale,
} from "lucide-react";

const STORAGE_KEY = "simiti.integrity-disclaimer.v1";

const css = `
.integrity-overlay {
  position: fixed; inset: 0; z-index: 99999;
  display: grid; place-items: center;
  padding: clamp(12px, 3vw, 32px);
  overflow-y: auto;
  background: rgba(13, 24, 18, .68);
  backdrop-filter: blur(7px);
  -webkit-backdrop-filter: blur(7px);
  animation: integrityFade .22s ease-out;
}
.integrity-modal {
  width: min(1080px, 100%);
  max-height: calc(100dvh - 36px);
  overflow: auto;
  display: grid;
  grid-template-columns: minmax(260px, .82fr) minmax(0, 1.18fr);
  background: #fffefa;
  border: 1px solid rgba(255,255,255,.7);
  border-radius: 24px;
  box-shadow: 0 32px 100px rgba(0,0,0,.28);
  color: #1d2939;
  animation: integrityEnter .28s ease-out;
}
.integrity-visual {
  position: relative; isolation: isolate; overflow: hidden;
  min-height: 570px; padding: clamp(26px, 4vw, 42px);
  display: flex; flex-direction: column; justify-content: space-between;
  color: #174d2b;
  background:
    radial-gradient(ellipse at 10% 10%, rgba(255,255,255,.95), transparent 40%),
    radial-gradient(ellipse at 85% 90%, rgba(104,164,89,.32), transparent 38%),
    linear-gradient(145deg,#e9f4db,#f7f7e9 55%,#dceccc);
}
.integrity-visual:before, .integrity-visual:after {
  content: ""; position: absolute; z-index: -1;
  border: 1px solid rgba(48,111,55,.12); border-radius: 50%;
  pointer-events: none;
}
.integrity-visual:before { width: 360px; height: 360px; right: -185px; top: 100px; }
.integrity-visual:after { width: 270px; height: 270px; right: -140px; top: 145px; }
.integrity-brand { display:flex; align-items:center; gap:12px; }
.integrity-brandmark {
  width:48px; height:48px; display:grid; place-items:center;
  border-radius:15px; color:white; background:#267343;
  box-shadow:0 8px 20px rgba(30,100,53,.18);
}
.integrity-brand strong { display:block; font-size:18px; letter-spacing:.04em; }
.integrity-brand small { display:block; margin-top:4px; color:#52705a; font-size:11px; letter-spacing:.1em; }
.integrity-illustration {
  width:min(220px, 80%); aspect-ratio:1; margin:30px auto;
  display:grid; place-items:center; position:relative;
  border:1px solid rgba(37,112,56,.18); border-radius:50%;
  background:rgba(255,255,255,.42);
  box-shadow:inset 0 0 0 18px rgba(255,255,255,.18);
}
.integrity-illustration:before {
  content:""; position:absolute; inset:19px; border:1px dashed rgba(37,112,56,.28); border-radius:50%;
}
.integrity-illustration-icon {
  width:116px; height:116px; display:grid; place-items:center;
  color:#226d3b; background:linear-gradient(145deg,#fff,#e2f1d9);
  border:1px solid white; border-radius:32px;
  box-shadow:0 16px 36px rgba(40,94,46,.12);
  transform:rotate(-5deg);
}
.integrity-visual-copy .integrity-kicker {
  font-size:10px; font-weight:800; letter-spacing:.17em; color:#397547;
}
.integrity-visual-copy h2 {
  margin:12px 0; font-size:clamp(24px,2.7vw,34px); line-height:1.18;
  letter-spacing:-.04em; color:#20562f;
}
.integrity-visual-copy p { margin:0; color:#506b55; font-size:13px; line-height:1.8; }
.integrity-pills { display:flex; flex-wrap:wrap; gap:8px; margin-top:22px; }
.integrity-pills span {
  display:inline-flex; align-items:center; gap:6px; padding:8px 10px;
  border:1px solid rgba(39,106,51,.15); border-radius:999px;
  background:rgba(255,255,255,.6); font-size:11px; font-weight:700;
}
.integrity-content { padding:clamp(24px,4vw,46px); min-width:0; }
.integrity-topline {
  display:flex; align-items:center; justify-content:space-between;
  flex-wrap:wrap; gap:12px; margin-bottom:24px;
}
.integrity-product {
  color:#397047; font-size:11px; font-weight:800; letter-spacing:.12em;
}
.integrity-label {
  display:inline-flex; align-items:center; gap:7px; padding:7px 10px;
  border-radius:999px; background:#edf6e8; color:#28683a;
  font-size:10px; font-weight:800; letter-spacing:.04em;
}
.integrity-content h1 {
  margin:0; max-width:570px; color:#1a3524;
  font-size:clamp(27px,3vw,38px); line-height:1.12; letter-spacing:-.04em;
}
.integrity-intro { margin:14px 0 24px; color:#667085; font-size:13px; line-height:1.85; }
.integrity-items { display:grid; gap:17px; }
.integrity-item { display:grid; grid-template-columns:40px minmax(0,1fr); gap:12px; align-items:start; }
.integrity-item-icon {
  width:40px; height:40px; display:grid; place-items:center;
  border:1px solid #e1ebdc; border-radius:12px; background:#f3f8ef; color:#28723d;
}
.integrity-item h3 { margin:1px 0 5px; color:#26392b; font-size:13px; font-weight:800; }
.integrity-item p { margin:0; color:#667085; font-size:12px; line-height:1.75; }
.integrity-note {
  display:flex; align-items:flex-start; gap:10px; margin:23px 0;
  padding:13px 14px; border:1px solid #e9e5c8; border-radius:12px;
  background:#fbf9e9; color:#6b5b24; font-size:11px; line-height:1.75;
}
.integrity-consent {
  display:flex; align-items:flex-start; gap:10px; cursor:pointer;
  margin:20px 0 15px; color:#344054; font-size:12px; line-height:1.7;
}
.integrity-consent input {
  flex:0 0 17px; width:17px; height:17px; margin-top:2px;
  accent-color:#247441; cursor:pointer;
}
.integrity-continue {
  width:100%; display:flex; align-items:center; justify-content:center; gap:10px;
  min-height:49px; padding:12px 18px; border:0; border-radius:12px;
  background:linear-gradient(135deg,#267343,#18562f); color:#fff;
  font-size:13px; font-weight:800; cursor:pointer;
  box-shadow:0 8px 18px rgba(32,103,54,.18);
  transition:transform .18s ease, box-shadow .18s ease, opacity .18s ease;
}
.integrity-continue:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 12px 24px rgba(32,103,54,.24); }
.integrity-continue:focus-visible { outline:3px solid #91c89c; outline-offset:3px; }
.integrity-continue:disabled { cursor:not-allowed; opacity:.45; box-shadow:none; }
.integrity-footnote { display:block; margin-top:12px; color:#98a2b3; font-size:10px; line-height:1.6; text-align:center; }
@keyframes integrityFade { from {opacity:0} to {opacity:1} }
@keyframes integrityEnter { from {opacity:0; transform:translateY(10px) scale(.99)} to {opacity:1; transform:translateY(0) scale(1)} }
@media (max-width:760px) {
  .integrity-overlay { padding:10px; place-items:start center; }
  .integrity-modal { width:100%; max-height:calc(100dvh - 20px); grid-template-columns:minmax(0,1fr); border-radius:18px; }
  .integrity-visual { min-height:auto; padding:18px 22px; }
  .integrity-visual .integrity-illustration { display:none; }
  .integrity-visual-copy { margin-top:24px; }
  .integrity-visual-copy h2 { max-width:480px; font-size:23px; }
  .integrity-visual-copy p { font-size:12px; }
  .integrity-pills { margin-top:14px; }
  .integrity-content { padding:23px 22px 25px; }
  .integrity-topline { margin-bottom:18px; }
  .integrity-content h1 { font-size:28px; }
}
@media (max-width:380px) {
  .integrity-brand strong { font-size:15px; }
  .integrity-brand small { font-size:9px; }
  .integrity-content { padding:19px 16px 20px; }
  .integrity-topline { align-items:flex-start; flex-direction:column; }
  .integrity-content h1 { font-size:25px; }
  .integrity-pills span { font-size:10px; padding:7px 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .integrity-overlay, .integrity-modal { animation:none; }
  .integrity-continue { transition:none; }
}
`;

export default function IntegrityDisclaimer() {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== "accepted") {
        setOpen(true);
      }
    } catch {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  function continueToSite() {
    if (!checked) return;

    try {
      window.localStorage.setItem(STORAGE_KEY, "accepted");
    } catch {
      // Tetap izinkan sesi saat ini bila penyimpanan browser dinonaktifkan.
    }

    setOpen(false);
  }

  if (!open) return null;

  return (
    <>
      <style>{css}</style>
      <div className="integrity-overlay">
        <section
          className="integrity-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="integrity-title"
          aria-describedby="integrity-description"
        >
          <aside className="integrity-visual">
            <div className="integrity-brand">
              <div className="integrity-brandmark">
                <ShieldCheck size={27} strokeWidth={2.2} />
              </div>
              <div>
                <strong>SIMITI</strong>
                <small>MITIGASI TERINTEGRASI</small>
              </div>
            </div>

            <div className="integrity-illustration" aria-hidden="true">
              <div className="integrity-illustration-icon">
                <Leaf size={66} strokeWidth={1.5} />
              </div>
            </div>

            <div className="integrity-visual-copy">
              <div className="integrity-kicker">
                INTEGRITAS · AKURASI · TANGGUNG JAWAB
              </div>
              <h2>Data yang tepat. Keputusan yang bertanggung jawab.</h2>
              <p>
                Manfaatkan informasi spasial secara bijak dengan tetap
                mengutamakan verifikasi, integritas, dan keselamatan masyarakat.
              </p>
              <div className="integrity-pills">
                <span><CheckCircle2 size={14} /> Transparan</span>
                <span><CheckCircle2 size={14} /> Akuntabel</span>
                <span><CheckCircle2 size={14} /> Bertanggung jawab</span>
              </div>
            </div>
          </aside>

          <div className="integrity-content">
            <div className="integrity-topline">
              <div className="integrity-product">SIMITI · PEMBERITAHUAN LAYANAN</div>
              <div className="integrity-label">
                <ShieldCheck size={14} /> INTEGRITAS DATA
              </div>
            </div>

            <h1 id="integrity-title">
              Pernyataan Penggunaan &amp; Integritas Data
            </h1>
            <p className="integrity-intro" id="integrity-description">
              Sebelum melanjutkan, pahami ketentuan penggunaan informasi dan
              layanan SIMITI berikut.
            </p>

            <div className="integrity-items">
              <div className="integrity-item">
                <div className="integrity-item-icon">
                  <Database size={20} />
                </div>
                <div>
                  <h3>Informasi sebagai bahan pendukung</h3>
                  <p>
                    Informasi spasial, peta kerawanan, dan hasil analisis
                    membantu proses evaluasi. Hasil tersebut bukan pengganti
                    verifikasi lapangan atau keputusan instansi berwenang.
                  </p>
                </div>
              </div>

              <div className="integrity-item">
                <div className="integrity-item-icon">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3>Gunakan data secara bertanggung jawab</h3>
                  <p>
                    Hormati hak akses, jaga informasi yang dibatasi, dan
                    gunakan API hanya sesuai izin serta ruang lingkup
                    akses yang telah disetujui.
                  </p>
                </div>
              </div>

              <div className="integrity-item">
                <div className="integrity-item-icon">
                  <Scale size={20} />
                </div>
                <div>
                  <h3>Utamakan sumber dan arahan resmi</h3>
                  <p>
                    Data dapat berubah mengikuti pembaruan sumber. Untuk
                    keadaan darurat, ikuti informasi dan arahan resmi
                    instansi penanggulangan bencana yang berwenang.
                  </p>
                </div>
              </div>
            </div>

            <div className="integrity-note">
              <Info size={19} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                <strong>Catatan penting:</strong> Pengguna bertanggung jawab
                memeriksa relevansi, waktu pembaruan, dan sumber data sebelum
                mengambil keputusan penting berdasarkan informasi SIMITI.
              </span>
            </div>

            <label className="integrity-consent">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => setChecked(event.target.checked)}
              />
              <span>
                Saya telah membaca dan memahami pernyataan penggunaan
                layanan dan integritas data di atas.
              </span>
            </label>

            <button
              type="button"
              className="integrity-continue"
              disabled={!checked}
              onClick={continueToSite}
            >
              Saya Mengerti &amp; Lanjutkan
              <ArrowRight size={17} />
            </button>

            <small className="integrity-footnote">
              Konfirmasi disimpan hanya pada browser ini. Preferensi dapat
              dihapus melalui pengaturan penyimpanan situs di browser.
            </small>
          </div>
        </section>
      </div>
    </>
  );
}