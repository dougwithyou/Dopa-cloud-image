// Crea (una sola vez) la suscripción de eventos de WHCC que avisa a la app
// cuando un pedido se acepta, se rechaza, se envía o se cancela.
//
//   WHCC_API_KEY=… WHCC_WEBHOOK_SECRET=… NEXT_PUBLIC_APP_URL=https://… \
//     npm run whcc:subscribe
//
// WHCC_WEBHOOK_SECRET lo generas tú (32+ caracteres sin espacios) y debe ser
// el mismo que tiene la app en Vercel. WHCC_ENV=live usa producción.

const env = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name}`);
  return v;
};

const live = process.env.WHCC_ENV === "live";
const base = live ? "https://apis.whcc.com/api" : "https://apis-stage.whcc.com/api";
const callbackUri = `${env("NEXT_PUBLIC_APP_URL").replace(/\/+$/, "")}/api/labs/whcc/webhook`;
const secret = env("WHCC_WEBHOOK_SECRET");
if (!/^[\x21-\x7e]{32,255}$/.test(secret)) throw new Error("WHCC_WEBHOOK_SECRET: 32 a 255 caracteres imprimibles, sin espacios");

async function call(path: string, init: RequestInit & { idempotencyKey?: string } = {}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env("WHCC_API_KEY")}`,
    "WHCC-API-Version": "2026-10",
    Accept: "application/json",
  };
  if (init.body) headers["Content-Type"] = "application/json";
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  const res = await fetch(`${base}/v1/fulfillment${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`WHCC ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

type Sub = { id: string; status: string; destination: { callbackUri: string } };

const { items } = (await call("/event-subscriptions")) as { items: Sub[] };
let sub = items.find((s) => s.destination?.callbackUri === callbackUri);
if (sub) {
  console.log(`Ya existe la suscripción ${sub.id} (${sub.status}) para ${callbackUri}.`);
  console.log("Si su secreto no coincide con WHCC_WEBHOOK_SECRET, bórrala en WHCC o rota el secreto y vuelve a ejecutar.");
} else {
  sub = (await call("/event-subscriptions", {
    method: "POST",
    idempotencyKey: `hdc-${Buffer.from(callbackUri).toString("base64url").slice(-40)}`,
    body: JSON.stringify({
      destination: { type: "webhook", callbackUri },
      eventTypes: ["order.accepted", "order.rejected", "order.shipped", "order.cancelled"],
      description: "Hi Dopa Cloud",
      signingSecret: secret,
    }),
  })) as Sub;
  console.log(`Suscripción creada: ${sub.id}`);
}
if (sub.status !== "active") {
  await call(`/event-subscriptions/${encodeURIComponent(sub.id)}/enable`, { method: "POST" });
  console.log("Suscripción activada.");
}
console.log(`Listo (${live ? "producción" : "pruebas"}): ${callbackUri}`);

export {};
