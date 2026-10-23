# INVOXIS AI

Intelligent financial document processing, validation and workflow automation.
React + TypeScript + Vite frontend, FastAPI + SQLAlchemy + SQLite backend, Groq for PDF understanding,
and a **deterministic Python rules engine** (Decimal arithmetic, no LLM) for financial validation.

The app runs in two explicit modes selected by `VITE_APP_MODE`:

| Mode | Data | Extraction | Needs backend / API key |
|---|---|---|---|
| `demo` (default) | Mock data + `localStorage` (original prototype behaviour) | Simulated | No |
| `backend` | SQLite via FastAPI | Groq (server-side) | Backend yes; Groq key only for extraction |

In backend mode there is **no silent fallback to demo data**: failed requests show the server's real error and
a "data may be out of date" banner.

## Architecture

```
Browser (React, :3000)                    FastAPI (:8000)                          External
 pages -> InvoiceContext -> invoiceService  /api/v1  routes (thin)                  Groq API
          |- LocalInvoiceService (demo)     services: pdf_processing,               (key stays server-side)
          '- BackendInvoiceService ------>   invoice_extraction, invoice_validation,
             (httpClient + mappers)          review_service, audit_service,
                                             processing_service (jobs)
                                            SQLAlchemy -> SQLite  +  storage/uploads (PDF files)
```

```
src/                      frontend (design, pages, components unchanged except where noted below)
  config.ts               VITE_APP_MODE / VITE_API_BASE_URL
  services/invoiceService.ts          mode selection (demo vs backend)
  services/backendInvoiceService.ts   backend implementation of IInvoiceService (+ upload/retry/validate/health)
  services/api/{httpClient,dto,mappers}.ts   typed errors, backend DTOs, explicit mapping + diff-PATCH
backend/app/
  main.py  api/routes/  core/{config,errors,logging}.py  db/{session,models}.py  schemas/
  services/{pdf_processing,invoice_extraction,invoice_validation,review_service,audit_service,
            invoice_service,processing_service}.py
  tests/                  pytest suite
scripts/                  frontend<->backend end-to-end check
```

## Prerequisites
Node 20+ (tested on 22), npm, Python 3.11+ (tested on 3.12).

## Setup and run

### 1. Frontend (demo mode, no backend needed)
```bash
npm install
npm run dev            # http://localhost:3000
```

### 2. Backend
Linux / macOS:
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env            # then edit .env
uvicorn app.main:app --reload --port 8000
```
Windows PowerShell:
```powershell
cd backend
py -3 -m venv .venv ; .\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
Copy-Item .env.example .env     # then edit .env
uvicorn app.main:app --reload --port 8000
```
API docs: http://localhost:8000/docs - Health: http://localhost:8000/api/v1/health

The SQLite file (`backend/data/invoxis.db`) and tables are created automatically on startup.

### 3. Enable backend mode in the frontend
Create `.env.local` in the repo root (see `.env.example`):
```
VITE_APP_MODE=backend
VITE_API_BASE_URL=http://localhost:8000/api/v1
```
Restart `npm run dev`. Settings > System Health shows live backend status.

### 4. Configure Groq
In `backend/.env` set at least:
```
GROQ_API_KEY=<your key>
GROQ_MODEL=<model id>            # text-layer PDFs. No default is hardcoded; pick from https://console.groq.com/docs/models
GROQ_VISION_MODEL=<model id>     # scanned/image PDFs. Must accept images. Empty = reuse GROQ_MODEL
GROQ_STRUCTURED_MODE=json_schema # or json_object if your model rejects json_schema
```
Restart the backend. **Never** put the key in a `VITE_*` variable (those are shipped to the browser).
Without credentials the app still starts: uploads are stored, extraction fails with
`extraction_not_configured`, and you can **Retry** after configuring.

Model notes (check Groq's docs, they change): `json_schema` structured output is only available on some models
(e.g. Llama 4 variants); other models need `GROQ_STRUCTURED_MODE=json_object`. If the model does not support the
chosen mode, the job fails with `groq_bad_request` and a message saying what to change. Output is always
re-validated against the invoice schema by Pydantic, so a model that ignores the schema produces an error,
not bad data.

## Environment variables (backend/.env)
`GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_VISION_MODEL`, `GROQ_STRUCTURED_MODE`, `GROQ_TIMEOUT_SECONDS`,
`GROQ_MAX_OUTPUT_TOKENS`, `GROQ_MAX_IMAGES`, `MAX_IMAGE_PAYLOAD_MB`, `MAX_PROMPT_CHARS`, `DATABASE_URL` (default `sqlite:///./data/invoxis.db`),
`UPLOAD_DIR`, `MAX_UPLOAD_SIZE_MB` (25), `MAX_PDF_PAGES` (30), `CORS_ORIGINS` (explicit origins only; `*` is rejected),
`ROUNDING_TOLERANCE` (0.02), `JOB_EXECUTION_MODE` (`thread`|`inline`), `LOG_LEVEL`. See `backend/.env.example`.

## API summary (`/api/v1`)
| Area | Endpoints |
|---|---|
| Health | `GET /health` |
| Invoices | `GET/POST /invoices`, `GET/PATCH/DELETE /invoices/{id}` (DELETE = archive), `POST /invoices/{id}/reprocess[?force=true]`, `GET /invoices/{id}/extraction` |
| Documents | `POST /documents/upload` (multipart, batch), `GET /documents`, `GET /documents/{id}`, `GET /documents/{id}/status`, `POST /documents/{id}/extract`, `POST /documents/{id}/retry`, `GET /documents/{id}/file` |
| Validation | `POST /invoices/{id}/validate`, `GET /invoices/{id}/validation`, `GET /validation/issues` |
| Review | `POST /invoices/{id}/review`, `GET /invoices/{id}/review-history`, `GET /review-queue` |
| Reports / audit | `GET /reports/summary`, `GET /reports/validation`, `GET /audit-logs` |

Lists are paginated (`page`, `page_size`) and return `{items,total,page,page_size}`. Errors always use
`{"error":{"code","message","details","request_id"}}`.

## Data model
`source_documents`, `processing_jobs`, `invoices`, `invoice_line_items`, `extraction_results` (immutable per-run
raw output), `validation_issues` (history kept; superseded issues are marked resolved), `review_history`,
`audit_events` (append-only; `invoice_id` is intentionally not a foreign key so history survives deletion).
Money is `Decimal` in Python and scaled integers in SQLite (exact, sortable, portable). Timestamps are UTC.
Schema is created with `create_all` at startup; **Alembic migrations are not included** (see limitations).

## How extraction works
PyMuPDF inspects the PDF.
- **Text-layer PDFs:** the page text (capped at `MAX_PROMPT_CHARS`; truncation is flagged) goes to `GROQ_MODEL`.
- **Scanned PDFs:** pages are rendered (rotation applied) to JPEG and sent to `GROQ_VISION_MODEL`. Groq limits
  inline-image requests (commonly **5 images** and **~4 MB total**), so at most `GROQ_MAX_IMAGES` pages are
  sent, resolution/quality is lowered automatically to fit `MAX_IMAGE_PAYLOAD_MB`, and if a scan still cannot
  fit the job fails with `scan_too_large`. If a scan has more pages than were sent, the extraction is marked with
  a warning (later pages, e.g. extra line items, were **not** read). Validation will usually flag the resulting
  subtotal mismatch.

Output is JSON, then normalised deterministically. Integrity rules: absent = `null` (never 0), unreadable or
ambiguous values (e.g. `1,234`, `03/04/2025`) become `null` plus a "needs verification" flag, a bare currency
symbol is **not** turned into a currency code, line items are never invented, and **no AI confidence score is
shown**. Fields are flagged by deterministic checks (value not found verbatim in the PDF text, ambiguous format,
unreadable). PDF text is treated as untrusted data (the model has no tools and the output schema is fixed).

## Validation rules (deterministic)
Required fields, date logic, line math (qty x price - discount), line sum vs subtotal, grand total
(`subtotal + tax + shipping - discount`), tax vs line rates, negative/implausible amounts, duplicates
(same vendor+number; same vendor+date+amount), plus extractor flags. `|diff| <= tolerance` passes;
up to 5x tolerance is a **warning** (rounding band); beyond is **critical**. Validation never edits invoice fields.

## Review workflow
`pending -> in_review | approved | rejected | returned_for_correction`; `in_review -> approved | rejected | returned`;
`returned -> in_review | rejected`; `approved/rejected -> in_review` (re-open). Reject/return need a comment.
Approved invoices are locked against edits. There is no authentication: every action is attributed to
`dev-workspace (unauthenticated)`; approvals here are **not** legally binding financial approvals.

## Tests and checks
```bash
cd backend && pytest app/tests -q          # backend tests (Groq mocked; no key or network needed)
npx tsc --noEmit                           # frontend type-check  (npm run lint)
npm run build                              # production build
```
End-to-end check of the real frontend service layer against a live backend (uses a test-only server with a
deterministic extractor instead of Groq):
```bash
cd backend
python -m app.tests.make_e2e_fixtures /tmp/e2e
DATABASE_URL=sqlite:////tmp/e2e/data/e.db UPLOAD_DIR=/tmp/e2e/up python -m app.tests.e2e_server &
cd .. && E2E_DIR=/tmp/e2e npm run e2e:backend
```

## Upload and storage behaviour
PDF only; extension, MIME type, `%PDF-` signature, size, emptiness, page count and encryption are checked;
the PDF must parse. Files are stored as server-generated `<uuid>.pdf` in `UPLOAD_DIR`; the original name is
display-only and never used as a path. `GET /documents/{id}/file` resolves only DB-known names inside the
upload directory. Identical files (SHA-256) are rejected as duplicates. Archiving an invoice keeps its PDF.

## Known limitations
- **Job worker is in-process** (thread pool + persisted job rows). Single API process only; no automatic retry or
  backoff; interrupted jobs are re-queued on startup. Use a real queue for multi-process deployment.
- **No Alembic migrations**; schema comes from `create_all`. Add Alembic before changing models in a deployed DB.
- **No authentication/authorisation.** Do not expose this service publicly.
- **Real Groq extraction was not exercised in this build** (no API key available): the SDK call, request shape and
  error mapping are unit-tested against a mocked client only. Validate with your own key on non-sensitive sample
  invoices first, and confirm your chosen models support your `GROQ_STRUCTURED_MODE`.
- **Scanned PDFs are limited** to `GROQ_MAX_IMAGES` pages per document (one request, no chunking) and a ~3 MB image
  budget; long or very high-resolution scans may be partially read or rejected (see above).
- Groq-hosted models are open-weight LLMs; extraction accuracy on messy invoices can differ from other providers.
  Always rely on the deterministic validation and human review, not on the model.
- Ambiguous numbers such as `1,234` are deliberately not guessed and require human verification.
- Line `discount` is an **amount** in backend mode; the demo calculator treats values <= 1 as a fraction. Editing a
  line discount between 0 and 1 in the UI can therefore produce a line-total mismatch flag.
- Review queue / history / reports pages load all (non-archived) invoices client-side; fine at college scale.
- The UI rounding-tolerance setting is applied to explicit "Validate / Re-run" actions; automatic validation after
  uploads and edits uses the backend `ROUNDING_TOLERANCE`.
- The original package.json contains unused AI-Studio-era dependencies (`@google/genai`, `express`, ...). They are
  unrelated to the backend's Groq integration and were left untouched. The only dependency change is `esbuild`
  `^0.25` -> `^0.28`, required for `npm install` to resolve with Vite 8's peer range.
- Bounding-box/field-location metadata is **not** extracted (marked unavailable rather than invented); page numbers
  and source snippets are stored when the model supplies them.
- The browser UI itself was not exercised in a real browser here; frontend verification is type-check, production
  builds (both modes) and the service-layer end-to-end script.

## Security notes
Groq key is server-side only; CORS is an explicit allow-list without credentials; uploads are validated and
stored under random names; responses never include filesystem paths; logs redact API keys and omit invoice
contents; no payment, e-mail or accounting-write capability exists.
