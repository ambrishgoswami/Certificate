import { db } from "./firebase-init.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const form = document.getElementById("verify-form");
const input = document.getElementById("cert-id-input");
const result = document.getElementById("result");

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function showChecking() {
  result.className = "result checking";
  result.innerHTML = `<p>Checking…</p>`;
}

function showValid(data, id) {
  result.className = "result valid";
  result.innerHTML = `
    <div class="seal-badge">&#10003;</div>
    <h2>Certificate Verified</h2>
    <p>This certificate is authentic and currently valid.</p>
    <dl>
      <dt>Name</dt><dd>${escapeHTML(data.name)}</dd>
      <dt>Course / Title</dt><dd>${escapeHTML(data.course)}</dd>
      <dt>Issued by</dt><dd>${escapeHTML(data.org || "—")}</dd>
      <dt>Issue date</dt><dd>${escapeHTML(data.issueDate)}</dd>
      <dt>Duration</dt><dd>${escapeHTML(data.duration || "—")}</dd>
      <dt>Grade</dt><dd>${escapeHTML(data.grade || "—")}</dd>
      <dt>Software</dt><dd>${escapeHTML(data.software || "—")}</dd>
      <dt>Parents</dt><dd>${escapeHTML(data.parents || "—")}</dd>
      <dt>Certificate ID</dt><dd>${escapeHTML(id)}</dd>
    </dl>
  `;
}

function showRevoked(data, id) {
  result.className = "result invalid";
  result.innerHTML = `
    <div class="seal-badge">&#10007;</div>
    <h2>Certificate Revoked</h2>
    <p>This certificate ID was issued to ${escapeHTML(data.name)} but has since been revoked by the issuer.</p>
    <dl>
      <dt>Name</dt><dd>${escapeHTML(data.name)}</dd>
      <dt>Course / Title</dt><dd>${escapeHTML(data.course)}</dd>
      <dt>Issued by</dt><dd>${escapeHTML(data.org || "—")}</dd>
      <dt>Issue date</dt><dd>${escapeHTML(data.issueDate)}</dd>
      <dt>Certificate ID</dt><dd>${escapeHTML(id)}</dd>
    </dl>
  `;
}

function showInvalid() {
  result.className = "result invalid";
  result.innerHTML = `
    <div class="seal-badge">&#10007;</div>
    <h2>Not Found</h2>
    <p>No certificate matches this ID. Double-check it and try again.</p>
  `;
}

function showError() {
  result.className = "result invalid";
  result.innerHTML = `
    <div class="seal-badge">!</div>
    <h2>Couldn't Check Right Now</h2>
    <p>Something went wrong reaching the certificate database. Please try again.</p>
  `;
}

async function checkCertificate(rawId) {
  const id = (rawId || "").trim();
  if (!id) return;
  showChecking();
  try {
    const snap = await getDoc(doc(db, "certificates", id));
    if (!snap.exists()) {
      showInvalid();
      return;
    }
    const data = snap.data();
    if (data.status === "revoked") {
      showRevoked(data, id);
    } else {
      showValid(data, id);
    }
  } catch (err) {
    console.error(err);
    showError();
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  checkCertificate(input.value);
});

const presetId = new URLSearchParams(window.location.search).get("id");
if (presetId) {
  input.value = presetId;
  checkCertificate(presetId);
}
