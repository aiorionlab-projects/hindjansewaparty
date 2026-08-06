import Razorpay from "razorpay";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./_firebaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    console.error("Razorpay env vars missing");
    return res.status(500).json({ error: "Payment gateway is not configured" });
  }

  try {
    const { amount, receipt, record } = req.body || {};
    const amountPaise = Number(amount);

    if (!Number.isInteger(amountPaise) || amountPaise < 100) {
      return res.status(400).json({ error: "Amount must be an integer of at least 100 paise (₹1)" });
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: receipt || `hjsp_${Date.now()}`,
    });

    // ------------------------------------------------------------------
    // Write a "pending" registration record RIGHT NOW, keyed by the order
    // id -- before the person has even seen the Razorpay checkout popup.
    //
    // This is the fix for payments that show up in Razorpay but never
    // appear in the admin panel: previously the ONLY Firestore write
    // happened inside the browser's `handler` callback after checkout
    // closed. If the tab was closed, the phone switched to a UPI app and
    // never came back to the browser, the connection dropped, etc., that
    // callback simply never ran and nothing was ever saved -- even though
    // Razorpay had already captured the money.
    //
    // Now the record exists as soon as the order is created, and
    // api/razorpay-webhook.js (called directly by Razorpay's servers,
    // independent of the customer's browser) reliably flips it to "paid".
    // ------------------------------------------------------------------
    try {
      const db = getAdminDb();
      await db.collection("registrations").doc(order.id).set({
        ...(record && typeof record === "object" ? record : {}),
        amount: amountPaise / 100,
        orderId: order.id,
        status: "pending",
        adminVerified: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (dbErr) {
      // Don't block payment if this write fails, but log loudly -- a
      // failure here is exactly the kind of thing that causes "missing
      // from admin" reports, so it should never fail silently.
      console.error("Could not write pending registration record:", dbErr);
    }

    return res.status(200).json({ order_id: order.id, amount: order.amount, currency: order.currency });
  } catch (err) {
    const status = err?.statusCode === 401 ? 401 : 500;
    console.error("create-order error:", err?.error || err);
    return res.status(status).json({ error: "Could not create payment order" });
  }
}
