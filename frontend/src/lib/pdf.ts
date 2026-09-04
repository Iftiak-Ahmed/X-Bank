import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function downloadPdf(filename: string, title: string, rows: Record<string, unknown>[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(14);
  doc.setTextColor(20, 51, 92);
  doc.text(title, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generated ${new Date().toLocaleString()} — ${rows.length} record${rows.length === 1 ? "" : "s"}`, 40, 56);

  if (rows.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text("No records for this report.", 40, 84);
  } else {
    const headers = Object.keys(rows[0]);
    const body = rows.map((r) =>
      headers.map((h) => {
        const v = r[h];
        return v === null || v === undefined ? "" : String(v);
      })
    );

    autoTable(doc, {
      head: [headers],
      body,
      startY: 70,
      styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: [20, 51, 92], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 40, right: 40 },
    });
  }

  doc.save(filename);
}
