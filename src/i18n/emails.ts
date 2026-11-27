import "server-only";
import { defineMessages } from "@/i18n/define";
import type { Locale } from "@/i18n/config";

// Textos de los correos (solo servidor). Las funciones `…Html` reciben valores
// ya escapados; las de texto plano, valores sin escapar.
const emails = defineMessages(
  {
    access: {
      subject: (creator: string) => `${creator} compartió contenido contigo`,
      title: (client: string) => `Hola ${client}`,
      bodyHtml: (creator: string) => `${creator} preparó tus fotos, videos y textos listos para publicar en un portal privado.`,
      button: "Ver mi contenido",
      noteHtml: (creator: string) => `El enlace es personal y caduca en 24 horas. Si caducó, pide a ${creator} que te reenvíe el acceso.`,
      text: (client: string, creator: string, link: string) =>
        `Hola ${client}:\n\n${creator} preparó tu contenido en un portal privado.\nEntra aquí: ${link}\n\nEl enlace es personal y caduca en 24 horas.`,
    },
    trial: {
      subject: (app: string, date: string) => `Tu prueba de ${app} termina el ${date}`,
      title: "Tu prueba gratuita termina pronto",
      bodyHtml: (name: string, date: string, price: string, plan: string) =>
        `Hola ${name}, tu prueba termina el <strong>${date}</strong>. Ese día se cobrará <strong>${price} USD</strong> del plan <strong>${plan}</strong> a la tarjeta registrada.`,
      changeHtml: "Si quieres cambiar de plan o cancelar, puedes hacerlo antes de esa fecha.",
      button: "Gestionar suscripción",
      text: (name: string, date: string, price: string, plan: string, link: string) =>
        `Hola ${name}: tu prueba termina el ${date}. Ese día se cobrará ${price} USD del plan ${plan}. Gestiona tu suscripción en ${link}`,
    },
    paymentFailed: {
      subject: (app: string) => `No pudimos procesar tu pago en ${app}`,
      title: "Problema con tu pago",
      bodyHtml: (name: string, days: number) =>
        `Hola ${name}, el último cobro de tu suscripción falló. Mientras no se resuelva, las subidas nuevas quedan bloqueadas. Tus clientes conservan acceso a sus portales durante ${days} días.`,
      button: "Actualizar método de pago",
      text: (name: string, days: number, link: string) =>
        `Hola ${name}: el último cobro falló. Las subidas están bloqueadas y tus clientes conservan acceso ${days} días. Actualiza tu pago en ${link}`,
    },
    order: {
      viewOrder: "Ver mi pedido",
      confirmSubject: (ref: string) => `Pedido ${ref} recibido`,
      confirmTitle: "¡Gracias por tu pedido!",
      confirmHelloHtml: (buyer: string, business: string) =>
        `Hola ${buyer}, recibimos tu pedido de impresiones de <strong>${business}</strong>.`,
      orderRefHtml: (ref: string) => `Pedido <strong>${ref}</strong>`,
      totalHtml: (total: string) => `<strong>Total: ${total}</strong>`,
      confirmNext: "Lo enviaremos a producción en el laboratorio y te avisaremos cuando salga, con su número de seguimiento.",
      confirmText: (ref: string, business: string, total: string, link: string) =>
        `Recibimos tu pedido ${ref} de ${business}. Total: ${total}. Míralo aquí: ${link}`,
      package: "Paquete",
      shippedSubject: (ref: string) => `Tu pedido ${ref} va en camino`,
      shippedTitle: "Tu pedido va en camino",
      shippedHtml: (buyer: string, ref: string) => `Hola ${buyer}, tu pedido <strong>${ref}</strong> salió del laboratorio.`,
      shippedText: (ref: string, tracking: string) => `Tu pedido ${ref} va en camino. Seguimiento: ${tracking}`,
      refunded: "No pudimos producir tu pedido y te devolvimos el dinero completo. Puede tardar de 5 a 10 días en verse en tu tarjeta.",
      reviewing: "Tuvimos un problema con tu pedido. Lo estamos revisando y te escribiremos pronto.",
      problemSubject: (ref: string, refunded: boolean) => `Pedido ${ref}: ${refunded ? "reembolso" : "estamos revisándolo"}`,
      problemTitle: "Novedades de tu pedido",
      hello: (buyer: string) => `Hola ${buyer}, `,
      problemText: (ref: string, msg: string) => `Pedido ${ref}: ${msg}`,
    },
    sale: {
      subject: (ref: string) => `Nueva venta de impresiones (${ref})`,
      title: "¡Vendiste impresiones!",
      bodyHtml: (business: string, gallery: string) => `${business}, recibiste un pedido en la galería <strong>${gallery}</strong>.`,
      amountsHtml: (total: string, earnings: string) =>
        `Total pagado: <strong>${total}</strong><br>Tu ganancia: <strong>${earnings}</strong>`,
      next: "El laboratorio lo produce y lo envía directo a tu cliente. Recibes tu ganancia cuando el pedido se envía.",
      button: "Ver mis ventas",
      yourGallery: "tu galería",
      text: (ref: string, gallery: string, total: string, earnings: string) =>
        `Nueva venta ${ref} en ${gallery}. Total ${total}, tu ganancia ${earnings}.`,
    },
  },
  {
    access: {
      subject: (creator: string) => `${creator} shared content with you`,
      title: (client: string) => `Hi ${client}`,
      bodyHtml: (creator: string) => `${creator} prepared your photos, videos and captions, ready to post, in a private portal.`,
      button: "View my content",
      noteHtml: (creator: string) => `This link is personal and expires in 24 hours. If it expired, ask ${creator} to send you access again.`,
      text: (client: string, creator: string, link: string) =>
        `Hi ${client},\n\n${creator} prepared your content in a private portal.\nOpen it here: ${link}\n\nThis link is personal and expires in 24 hours.`,
    },
    trial: {
      subject: (app: string, date: string) => `Your ${app} trial ends on ${date}`,
      title: "Your free trial ends soon",
      bodyHtml: (name: string, date: string, price: string, plan: string) =>
        `Hi ${name}, your trial ends on <strong>${date}</strong>. That day, <strong>${price} USD</strong> for the <strong>${plan}</strong> plan will be charged to your card on file.`,
      changeHtml: "If you'd like to change plans or cancel, you can do it before that date.",
      button: "Manage subscription",
      text: (name: string, date: string, price: string, plan: string, link: string) =>
        `Hi ${name}: your trial ends on ${date}. That day, ${price} USD for the ${plan} plan will be charged. Manage your subscription at ${link}`,
    },
    paymentFailed: {
      subject: (app: string) => `We couldn't process your ${app} payment`,
      title: "Problem with your payment",
      bodyHtml: (name: string, days: number) =>
        `Hi ${name}, the last charge for your subscription failed. Until it's resolved, new uploads are blocked. Your clients keep access to their portals for ${days} days.`,
      button: "Update payment method",
      text: (name: string, days: number, link: string) =>
        `Hi ${name}: the last charge failed. Uploads are blocked and your clients keep access for ${days} days. Update your payment at ${link}`,
    },
    order: {
      viewOrder: "View my order",
      confirmSubject: (ref: string) => `Order ${ref} received`,
      confirmTitle: "Thank you for your order!",
      confirmHelloHtml: (buyer: string, business: string) => `Hi ${buyer}, we received your print order from <strong>${business}</strong>.`,
      orderRefHtml: (ref: string) => `Order <strong>${ref}</strong>`,
      totalHtml: (total: string) => `<strong>Total: ${total}</strong>`,
      confirmNext: "We'll send it to production at the lab and let you know when it ships, with its tracking number.",
      confirmText: (ref: string, business: string, total: string, link: string) =>
        `We received your order ${ref} from ${business}. Total: ${total}. View it here: ${link}`,
      package: "Package",
      shippedSubject: (ref: string) => `Your order ${ref} is on its way`,
      shippedTitle: "Your order is on its way",
      shippedHtml: (buyer: string, ref: string) => `Hi ${buyer}, your order <strong>${ref}</strong> has left the lab.`,
      shippedText: (ref: string, tracking: string) => `Your order ${ref} is on its way. Tracking: ${tracking}`,
      refunded: "We couldn't produce your order and refunded the full amount. It may take 5 to 10 days to show on your card.",
      reviewing: "We had a problem with your order. We're looking into it and will write to you soon.",
      problemSubject: (ref: string, refunded: boolean) => `Order ${ref}: ${refunded ? "refund" : "we're looking into it"}`,
      problemTitle: "An update on your order",
      hello: (buyer: string) => `Hi ${buyer}, `,
      problemText: (ref: string, msg: string) => `Order ${ref}: ${msg}`,
    },
    sale: {
      subject: (ref: string) => `New print sale (${ref})`,
      title: "You sold prints!",
      bodyHtml: (business: string, gallery: string) => `${business}, you received an order in the gallery <strong>${gallery}</strong>.`,
      amountsHtml: (total: string, earnings: string) => `Total paid: <strong>${total}</strong><br>Your earnings: <strong>${earnings}</strong>`,
      next: "The lab produces it and ships it straight to your client. You receive your earnings when the order ships.",
      button: "View my sales",
      yourGallery: "your gallery",
      text: (ref: string, gallery: string, total: string, earnings: string) =>
        `New sale ${ref} in ${gallery}. Total ${total}, your earnings ${earnings}.`,
    },
  },
);

export function emailText(locale: Locale) {
  return emails[locale];
}
