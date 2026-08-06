import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./_firebaseAdmin.js";
import { buildMembershipReceiptPdf } from "./_generateReceipt.js";

// Razorpay signs the webhook using the RAW request body, so we must turn
// off Vercel's default JSON body parsing for this route and read the raw
// bytes ourselves before verifying.
export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("RAZORPAY_WEBHOOK_SECRET is not configured");
    return res.status(500).json({ error: "Webhook is not configured" });
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers["x-razorpay-signature"];

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  const validSignature =
    typeof signature === "string" &&
    expectedSignature.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));

  if (!validSignature) {
    console.error("Razorpay webhook signature mismatch");
    return res.status(400).json({ error: "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  const eventType = event.event;
  const payment = event.payload?.payment?.entity;

  try {
    const db = getAdminDb();

    // "payment.captured" is Razorpay's confirmation that money actually
    // moved. This handler is called by Razorpay's servers directly, so it
    // runs whether or not the customer's browser is still open -- that's
    // what makes it the reliable half of the payment-status fix.
    if (eventType === "payment.captured" && payment?.order_id) {
      const docRef = db.collection("registrations").doc(payment.order_id);
      await docRef.set(
        {
          orderId: payment.order_id,
          paymentId: payment.id,
          amount: (payment.amount || 0) / 100,
          status: "paid",
          capturedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Generate the membership certificate + payment receipt PDF, once,
      // for membership registrations only (not donations) -- and store it
      // directly on this same Firestore document. Only the authenticated
      // admin panel has read access to this collection (see
      // firestore.rules), so this is how "only the admin can download it"
      // is enforced: nothing on the public site ever reads this field.
      const snap = await docRef.get();
      const record = snap.data();
      if (record && record.type !== "donation" && !record.receiptPdfBase64) {
        try {
          const receiptPdfBase64 = await buildMembershipReceiptPdf(record);
          await docRef.set(
            { receiptPdfBase64, receiptGeneratedAt: FieldValue.serverTimestamp() },
            { merge: true }
          );
        } catch (pdfErr) {
          // Never fail the webhook over a PDF generation problem -- the
          // payment itself is already correctly recorded as paid.
          console.error("Receipt PDF generation failed:", pdfErr);
        }
      }
    }

    // "payment.failed" -- an attempt was made and Razorpay/the bank
    // declined it. Distinct from the customer just closing the checkout
    // popup without trying (that's handled client-side as "cancelled").
    if (eventType === "payment.failed" && payment?.order_id) {
      await db.collection("registrations").doc(payment.order_id).set(
        {
          orderId: payment.order_id,
          status: "failed",
          failureReason: payment.error_description || payment.error_reason || "Payment failed",
          failedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.error("Webhook Firestore update failed:", err);
    // Return 5xx so Razorpay automatically retries this webhook later
    // (it retries on non-2xx responses) instead of silently dropping it.
    return res.status(500).json({ error: "Could not record payment event" });
  }

  // Always acknowledge with 200 for event types we don't act on, so
  // Razorpay doesn't keep retrying events we intentionally ignore.
  return res.status(200).json({ received: true });
}
