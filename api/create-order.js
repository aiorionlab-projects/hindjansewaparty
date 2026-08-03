import Razorpay from "razorpay";

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
    const { amount, receipt } = req.body || {};
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

    return res.status(200).json({ order_id: order.id, amount: order.amount, currency: order.currency });
  } catch (err) {
    const status = err?.statusCode === 401 ? 401 : 500;
    console.error("create-order error:", err?.error || err);
    return res.status(status).json({ error: "Could not create payment order" });
  }
}