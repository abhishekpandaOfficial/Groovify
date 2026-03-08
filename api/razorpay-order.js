export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    res.status(500).json({ error: "Payments are unavailable right now." });
    return;
  }

  try {
    const { amount, currency, note } = req.body || {};
    if (!amount || !currency) {
      res.status(400).json({ error: "Amount and currency are required." });
      return;
    }

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency,
        receipt: `groovify_${Date.now()}`,
        notes: {
          product: "Groovify Support",
          note: note || "Keep Groovify open and free",
        },
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      res.status(response.status).json({ error: "Unable to start payment right now." });
      return;
    }

    res.status(200).json(payload);
  } catch {
    res.status(500).json({ error: "Unable to start payment right now." });
  }
}
