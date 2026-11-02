/**
 * CSV export of the journal. Raw fields, no screen abbreviations: the file is
 * read as evidence (full User-Agent, ISO-8601 time in UTC, `source`).
 */
export const CSV_COLUMNS = [
  "user_id",
  "email",
  "username",
  "edition",
  "accepted_at_utc",
  "ip",
  "user_agent",
  "source",
] as const;

export type CsvAcceptance = {
  user_id: string;
  email: string | null;
  username: string;
  version: string;
  accepted_at: string;
  ip: string | null;
  user_agent: string | null;
  source: string;
};

/**
 * One CSV cell. A value starting with `= + - @`, a tab or CR is run as a
 * formula by Excel and Google Sheets (CSV injection, OWASP) — the User-Agent
 * is whatever the client sent — so it gets a leading `'` and quotes. Quotes
 * inside are doubled; a field with a comma or a line break is quoted (RFC 4180).
 */
export function csvCell(value: string | null): string {
  let v = value ?? "";
  const formula = /^[=+\-@\t\r]/.test(v);
  if (formula) v = `'${v}`;
  return formula || /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** ISO-8601 in UTC, whatever offset the service used. */
export function toUtcIso(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString();
}

export function acceptancesToCsv(rows: CsvAcceptance[]): string {
  const lines = rows.map((a) =>
    [
      a.user_id,
      a.email,
      a.username,
      a.version,
      toUtcIso(a.accepted_at),
      a.ip,
      a.user_agent,
      a.source,
    ]
      .map(csvCell)
      .join(",")
  );
  return [CSV_COLUMNS.join(","), ...lines].join("\r\n") + "\r\n";
}

/** Saves the CSV in the browser. The BOM makes Excel read UTF-8. */
export function downloadCsv(filename: string, rows: CsvAcceptance[]): void {
  const blob = new Blob(["\uFEFF" + acceptancesToCsv(rows)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
