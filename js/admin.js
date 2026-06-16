import { auth, db } from "./firebase-init.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, setDoc, collection, query, orderBy, limit, getDocs, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const loginView  = document.getElementById("login-view");
const appView    = document.getElementById("app-view");
const loginForm  = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn  = document.getElementById("logout-btn");

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    loadRecent();
  } else {
    loginView.classList.remove("hidden");
    appView.classList.add("hidden");
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const email    = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch {
    loginError.textContent = "Incorrect email or password.";
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

// ── Tabs ──────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.target).classList.remove("hidden");
  });
});

// ── Helpers ───────────────────────────────────────────────────────
function generateCertId() {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CERT-${year}-${rand}`;
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

/**
 * Read a File input's first file as a base64 data-URL.
 * Returns null if no file is selected.
 */
function readFileAsDataURL(fileInput) {
  return new Promise((resolve) => {
    const file = fileInput?.files?.[0];
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target.result);
    reader.onerror = ()  => resolve(null);
    reader.readAsDataURL(file);
  });
}

// ── QR Code Drawing ───────────────────────────────────────────────
// Uses qrcode-generator library to create a scannable QR code
function drawQRCode(doc, url, x, y, size) {
  const qr = qrcode(0, "M"); // auto type-number, medium error correction
  qr.addData(url);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const cellSize = size / moduleCount;

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        doc.setFillColor(15, 30, 80);
        doc.rect(x + col * cellSize, y + row * cellSize, cellSize, cellSize, "F");
      }
    }
  }
}

// ── Decorative ornament drawing helpers ───────────────────────────
function drawOrnamentalDivider(doc, cx, y, halfW) {
  // Center diamond
  doc.setFillColor(184, 134, 11);
  const d = 2;
  doc.triangle(cx, y - d, cx + d, y, cx, y + d, "F");
  doc.triangle(cx, y - d, cx - d, y, cx, y + d, "F");

  // Lines extending from diamond
  doc.setDrawColor(184, 134, 11);
  doc.setLineWidth(0.5);
  doc.line(cx - d - 3, y, cx - halfW, y);
  doc.line(cx + d + 3, y, cx + halfW, y);

  // Small end dots
  doc.setFillColor(184, 134, 11);
  doc.circle(cx - halfW, y, 0.7, "F");
  doc.circle(cx + halfW, y, 0.7, "F");
}

function drawCornerAccents(doc, W, H, inset) {
  const len = 12;
  const ci = inset;
  doc.setDrawColor(184, 134, 11);
  doc.setLineWidth(0.8);

  // Top-left
  doc.line(ci, ci + len, ci, ci); doc.line(ci, ci, ci + len, ci);
  // Top-right
  doc.line(W - ci - len, ci, W - ci, ci); doc.line(W - ci, ci, W - ci, ci + len);
  // Bottom-left
  doc.line(ci, H - ci - len, ci, H - ci); doc.line(ci, H - ci, ci + len, H - ci);
  // Bottom-right
  doc.line(W - ci - len, H - ci, W - ci, H - ci); doc.line(W - ci, H - ci, W - ci, H - ci - len);
}

// ── Borders ───────────────────────────────────────────────────────
function drawBorders(doc, W, H) {
  // Outer thick dark-blue border
  doc.setDrawColor(15, 30, 80);
  doc.setLineWidth(2.5);
  doc.rect(6, 6, W - 12, H - 12);

  // Inner thin gold border
  doc.setDrawColor(184, 134, 11);
  doc.setLineWidth(0.6);
  doc.rect(10, 10, W - 20, H - 20);

  // Innermost thin dark-blue border
  doc.setDrawColor(15, 30, 80);
  doc.setLineWidth(0.3);
  doc.rect(13, 13, W - 26, H - 26);

  // Gold corner accents
  drawCornerAccents(doc, W, H, 13);
}

// ── MAIN PDF BUILDER (LANDSCAPE) ─────────────────────────────────
/**
 * @param {object} opts
 * @param {string}      opts.certId
 * @param {string}      opts.name
 * @param {string}      opts.course
 * @param {string}      opts.org
 * @param {string}      opts.issueDate
 * @param {string}      opts.title
 * @param {string}      opts.studentId
 * @param {string}      opts.duration
 * @param {string}      opts.grade
 * @param {string}      opts.software
 * @param {string}      opts.parents
 * @param {string|null} opts.photoDataURL – data-URL for photo box
 */
async function buildCertificatePDF({
  certId, name, course, org, issueDate, title,
  studentId, duration, grade, software, parents,
  photoDataURL = null,
}) {
  const { jsPDF } = window.jspdf;
  const pdfDoc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = 297, H = 210;

  // ── Background ──
  pdfDoc.setFillColor(253, 251, 245);
  pdfDoc.rect(0, 0, W, H, "F");

  // Subtle inner panel background
  pdfDoc.setFillColor(255, 255, 255);
  pdfDoc.rect(16, 16, W - 32, H - 32, "F");

  // ── Borders ──
  drawBorders(pdfDoc, W, H);

  // ── Organization header ──
  const orgName = (org || "Training Center").toUpperCase();
  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.setFontSize(12);
  pdfDoc.setTextColor(15, 30, 80);
  pdfDoc.text(orgName, W / 2, 24, { align: "center" });

  // Ornamental divider below org name
  drawOrnamentalDivider(pdfDoc, W / 2, 28, 55);

  // ── Main Title ──
  pdfDoc.setFont("times", "bold");
  pdfDoc.setFontSize(32);
  pdfDoc.setTextColor(15, 30, 80);
  pdfDoc.text((title || "CERTIFICATE OF COMPLETION").toUpperCase(), W / 2, 42, { align: "center" });

  // Gold ornamental divider under title
  drawOrnamentalDivider(pdfDoc, W / 2, 48, 60);

  // ── PHOTO BOX (far right side, below title) ──
  const photoX = 245, photoY = 54, photoW = 30, photoH = 34;
  // Gold frame for photo
  pdfDoc.setDrawColor(184, 134, 11);
  pdfDoc.setLineWidth(0.8);
  pdfDoc.rect(photoX - 0.5, photoY - 0.5, photoW + 1, photoH + 1);
  // Inner dark frame
  pdfDoc.setDrawColor(15, 30, 80);
  pdfDoc.setLineWidth(0.4);
  pdfDoc.rect(photoX, photoY, photoW, photoH);

  if (photoDataURL) {
    const fmt = photoDataURL.startsWith("data:image/png") ? "PNG" : "JPEG";
    pdfDoc.addImage(photoDataURL, fmt, photoX, photoY, photoW, photoH);
  } else {
    pdfDoc.setFillColor(240, 238, 232);
    pdfDoc.rect(photoX, photoY, photoW, photoH, "F");
    pdfDoc.setFontSize(6);
    pdfDoc.setTextColor(170, 165, 155);
    pdfDoc.text("PHOTO", photoX + photoW / 2, photoY + photoH / 2, { align: "center" });
  }

  // ── Student ID badge (centered) ──
  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.setFontSize(8);
  pdfDoc.setTextColor(184, 134, 11);
  pdfDoc.text("STUDENT ID", W / 2, 55, { align: "center" });
  pdfDoc.setFontSize(9);
  pdfDoc.setTextColor(15, 30, 80);
  pdfDoc.text(certId, W / 2, 60, { align: "center" });

  // Thin line under student ID
  pdfDoc.setDrawColor(200, 195, 180);
  pdfDoc.setLineWidth(0.2);
  pdfDoc.line(100, 63, 200, 63);

  // ── Fields (positioned in left/center area) ──
  const fieldX = 22;
  const labelColor = [15, 30, 80];
  const lineColor = [200, 195, 180];
  const valueColor = [30, 30, 30];
  const maxFieldRight = photoX - 8; // Text stops before photo

  function drawField(label, value, y, lineEnd) {
    pdfDoc.setFont("times", "bold");
    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(...labelColor);
    pdfDoc.text(label.toUpperCase(), fieldX, y);

    pdfDoc.setTextColor(100, 100, 100);
    pdfDoc.text(":", fieldX + 48, y);

    pdfDoc.setFont("times", "normal");
    pdfDoc.setFontSize(11);
    pdfDoc.setTextColor(...valueColor);
    // Constrain text if in photo zone
    const inPhotoZone = (y >= photoY - 2 && y <= photoY + photoH + 2);
    const maxTextW = inPhotoZone ? maxFieldRight - (fieldX + 52) : (lineEnd || W - 22) - (fieldX + 52);
    const displayVal = pdfDoc.splitTextToSize(value || "", Math.max(maxTextW, 20))[0] || "";
    pdfDoc.text(displayVal, fieldX + 52, y);

    pdfDoc.setDrawColor(...lineColor);
    pdfDoc.setLineWidth(0.25);
    const autoEnd = inPhotoZone ? maxFieldRight : lineEnd || W - 22;
    pdfDoc.line(fieldX + 52, y + 1.5, autoEnd, y + 1.5);
  }

  function drawFieldHalf(label, value, y, startX, endX) {
    pdfDoc.setFont("times", "bold");
    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(...labelColor);
    pdfDoc.text(label.toUpperCase(), startX, y);

    pdfDoc.setTextColor(100, 100, 100);
    pdfDoc.text(":", startX + 30, y);

    pdfDoc.setFont("times", "normal");
    pdfDoc.setFontSize(11);
    pdfDoc.setTextColor(...valueColor);
    pdfDoc.text(value || "", startX + 34, y);

    pdfDoc.setDrawColor(...lineColor);
    pdfDoc.setLineWidth(0.25);
    pdfDoc.line(startX + 34, y + 1.5, endX, y + 1.5);
  }

  let fy = 72;
  const gap = 14;

  drawField("Presented To", name || "", fy);
  fy += gap;

  drawFieldHalf("Parents",  parents  || "",                      fy, fieldX, 155);
  drawFieldHalf("Duration", duration ? `${duration} hours` : "", fy, 165,    maxFieldRight);
  fy += gap;

  drawField("Completion Of",        course   || "", fy);
  fy += gap;

  drawField("Software Specialized", software || "", fy);
  fy += gap;

  drawField("Training Center",      org      || "", fy);
  fy += gap;

  drawFieldHalf("On",    issueDate || "", fy, fieldX, 130);
  drawFieldHalf("Grade", grade     || "", fy, 165,    maxFieldRight);

  // ── Signature line area ──
  const sigY = H - 42;
  pdfDoc.setDrawColor(15, 30, 80);
  pdfDoc.setLineWidth(0.4);

  // Left signature
  pdfDoc.line(30, sigY, 100, sigY);
  pdfDoc.setFont("helvetica", "normal");
  pdfDoc.setFontSize(7);
  pdfDoc.setTextColor(100, 100, 100);
  pdfDoc.text("AUTHORIZED SIGNATURE", 65, sigY + 4, { align: "center" });

  // Center official seal placeholder
  pdfDoc.setDrawColor(184, 134, 11);
  pdfDoc.setLineWidth(0.6);
  pdfDoc.circle(W / 2, sigY - 4, 13);
  pdfDoc.setLineWidth(0.3);
  pdfDoc.circle(W / 2, sigY - 4, 10);
  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.setFontSize(5);
  pdfDoc.setTextColor(184, 134, 11);
  pdfDoc.text("OFFICIAL", W / 2, sigY - 6, { align: "center" });
  pdfDoc.text("SEAL", W / 2, sigY - 3, { align: "center" });

  // Right signature (left of QR code area)
  pdfDoc.setDrawColor(15, 30, 80);
  pdfDoc.setLineWidth(0.4);
  pdfDoc.line(178, sigY, 228, sigY);
  pdfDoc.setFont("helvetica", "normal");
  pdfDoc.setFontSize(7);
  pdfDoc.setTextColor(100, 100, 100);
  pdfDoc.text("DIRECTOR / HEAD", 203, sigY + 4, { align: "center" });

  // ── QR Code at bottom-right for verification ──
  const verifyBaseUrl = "https://certificate-verificatio.netlify.app/";
  const verifyUrl =' ${verifyBaseUrl}?id=${encodeURIComponent(certId)}';

  const qrSize = 28;
  const qrX = W - 22 - qrSize;
  const qrY = H - 22 - qrSize;

  // QR code background
  pdfDoc.setFillColor(255, 255, 255);
  pdfDoc.rect(qrX - 2, qrY - 2, qrSize + 4, qrSize + 4, "F");

  // Thin border around QR
  pdfDoc.setDrawColor(200, 195, 180);
  pdfDoc.setLineWidth(0.3);
  pdfDoc.rect(qrX - 2, qrY - 2, qrSize + 4, qrSize + 4);

  // Draw the QR code
  drawQRCode(pdfDoc, verifyUrl, qrX, qrY, qrSize);

  // Label above QR
  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.setFontSize(5.5);
  pdfDoc.setTextColor(15, 30, 80);
  pdfDoc.text("SCAN TO VERIFY", qrX + qrSize / 2, qrY - 5, { align: "center" });

  // Certificate ID below QR
  pdfDoc.setFont("courier", "normal");
  pdfDoc.setFontSize(6);
  pdfDoc.setTextColor(100, 100, 100);
  pdfDoc.text(certId, qrX + qrSize / 2, qrY + qrSize + 4, { align: "center" });

  return pdfDoc;
}

// ── Firestore save ────────────────────────────────────────────────
async function saveCertificateRecord({
  certId, name, course, org, issueDate, title,
  studentId, duration, grade, software, parents,
}) {
  await setDoc(doc(db, "certificates", certId), {
    name, course, org, issueDate, title,
    studentId : studentId || certId,
    duration  : duration  || "",
    grade     : grade     || "",
    software  : software  || "",
    parents   : parents   || "",
    status    : "valid",
    createdAt : serverTimestamp(),
  });
}

// ── Single certificate ────────────────────────────────────────────
document.getElementById("single-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById("single-status");
  statusEl.textContent = "Generating…";

  const name      = document.getElementById("s-name").value.trim();
  const course    = document.getElementById("s-course").value.trim();
  const org       = document.getElementById("s-org").value.trim();
  const issueDate = document.getElementById("s-date").value || new Date().toISOString().slice(0, 10);
  const title     = document.getElementById("s-title").value.trim() || "Certificate of Completion";
  const parents   = document.getElementById("s-parents")?.value.trim()  || "";
  const duration  = document.getElementById("s-duration")?.value.trim() || "";
  const grade     = document.getElementById("s-grade")?.value.trim()    || "";
  const software  = document.getElementById("s-software")?.value.trim() || "";

  // Read both photo inputs as data-URLs (null if nothing selected)
  const photoDataURL = await readFileAsDataURL(document.getElementById("s-photo"));

  const certId = generateCertId();
  try {
    await saveCertificateRecord({ certId, name, course, org, issueDate, title, duration, grade, software, parents });
    const pdfDoc = await buildCertificatePDF({
      certId, name, course, org, issueDate, title,
      duration, grade, software, parents,
      photoDataURL,
    });
    pdfDoc.save(`${certId}.pdf`);
    statusEl.textContent = `✅ Created ${certId}`;
    e.target.reset();
    loadRecent();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "❌ Something went wrong. Check the console.";
  }
});

// ── Bulk CSV ──────────────────────────────────────────────────────
document.getElementById("csv-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusEl  = document.getElementById("csv-status");
  const fileInput = document.getElementById("csv-file");
  const file      = fileInput.files[0];
  if (!file) return;

  statusEl.textContent = "Reading file…";

  Papa.parse(file, {
    header        : true,
    skipEmptyLines: true,
    complete: async (results) => {
      const rows = results.data;
      const zip  = new JSZip();
      let count  = 0;

      for (const row of rows) {
        const name   = (row.name   || "").trim();
        const course = (row.course || "").trim();
        if (!name || !course) continue;

        const org       = (row.org       || "").trim();
        const issueDate = (row.issueDate || new Date().toISOString().slice(0, 10)).trim();
        const title     = (row.title     || "Certificate of Completion").trim();
        const parents   = (row.parents   || "").trim();
        const duration  = (row.duration  || "").trim();
        const grade     = (row.grade     || "").trim();
        const software  = (row.software  || "").trim();
        const certId    = generateCertId();

        try {
          await saveCertificateRecord({ certId, name, course, org, issueDate, title, duration, grade, software, parents });
          // Bulk: no photos supplied via CSV
          const pdfDoc = await buildCertificatePDF({
            certId, name, course, org, issueDate, title,
            duration, grade, software, parents,
            photoDataURL: null,
          });
          zip.file(`${certId}.pdf`, pdfDoc.output("blob"));
          count++;
          statusEl.textContent = `Generated ${count} of ${rows.length}…`;
        } catch (err) {
          console.error("Row failed:", row, err);
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href     = URL.createObjectURL(content);
      a.download = "certificates.zip";
      a.click();

      statusEl.textContent = `✅ Done. Created ${count} certificate${count === 1 ? "" : "s"}.`;
      fileInput.value = "";
      loadRecent();
    },
    error: (err) => {
      console.error(err);
      statusEl.textContent = "❌ Couldn't read that CSV file.";
    },
  });
});

// ── Recent list + revoke ──────────────────────────────────────────
async function loadRecent() {
  const listEl = document.getElementById("recent-list");
  listEl.innerHTML = "<p>Loading…</p>";
  try {
    const q    = query(collection(db, "certificates"), orderBy("createdAt", "desc"), limit(25));
    const snap = await getDocs(q);
    if (snap.empty) {
      listEl.innerHTML = "<p>No certificates issued yet.</p>";
      return;
    }
    listEl.innerHTML = "";
    snap.forEach((d) => {
      const data = d.data();
      const row  = document.createElement("div");
      row.className = "cert-row";
      row.innerHTML = `
        <span class="cert-id">${d.id}</span>
        <span>${escapeHTML(data.name)}</span>
        <span>${escapeHTML(data.course)}</span>
        <span class="status ${data.status}">${data.status}</span>
        <button data-id="${d.id}" data-status="${data.status}" class="toggle-btn">
          ${data.status === "revoked" ? "Reinstate" : "Revoke"}
        </button>
      `;
      listEl.appendChild(row);
    });

    listEl.querySelectorAll(".toggle-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id        = btn.dataset.id;
        const newStatus = btn.dataset.status === "revoked" ? "valid" : "revoked";
        await updateDoc(doc(db, "certificates", id), { status: newStatus });
        loadRecent();
      });
    });
  } catch (err) {
    console.error(err);
    listEl.innerHTML = "<p>Couldn't load recent certificates.</p>";
  }
}
