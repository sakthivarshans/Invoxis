/* Integration check: real frontend service layer + mappers against a live backend over HTTP.
 * Run via `npm run e2e:backend` (see README). Requires the test-only server (backend/app/tests/e2e_server.py). */
import { readFileSync } from 'node:fs';
import { BackendInvoiceService } from '../src/services/backendInvoiceService';
import { ApiError, request } from '../src/services/api/httpClient';
import type { InvoiceDto } from '../src/services/api/dto';

let failures = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + JSON.stringify(extra)}`);
  if (!cond) failures++;
};
const pdf = (p: string, name: string) => new File([readFileSync(p)], name, { type: 'application/pdf' });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const svc = new BackendInvoiceService();

  const h = await svc.health();
  check('health reports db + extraction configured', h.database === 'connected' && h.extraction.configured);

  // ---- upload: 2 good PDFs, 1 invalid, then a duplicate
  const out = await svc.uploadDocuments([
    pdf((process.env.E2E_DIR ?? '/tmp/e2e') + '/good.pdf', 'good.pdf'), pdf((process.env.E2E_DIR ?? '/tmp/e2e') + '/bad.pdf', 'bad.pdf'), pdf((process.env.E2E_DIR ?? '/tmp/e2e') + '/notpdf.pdf', 'notpdf.pdf'),
  ]);
  check('batch: 2 accepted, 1 rejected with reason',
    out.filter((o) => o.accepted).length === 2 && out.find((o) => o.filename === 'notpdf.pdf')?.errorCode === 'invalid_pdf_signature', out);
  const dup = await svc.uploadDocuments([pdf((process.env.E2E_DIR ?? '/tmp/e2e') + '/good.pdf', 'again.pdf')]);
  check('duplicate upload surfaced as rejected outcome', !dup[0].accepted && dup[0].errorCode === 'duplicate_upload', dup);

  // ---- wait for background extraction
  let invoices = await svc.getAllInvoices();
  for (let i = 0; i < 100 && invoices.some((x) => x.processingStatus === 'queued' || x.processingStatus === 'processing'); i++) {
    await sleep(100);
    invoices = await svc.getAllInvoices();
  }
  check('2 invoices persisted (no duplicate rows)', invoices.length === 2, invoices.length);
  const good = invoices.find((i) => i.invoiceNumber === 'E2E-001')!;
  const bad = invoices.find((i) => i.invoiceNumber === 'E2E-002')!;
  check('mapped values: numbers + dates + currency', good.grandTotal === 110 && good.subtotal === 100 && good.invoiceDate === '2025-03-01' && good.currency === 'USD', good);
  check('good invoice validates clean; bad one is critical + needs_review',
    good.validationStatus === 'valid' && bad.validationStatus === 'critical' && bad.processingStatus === 'needs_review', [good.validationStatus, bad.validationStatus]);
  check('documentId + version carried for the UI', Boolean(good.documentId) && good.version! >= 1);
  check('absent fields stay empty in UI model (not invented)', good.vendorAddress === '' && good.customerName === '', good);

  // ---- validation / stats / audit mapping
  const issues = await svc.fetchIssues();
  check('issues mapped to frontend shape', issues.some((i) => i.ruleId === 'MATH_GRAND_TOTAL_MISMATCH' && i.invoiceNumber === 'E2E-002' && i.severity === 'critical' && !!i.suggestedAction), issues.map((i) => i.ruleId));
  const stats = await svc.fetchStats();
  check('stats mapped', stats.passedValidations === 1 && stats.criticalIssuesCount === 1, stats);
  const audit = await svc.fetchAuditLogs();
  check('audit trail has upload + extraction events', audit.some((a) => a.action === 'DOCUMENT_UPLOADED') && audit.some((a) => a.action === 'EXTRACTION_COMPLETED'));

  // ---- diff-based PATCH: only changed field is sent; untouched nulls are NOT turned into 0
  const rawBefore = await request<InvoiceDto>(`/invoices/${bad.id}`);
  check('precondition: discount is null on server', rawBefore.discount === null && rawBefore.shipping_charges === null, rawBefore.discount);
  const edited = await svc.updateInvoice(bad.id, { ...bad, grandTotal: 110 });   // full object like ExtractionPage sends
  const rawAfter = await request<InvoiceDto>(`/invoices/${bad.id}`);
  check('edit persisted and re-validated server-side', rawAfter.grand_total === '110.0000' && edited.validationStatus === 'valid', rawAfter.validation_status);
  check('null discount/shipping preserved (not fabricated as 0)', rawAfter.discount === null && rawAfter.shipping_charges === null, [rawAfter.discount, rawAfter.shipping_charges]);
  const logs = await request<{ items: { details: any }[] }>('/audit-logs', { query: { invoice_id: bad.id, action: 'INVOICE_FIELDS_MODIFIED' } });
  check('audit records exactly the changed field with old/new', logs.items[0].details.changes.length === 1 && logs.items[0].details.changes[0].field === 'grand_total' && logs.items[0].details.changes[0].new === '110', logs.items[0]?.details);
  const noop = await svc.updateInvoice(bad.id, { ...edited });
  check('no-op save does not bump version', noop.version === edited.version, [noop.version, edited.version]);

  // ---- line-item edit keeps untouched line values byte-exact
  const li = edited.lineItems.map((l) => ({ ...l }));
  li[0].description = 'Widget (renamed)';
  const edited2 = await svc.updateInvoice(bad.id, { lineItems: li });
  check('line item edit persisted', edited2.lineItems[0].description === 'Widget (renamed)' && edited2.lineItems[0].lineTotal === 100);

  // ---- optimistic concurrency: stale writer is rejected with the server's message
  const stale = new BackendInvoiceService();
  await stale.getAllInvoices();
  await svc.updateInvoice(good.id, { vendorName: 'Writer A' });
  try {
    await stale.updateInvoice(good.id, { vendorName: 'Writer B' });
    const after = await request<InvoiceDto>(`/invoices/${good.id}`);
    check('stale write rejected', false, { sentVersion: (stale as any).raw.get(good.id)?.version, serverVersion: after.version, vendor: after.vendor_name });
  } catch (e) {
    check('stale write rejected with version_conflict', e instanceof ApiError && e.status === 409 && e.code === 'version_conflict', e);
  }
  check('stale writer did not overwrite', (await svc.getInvoiceById(good.id))!.vendorName === 'Writer A');

  // ---- review: note (same status), invalid transition error text, approval, lock
  const noteRes = await svc.updateReviewStatus(good.id, 'pending', 'ignored', 'a note');
  check('same-status review => note_added (no status change)', noteRes.reviewStatus === 'pending' && noteRes.reviewHistory[0].action === 'note_added', noteRes.reviewHistory[0]);
  const approved = await svc.updateReviewStatus(good.id, 'approved', 'ignored', 'ok');
  check('approval persisted with server-side actor', approved.reviewStatus === 'approved' && approved.reviewHistory[0].actor.includes('unauthenticated'), approved.reviewHistory[0]);
  try { await svc.updateReviewStatus(good.id, 'rejected', 'x', 'nope'); check('invalid transition rejected', false); }
  catch (e) { check('invalid transition => ApiError with code', e instanceof ApiError && e.code === 'invalid_review_transition', e); }
  try { await svc.updateInvoice(good.id, { vendorName: 'x' }); check('approved invoice locked', false); }
  catch (e) { check('approved invoice locked against edits', e instanceof ApiError && e.code === 'invoice_locked', e); }

  // ---- archive keeps audit
  await svc.deleteInvoice(bad.id);
  check('archived invoice leaves the list', (await svc.getAllInvoices()).length === 1);
  const after = await svc.fetchAuditLogs();
  check('audit history survives archival', after.some((a) => a.invoiceId === bad.id && a.action === 'DOCUMENT_ARCHIVED') && after.some((a) => a.invoiceId === bad.id && a.action === 'EXTRACTION_COMPLETED'));

  // ---- unknown id + network failure behave as real errors (never mock data)
  check('unknown id => null', (await svc.getInvoiceById('inv-nope')) === null);
  console.log(failures === 0 ? '\nALL E2E CHECKS PASSED' : `\n${failures} E2E CHECK(S) FAILED`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error('E2E crashed:', e); process.exit(2); });
