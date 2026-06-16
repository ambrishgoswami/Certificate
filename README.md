# Certificate Generator & Validator

A complete, free website for issuing certificates and letting anyone verify them.
No server to manage, no monthly bill at your volume (~100 certificates/month is
well inside every free tier used here).

**What it does**
- `admin.html` — a password-protected console where you create certificates,
  one at a time or in bulk from a CSV. Each certificate is saved as a record
  and downloaded as a designed PDF with a QR code on it.
- `index.html` — a public page anyone can use to check if a certificate ID
  (or QR code) is genuine, and see who it was issued to, for what, and when.
  Revoked certificates show up as invalid too.

**Stack** — plain HTML/CSS/JS (no build step) + Firebase (free Spark plan) for
the database, auth, and hosting. Total cost: $0 at this volume.

---

## 1. Create your free Firebase project

1. Go to <https://console.firebase.google.com> and click **Add project**
   (a Google account is all you need — no credit card).
2. Once created, in the left sidebar go to **Build > Firestore Database** →
   **Create database** → start in **production mode** → pick any region.
3. Still in the sidebar, go to **Build > Authentication** → **Get started** →
   enable the **Email/Password** sign-in method.
4. In **Authentication > Users**, click **Add user** and create yourself an
   issuer login (any email + password — it doesn't need to be a real inbox).

## 2. Get your config keys and paste them in

1. Click the gear icon → **Project settings** → scroll to **Your apps** →
   click the **</>** (web) icon → register an app (any nickname).
2. Firebase shows you a `firebaseConfig` object. Copy it.
3. Open `js/firebase-config.js` in this project and replace the placeholder
   values with your real ones.

## 3. Lock down the database

In **Firestore Database > Rules**, replace the contents with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /certificates/{certId} {
      allow read: if true;            // anyone can verify a certificate
      allow write: if request.auth != null;  // only logged-in issuers can create/edit
    }
  }
}
```

Click **Publish**. This is what makes verification public while keeping
certificate creation locked to your login.

## 4. Try it locally

Because the pages use ES modules, open them through a local server rather
than double-clicking the file (browsers block module imports on `file://`).
Easiest option, from inside this folder:

```
npx serve .
```

Then visit the URL it prints, e.g. `http://localhost:3000/admin.html` to log
in and create a certificate, and `http://localhost:3000/index.html` to verify
it.

## 5. Put it online for free — pick one

**Option A: Firebase Hosting** (same dashboard as your database, free SSL,
custom domain support)
```
npm install -g firebase-tools
firebase login
firebase init hosting     # choose this folder as the public directory,
                           # say "no" to single-page app rewrites
firebase deploy
```
You'll get a live URL like `your-project.web.app`.

**Option B: Netlify drag-and-drop** — go to <https://app.netlify.com/drop>
and drag this whole folder in. You get a live URL in seconds, no account
strictly required to try it (an account is needed to keep it live long-term,
free tier is generous).

**Option C: GitHub Pages** — push this folder to a GitHub repo, then in repo
**Settings > Pages**, enable Pages from the main branch. Free, ties to your
GitHub account.

---

## How you'll use it day to day

- Go to `yoursite.com/admin.html`, log in.
- **Single certificate**: fill in the recipient's name, course/title,
  organization, and date → click Generate → a designed PDF downloads
  automatically and the record is saved.
- **Bulk**: prepare a CSV with columns `name, course, org, issueDate, title`
  (only `name` and `course` are required) → upload it → you get a ZIP of one
  PDF per row, all saved as verifiable records in one go.
- Share `yoursite.com/index.html` (or have people scan the QR code on the
  certificate) for anyone to check authenticity. The recently issued list in
  the console lets you **Revoke** a certificate at any time — revoked ones
  immediately show as invalid on the public page.

## Free tier limits (Firebase Spark plan)

At ~100 certificates/month you'll use a tiny fraction of the free quota:
1 GiB Firestore storage, 50,000 reads/day, 20,000 writes/day, 10 GB hosting
storage, 360 MB/day hosting transfer. You will not be asked to pay.

## Customizing the certificate design

The certificate's look (colors, layout, text, seal) is generated in
`js/admin.js` inside the `buildCertificatePDF` function using jsPDF — edit
the coordinates, fonts, or colors there to match your brand.
