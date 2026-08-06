import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// NOTE: Uses pdf-lib's built-in Helvetica (WinAnsi) fonts only, so all text
// here must stay Latin-script -- embedding a Devanagari font is possible
// with pdf-lib + @pdf-lib/fontkit if Hindi text is wanted later, but that
// needs a font file bundled into the project, so it's left out for now to
// keep this dependency-free and guaranteed to render.

const MAROON = rgb(0.784, 0.118, 0.243);
const INK = rgb(0.125, 0.141, 0.169);
const GREY = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.85, 0.85, 0.85);

function centered(page, text, font, size, y, color, pageWidth) {
  const textWidth = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (pageWidth - textWidth) / 2, y, size, font, color });
}

function labelValueRow(page, label, value, y, boldFont, regularFont) {
  page.drawText(`${label}:`, { x: 70, y, size: 11, font: boldFont, color: INK });
  page.drawText(String(value ?? "-"), { x: 260, y, size: 11, font: regularFont, color: INK });
}

/**
 * Builds a one-page membership certificate + payment receipt PDF for a
 * "paid" registration record, and returns it as a base64 string.
 * Intended to be called once, server-side, right after a payment is
 * confirmed (see api/razorpay-webhook.js).
 */
export async function buildMembershipReceiptPdf(record) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait, in points
  const { width, height } = page.getSize();

  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Decorative double border
  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: MAROON, borderWidth: 2 });
  page.drawRectangle({ x: 34, y: 34, width: width - 68, height: height - 68, borderColor: MAROON, borderWidth: 0.75 });

  let y = height - 90;
  centered(page, "HIND JANSEWI PARTY", bold, 22, y, MAROON, width);
  y -= 20;
  centered(page, "Membership Certificate & Payment Receipt", regular, 12, y, GREY, width);

  y -= 55;
  centered(page, "Congratulations!", bold, 20, y, MAROON, width);
  y -= 22;
  const memberName = record.name || "Member";
  centered(page, `${memberName} is officially a member of Hind Jansewi Party.`, regular, 13, y, INK, width);

  y -= 45;
  page.drawLine({ start: { x: 60, y }, end: { x: width - 60, y }, thickness: 1, color: LINE });
  y -= 32;

  centered(page, "Member Details", bold, 13, y, MAROON, width);
  y -= 24;
  const now = new Date();
  const memberRows = [
    ["Member Name", record.name],
    ["Phone", record.phone],
    ["Address", record.permanentAddress],
    ["Occupation", record.occupation],
    ["Join Date", record.joinDate || now.toLocaleDateString("en-IN")],
  ];
  memberRows.forEach(([label, value]) => {
    labelValueRow(page, label, value, y, bold, regular);
    y -= 20;
  });

  y -= 14;
  page.drawLine({ start: { x: 60, y }, end: { x: width - 60, y }, thickness: 1, color: LINE });
  y -= 32;

  centered(page, "Payment Details", bold, 13, y, MAROON, width);
  y -= 24;
  const paymentRows = [
    ["Receipt No.", record.orderId],
    ["Payment ID", record.paymentId],
    ["Amount Paid", `Rs. ${Number(record.amount || 0).toLocaleString("en-IN")}`],
    ["Payment Date", now.toLocaleDateString("en-IN")],
    ["Status", "PAID"],
  ];
  paymentRows.forEach(([label, value]) => {
    labelValueRow(page, label, value, y, bold, regular);
    y -= 20;
  });

  y -= 24;
  page.drawLine({ start: { x: 60, y }, end: { x: width - 60, y }, thickness: 1, color: LINE });
  y -= 26;
  centered(page, "This is a computer-generated membership certificate and payment receipt.", regular, 9, y, GREY, width);
  y -= 14;
  centered(page, "Jai Hind", bold, 13, y, MAROON, width);

  return pdfDoc.saveAsBase64();
}
