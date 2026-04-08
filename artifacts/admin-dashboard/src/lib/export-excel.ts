import * as XLSX from "xlsx";

export interface ExcelColumn<T> {
  header: string;
  key: keyof T | string;
  getValue?: (row: T) => string | number | null | undefined;
  width?: number;
}

export function downloadExcel<T extends object>(
  filename: string,
  sheetName: string,
  rows: T[],
  columns: ExcelColumn<T>[]
) {
  const header = columns.map(c => c.header);
  const data = rows.map(row =>
    columns.map(c => {
      if (c.getValue) return c.getValue(row) ?? "";
      const v = row[c.key as keyof T];
      return v === null || v === undefined ? "" : String(v);
    })
  );

  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);

  const colWidths = columns.map((c, i) => {
    const maxLen = Math.max(
      c.header.length,
      ...data.map(r => String(r[i] ?? "").length)
    );
    return { wch: Math.min(c.width ?? maxLen + 2, 50) };
  });
  ws["!cols"] = colWidths;

  const headerRange = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let C = headerRange.s.c; C <= headerRange.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (!ws[addr]) continue;
    ws[addr].s = {
      font: { bold: true },
      fill: { fgColor: { rgb: "1D4ED8" } },
      alignment: { horizontal: "center" },
    };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const safeFilename = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, safeFilename);
}
