function escapeCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);

  if (/[";\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
) {
  const separator = ";";
  const lines = [
    headers.map(escapeCell).join(separator),
    ...rows.map((row) => row.map(escapeCell).join(separator)),
  ];
  // BOM para que Excel respete los acentos en UTF-8.
  const content = "﻿" + lines.join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
