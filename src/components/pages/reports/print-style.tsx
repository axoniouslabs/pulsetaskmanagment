/**
 * Print rules for the reports page: hide the app chrome and give the report the full page.
 * When an appraisal is printed, body gets data-print="appraisal" and only the dialog prints.
 */
export function PrintStyle() {
  return (
    <style>{`
@media print {
  @page { margin: 14mm; }
  html, body { background: #fff !important; }
  aside, nav, header, [data-sonner-toaster] { display: none !important; }
  main { max-width: none !important; padding: 0 !important; margin: 0 !important; }
  .recharts-responsive-container { break-inside: avoid; }
  body[data-print="appraisal"] main { display: none !important; }
  body[data-print="appraisal"] .fixed.inset-0 { display: none !important; }
  body[data-print="appraisal"] [role="dialog"] {
    position: static !important; transform: none !important; inset: auto !important;
    max-height: none !important; width: 100% !important; max-width: none !important;
    box-shadow: none !important; border: 0 !important; animation: none !important;
  }
  [role="dialog"] button[aria-label="Close"] { display: none !important; }
  body[data-print="appraisal"] [role="dialog"] .overflow-y-auto { overflow: visible !important; }
}
`}</style>
  );
}

/** print just the open appraisal dialog */
export function printAppraisal() {
  document.body.dataset.print = "appraisal";
  const done = () => {
    delete document.body.dataset.print;
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}
