import ExcelJS from 'exceljs';
import { stringify } from 'csv-stringify/sync';
import PDFDocument from 'pdfkit';
import { ReportBundle, ReportSheet } from '../services/report.service';
import { SCHEME } from '../constants';

/**
 * Export renderers (Module K). The same ReportBundle drives Excel, CSV, PDF and the
 * print view, so an export can never disagree with what the screen showed.
 */

const MONEY_FORMAT = '#,##0.00 "PKR"';
const DATE_FORMAT = 'yyyy-mm-dd';

export async function renderWorkbook(bundle: ReportBundle): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = bundle.generatedBy;
  wb.created = new Date(bundle.generatedAt);
  wb.title = bundle.title;
  wb.description = `${bundle.title} | period ${bundle.period.from ?? 'all'} to ${bundle.period.to ?? 'all'}`;

  for (const sheet of bundle.sheets) {
    addSheet(wb, bundle, sheet);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function addSheet(wb: ExcelJS.Workbook, bundle: ReportBundle, sheet: ReportSheet) {
  const ws = wb.addWorksheet(sheet.name, {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { paperSize: 9, orientation: sheet.columns.length > 8 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1 },
  });

  // ---- title block -----------------------------------------------------------------
  ws.mergeCells(1, 1, 1, Math.max(sheet.columns.length, 4));
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `${sheet.title} - ${bundle.title}`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2C5C' } };
  ws.getRow(1).height = 26;

  ws.mergeCells(2, 1, 2, Math.max(sheet.columns.length, 4));
  const periodCell = ws.getCell(2, 1);
  periodCell.value = `Report period: ${bundle.period.from ?? 'beginning'} to ${bundle.period.to ?? 'today'}   |   Currency: ${SCHEME.CURRENCY}`;
  periodCell.font = { italic: true, size: 10, color: { argb: 'FF334155' } };

  ws.mergeCells(3, 1, 3, Math.max(sheet.columns.length, 4));
  const metaCell = ws.getCell(3, 1);
  metaCell.value = `Generated: ${new Date(bundle.generatedAt).toLocaleString('en-GB')}   |   By: ${bundle.generatedBy}   |   Rows: ${sheet.rows.length}`;
  metaCell.font = { italic: true, size: 9, color: { argb: 'FF64748B' } };

  // ---- header row ------------------------------------------------------------------
  const headerRow = ws.getRow(4);
  headerRow.values = sheet.columns.map((c) => c.header);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF0F2C5C' } } };
  });

  sheet.columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width ?? 16;
  });

  // ---- data rows -------------------------------------------------------------------
  sheet.rows.forEach((row, idx) => {
    const r = ws.getRow(5 + idx);
    r.values = sheet.columns.map((c) => normalise(row[c.key], c.type));
    r.eachCell((cell, colNumber) => {
      const col = sheet.columns[colNumber - 1];
      cell.font = { size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: col?.type === 'money' || col?.type === 'number' ? 'right' : 'left' };
      if (col?.type === 'money') cell.numFmt = MONEY_FORMAT;
      if (col?.type === 'date') cell.numFmt = DATE_FORMAT;
      // CNIC / phone / codes stay text so leading zeros survive.
      if (col?.type === 'text') cell.numFmt = '@';
      if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    });
  });

  // ---- totals ----------------------------------------------------------------------
  if (sheet.totals?.length) {
    let rowIdx = 5 + sheet.rows.length + 1;
    for (const t of sheet.totals) {
      const r = ws.getRow(rowIdx);
      r.getCell(1).value = t.label;
      r.getCell(1).font = { bold: true, size: 10 };
      const valueCell = r.getCell(2);
      valueCell.value = t.money ? Number(t.value.toFixed(2)) : t.value;
      valueCell.font = { bold: true, size: 10 };
      if (t.money) valueCell.numFmt = MONEY_FORMAT;
      valueCell.alignment = { horizontal: 'right' };
      rowIdx += 1;
    }
  }

  // ---- filters over the data range -------------------------------------------------
  if (sheet.rows.length > 0) {
    ws.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4 + sheet.rows.length, column: sheet.columns.length },
    };
  }
}

function normalise(value: unknown, type?: string): string | number | Date | null {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'money' || type === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (type === 'date') {
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d;
  }
  return String(value);
}

export function renderCsv(bundle: ReportBundle): string {
  const blocks: string[] = [];
  for (const sheet of bundle.sheets) {
    const rows = [
      [sheet.title],
      [`Report period: ${bundle.period.from ?? 'beginning'} to ${bundle.period.to ?? 'today'}`],
      [`Generated: ${new Date(bundle.generatedAt).toISOString()} | By: ${bundle.generatedBy}`],
      [],
      sheet.columns.map((c) => c.header),
      ...sheet.rows.map((row) => sheet.columns.map((c) => formatCsvValue(row[c.key], c.type))),
    ];
    if (sheet.totals?.length) {
      rows.push([]);
      for (const t of sheet.totals) rows.push([t.label, String(t.value)]);
    }
    blocks.push(stringify(rows));
  }
  return blocks.join('\n\n');
}

function formatCsvValue(value: unknown, type?: string): string {
  if (value === null || value === undefined) return '';
  if (type === 'date') {
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
  }
  if (type === 'money') return Number(value).toFixed(2);
  return String(value);
}

export function renderPdf(bundle: ReportBundle): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const widest = Math.max(...bundle.sheets.map((s) => s.columns.length));
    const doc = new PDFDocument({
      size: 'A4',
      layout: widest > 7 ? 'landscape' : 'portrait',
      margin: 36,
      info: { Title: bundle.title, Author: bundle.generatedBy, Subject: `${bundle.title} report` },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    bundle.sheets.forEach((sheet, sheetIndex) => {
      if (sheetIndex > 0) doc.addPage();
      drawSheet(doc, bundle, sheet);
    });

    // Page numbers over every page.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .fillColor('#64748b')
        .text(
          `${bundle.title}  |  Page ${i + 1} of ${range.count}  |  Generated ${new Date(bundle.generatedAt).toLocaleString('en-GB')}`,
          doc.page.margins.left,
          doc.page.height - 28,
          { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' }
        );
    }

    doc.end();
  });
}

function drawSheet(doc: PDFKit.PDFDocument, bundle: ReportBundle, sheet: ReportSheet) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Header
  doc.rect(doc.page.margins.left, doc.y - 6, pageWidth, 44).fill('#0f2c5c');
  doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold');
  doc.text(sheet.title, doc.page.margins.left + 8, doc.page.margins.top + 4, { width: pageWidth - 16 });
  doc.fontSize(8).font('Helvetica').fillColor('#cbd5e1');
  doc.text(
    `${bundle.title}  |  Period: ${bundle.period.from ?? 'beginning'} to ${bundle.period.to ?? 'today'}  |  Currency: ${SCHEME.CURRENCY}`,
    doc.page.margins.left + 8,
    doc.y,
    { width: pageWidth - 16 }
  );
  doc.fillColor('#000000');
  doc.moveDown(1.4);

  const columns = layoutColumns(sheet, pageWidth);
  const startY = doc.y;

  const drawHeader = (y: number) => {
    doc.rect(doc.page.margins.left, y, pageWidth, 18).fill('#1e40af');
    doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
    let x = doc.page.margins.left;
    columns.forEach((col) => {
      doc.text(col.header, x + 3, y + 5, { width: col.width - 6, height: 12, ellipsis: true, lineBreak: false });
      x += col.width;
    });
    doc.fillColor('#000000').font('Helvetica');
    return y + 18;
  };

  let y = drawHeader(startY);

  if (sheet.rows.length === 0) {
    doc.fontSize(9).fillColor('#64748b').text('No records match the selected filters.', doc.page.margins.left + 4, y + 10);
    doc.fillColor('#000000');
  }

  sheet.rows.forEach((row, idx) => {
    const heights = columns.map((col) => doc.fontSize(7.5).heightOfString(String(formatCell(row[col.key], col.type) ?? ''), { width: col.width - 6 }));
    const rowHeight = Math.max(12, ...heights) + 4;

    if (y + rowHeight > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
      y = drawHeader(doc.page.margins.top);
    }

    if (idx % 2 === 1) doc.rect(doc.page.margins.left, y, pageWidth, rowHeight).fill('#f1f5f9');
    doc.fillColor('#000000').fontSize(7.5);

    let x = doc.page.margins.left;
    columns.forEach((col) => {
      const align = col.type === 'money' || col.type === 'number' ? 'right' : 'left';
      doc.text(String(formatCell(row[col.key], col.type) ?? ''), x + 3, y + 2, {
        width: col.width - 6,
        height: rowHeight - 2,
        align,
        ellipsis: true,
      });
      x += col.width;
    });
    doc
      .moveTo(doc.page.margins.left, y + rowHeight)
      .lineTo(doc.page.margins.left + pageWidth, y + rowHeight)
      .lineWidth(0.3)
      .strokeColor('#e2e8f0')
      .stroke();
    y += rowHeight;
  });

  if (sheet.totals?.length) {
    if (y + 60 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    y += 8;
    doc.fontSize(9).font('Helvetica-Bold');
    for (const t of sheet.totals) {
      doc.fillColor('#0f2c5c').text(t.label, doc.page.margins.left + 4, y, { width: pageWidth * 0.5 });
      doc.text(
        t.money ? `${Number(t.value).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PKR` : String(t.value),
        doc.page.margins.left + pageWidth * 0.5,
        y - 11,
        { width: pageWidth * 0.5 - 4, align: 'right' }
      );
      y += 12;
    }
    doc.font('Helvetica').fillColor('#000000');
  }
}

function layoutColumns(sheet: ReportSheet, pageWidth: number) {
  const totalWidth = sheet.columns.reduce((s, c) => s + (c.width ?? 16), 0);
  const scale = pageWidth / totalWidth;
  return sheet.columns.map((c) => ({ ...c, width: Math.max(38, (c.width ?? 16) * scale) }));
}

function formatCell(value: unknown, type?: string): string {
  if (value === null || value === undefined || value === '') return '-';
  if (type === 'date') {
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
  }
  if (type === 'money') {
    return Number(value).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(value);
}
