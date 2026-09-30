# D-Store — Catalog Acceptance & Moderation Policy

*Leaf `5.d.iii.zo`. A policy document, not code. It records what the catalog accepts, who decides, how a problem is reported and handled, and what is and is not built today. Where the code and this document disagree, the code is what runs; fix whichever is wrong in the same change. `HANDOVER.md` wins for sequencing and `docs/D-STORE.md` for product intent.*

**Status of this document.** It describes the rules the current code already enforces and the process the current pages already promise. Anything that needs an operator decision (response times, a named contact, who is on call) is listed in section 8 as **open** and is not invented here.

---

## 1. Principles

1. **No accounts.** D-Store has no user accounts (`docs/D-STORE.md` §3). Reports and ratings are anonymous, so moderation is lightweight flagging and review by an operator, not a threaded review-moderation system.
2. **Trust is built by the store.** Apps are sideloaded, so the store has to show what Play Store's review would normally vouch for: checksums, signing fingerprint, permissions, data safety, licence and source, on the app page and not buried.
3. **Say where an app came from.** Every app is either first-party (published through the Console, Zealot) or third-party (imported from Aptoide). The two are never presented as equally vouched for.
4. **Show "Not provided", never a made-up default.** When a source does not give a field, the page says so.
5. **Fail closed.** Anything that cannot be verified is left out of the catalog or has its privileged controls disabled, rather than shown with a guess.

## 2. Two sources, two levels of acceptance

| | First-party | Third-party |
|---|---|---|
| Source | Zealot's signed catalog index (the Console) | Aptoide's public web API, snapshotted into `storage/downloads/aptoide-snapshot.json` |
| Who accepts an app | The Console's publisher flow: the app is uploaded, organisation-signed and published there. D-Store does not build, sign or store binaries. | Nobody reviews individual apps. An app is in the catalog only if it passes the automatic gate below and someone chose to ingest its package. |
| What D-Store checks | The index signature (pinned Ed25519 key, expiry, anti-rollback) and the SHA-256 of referenced files, before anything is shown. | Aptoide's own scan verdict, and only that. |
| Labels | "Verified developer" when the index says so; org signing fingerprint and checksum under "Verify this APK". | "Third-party (via Aptoide)". No Verified badge, no Zealot fingerprint or checksum. |
| Download | Zealot's stable download route | Aptoide's own delivery |
| Order | Always ahead of third-party: hero, home shelves, search results, Top Free | After first-party |
| Duplicate package | The Zealot entry is shown; the Aptoide entry is hidden | — |

## 3. Acceptance rules

### 3.1 First-party

An app appears only if the Console publishes it in a validly signed, non-expired, non-rolled-back index. What may be listed, and what a publisher must supply (listing text, icon and screenshot hashes, version, APK pointer with SHA-256 and signing fingerprint), is decided on the Console side and specified by Zealot's catalog index schema. This repository is a read-only consumer and has no approve/reject step of its own. **A first-party takedown is done in the Console** (unpublish or yank); the storefront follows at the next index it reads.

### 3.2 Third-party (Aptoide)

The ingestion script (`scripts/ingest-aptoide.ts`, leaf `5.h.iv.zo`) keeps a response only when Aptoide's own `file.malware.rank` is exactly `TRUSTED`. `UNKNOWN`, `WARN`, a missing rank and anything else are dropped, and each drop is printed with its package and reason. This gate is the only automatic acceptance check, and it is only as good as Aptoide's scan: a keyword search on Aptoide can return other stores' uploads, so **packages are added by naming them, not by bulk search**.

Not yet checked (open, see section 8): Aptoide's terms for re-presenting its catalog and linking to its downloads (`HANDOVER.md` ❓2). Confirm them before the catalog is run at real scale or traffic.

### 3.3 What is never accepted

Regardless of source: malware, apps that facilitate illegal activity or harm, content that infringes copyright, and listings that misstate what the app is or does. D-Store may remove a listing for any of these without notice. Listing an app is not an endorsement.

## 4. How a problem gets reported

- **Anonymous report.** Every app page has a "Report a Problem" form with these reasons: *Broken download link*, *Malware or security concern*, *Inappropriate content*, *Copyright / DMCA issue*, *Other*, plus optional free text. It carries no identity. It is for a quick flag.
- **Formal copyright notice.** A valid DMCA notice needs a signature and contact details that the anonymous form cannot carry, so it goes through the process on `/dmca` (notice, counter-notice, repeat-infringer note). The two channels are deliberately separate.
- **Ratings.** Anonymous stars only (1 to 5, no text). Nothing is authored, so there is no written content to moderate. Written reviews would need moderation and throttling first (`5.d.ii.zo`).

### 4.1 What the report form does today

The form is still the dummy from Phase 0: submitting logs the payload to the browser console and shows a confirmation. **Nothing is stored or sent to anyone.** The SQL table it is meant to feed exists as a migration (`report_flag`, with `status` defaulting to `open`) but no Supabase project is provisioned and no route writes to it. Until that is built, a report cannot reach a moderator; treat the form as a placeholder for the process below, not a working intake. The formal `/dmca` process is by written notice to the designated agent and does not depend on the form.

## 5. How a report is handled (target process)

This is the process the code is being built toward. Steps marked *not built* have no implementation yet.

1. **Intake.** A report is stored anonymously with `status = open` (*not built*, see 4.1). Reports carry no IP hash, by design (`Review` rate-limits by hashed IP; `ReportFlag` does not).
2. **Triage.** An operator reads open reports in the admin queue. The only queue that exists is the legacy Symfony one (`/admin/reports`) in `legacy-symfony/`, which no live traffic reaches. Its replacement against the live stack is *not built* (`HANDOVER.md`, the `2.b.iii.zo` audit: a rewrite, not a deletion).
3. **Decide.** One of: **no action**; **relabel** (correct a wrong label or missing disclosure); **remove**; **escalate** (first-party: to the publisher through the Console; copyright: into the `/dmca` process).
4. **Act.**
   - *Third-party app:* remove the package from the ingested set and re-run ingestion, so the snapshot no longer contains it. A removal that only hides the page is not enough, because the snapshot is what the catalog reads.
   - *First-party app:* ask for it to be unpublished in the Console. D-Store cannot remove a signed index entry itself.
5. **Record.** Move the report to a closed status and note the outcome. Keep the record of the decision, never a personal identifier.
6. **Repeat problems.** A publisher or source that repeatedly ships listings that are removed is raised with the Console (first-party) or dropped from ingestion (third-party). The repeat-infringer commitment on `/dmca` applies to copyright specifically.

## 6. Admin access

The admin pages and `/api/admin/*` are protected by HTTP Basic auth against one shared secret in the environment (`ADMIN_PASSWORD`, at least 16 characters; `ADMIN_USERNAME`, default `admin`). With the password unset or too short, every admin route answers 503 to everyone (leaf `3.c.iv.zi`). There are no per-person admin accounts, so **the shared password is the whole access control**: rotate it when anyone who knew it leaves, and never put it in the repository. Editorial toggles (featured, Editor's Pick) and sponsored slots retire when the signed index becomes their source of truth (`5.g.v.zi`).

## 7. Data handled while moderating

Reports are anonymous and carry a reason and optional text only. Do not add reporter identifiers to a report. Moderation notes must not contain personal data. The privacy page (`/privacy`) describes what the site stores; if moderation starts to store anything new, update that page in the same change.

## 8. Open decisions (not decided here)

These need the operator. Until they are answered, nothing in this document promises them.

1. **Response targets.** How quickly a report is triaged, and how quickly a valid DMCA notice is acted on. None is stated on any page today.
2. **Named contact and designated agent.** `/dmca`, `/privacy` and `/terms` still carry placeholder contact details flagged for legal review.
3. **Who moderates.** The person or role that owns the queue, and a backup.
4. **Report intake.** Whether reports go to the Supabase `report_flag` table (needs `5.f.i` provisioned and a write route with throttling, `5.d.ii.zo`) or somewhere else, and where the review queue is rebuilt.
5. **Aptoide terms** (❓2), and whether an Aptoide-side `TRUSTED` verdict is enough on its own or ingestion needs a second check.
6. **Appeals.** Whether a removed third-party or first-party listing has any appeal path beyond the DMCA counter-notice.
7. **Published policy.** Whether a public-facing version of this document (an "About" or "Policies" page) is wanted. The current pages describe reporting and DMCA but not acceptance rules.

## 9. Change log for this document

Changes to this policy are recorded in the patch ledger (`CHANGELOG.md`) under the leaf that made them.
