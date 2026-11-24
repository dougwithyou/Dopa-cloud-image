# Hi Dopa Cloud

SaaS multi-tenant para que fotógrafos, videógrafos y agencias pequeñas entreguen contenido para redes sociales a sus clientes en un portal privado con estilo de feed de Instagram. Desde el portal, el cliente descarga fotos y videos y copia los textos con un clic.

**Stack:** Next.js 16 (App Router, TypeScript) · Supabase (Auth + Postgres con RLS) · Cloudflare R2 · Stripe Billing · Resend · Vercel.

---

## Índice

1. [Arquitectura](#arquitectura)
2. [Planes](#planes)
3. [Desarrollo local](#desarrollo-local)
4. [Supabase](#1-supabase)
5. [Cloudflare R2](#2-cloudflare-r2)
6. [Stripe (modo test)](#3-stripe-modo-test)
7. [Resend (correo)](#4-resend-correo)
8. [Despliegue en Vercel](#5-despliegue-en-vercel)
9. [Tienda de impresiones (WHCC)](#6-tienda-de-impresiones-whcc)
10. [Paso a producción (modo live)](#paso-a-producción-modo-live)
11. [Seguridad](#seguridad)
12. [Decisiones de diseño](#decisiones-de-diseño)

---

## Arquitectura

```
src/
  proxy.ts                         Refresco de sesión de Supabase y protección de rutas (antes middleware.ts)
  lib/
    plans.ts                       Planes, precios y límites (fuente única de verdad)
    r2.ts                          Cliente S3 para R2: multipart, URLs firmadas, borrado (solo servidor)
    upload-rules.ts                Tipos MIME permitidos, tamaños máximos y tamaño de parte
    limits.ts                      Uso actual y comprobación de límites del plan
    subscription.ts                Reglas de estado: puede subir, días de prueba, periodo de gracia
    stripe.ts / billing.ts         Cliente Stripe, Checkout, Customer Portal y sincronización
    email.ts / invitations.ts      Correos con Resend y enlaces de acceso para clientes
    auth.ts                        Sesión, creador actual y redirecciones
    supabase/{server,admin,client} Clientes de Supabase (sesión con RLS / service role / navegador)
  app/
    (auth)/                        Login, registro, recuperar y restablecer contraseña
    auth/confirm                   Destino de los enlaces de correo (token_hash o code)
    onboarding/                    Nombre del negocio + plan → Stripe Checkout
    dashboard/                     Panel del creador: resumen, clientes, proyectos, subida, suscripción
    portal/                        Portal del cliente: proyectos y feed de publicaciones (carruseles deslizables)
    api/posts                      Crear publicación (antes de subir) y borrar publicaciones vacías
    acceso/                        El cliente crea su contraseña y queda vinculado (enlace del correo)
    api/uploads/...                Iniciar, firmar partes, completar y abortar subidas multipart
    api/assets/[id]/download       Descarga mediante redirección a una URL firmada de R2
    api/stripe/{checkout,portal,webhook}
    api/cron/cleanup-uploads       Limpieza diaria de subidas abandonadas
supabase/
  migrations/20261116000000_init.sql   Esquema, índices, funciones y políticas RLS
  tests/rls.test.mjs                   Pruebas de RLS sobre Postgres embebido (npm run test:db)
scripts/stripe-setup.ts                Crea productos, precios y configuración del portal en Stripe
```

### Flujo de subida

```
Navegador ──POST /api/uploads {projectId, fileName, mimeType, size}──▶ Next.js
                                   valida MIME + extensión + tamaño máx.
                                   comprueba suscripción, almacenamiento y clientes
                                   reserve_asset_upload() en Postgres (atómico, con bloqueo)
                                   CreateMultipartUpload en R2
         ◀── {assetId, partSize, partCount} ──
Navegador ──POST /api/uploads/:id/parts {partNumbers}──▶ URLs PUT firmadas (1 h)
Navegador ══PUT de cada parte directo a R2 (4 en paralelo, con reintentos)══▶ R2
Navegador ──POST /api/uploads/:id/complete {parts[]}──▶ CompleteMultipartUpload
                                   HeadObject: el tamaño real no puede superar el declarado
                                   upload_status = 'complete'
```

Los bytes nunca pasan por Vercel, así que no aplica el límite de 4,5 MB de cuerpo y se pueden subir videos de varios GB. Si algo falla, el navegador llama a `DELETE /api/uploads/:id`. Las subidas que quedan a medias más de 24 h las limpia el cron diario.

### Estados de suscripción

| Estado de Stripe | `subscription_status` | Subidas | Portal de clientes |
|---|---|---|---|
| trialing | trialing | ✅ | ✅ |
| active | active | ✅ | ✅ |
| past_due, unpaid, paused | past_due | ❌ | ✅ durante `PORTAL_GRACE_PERIOD_DAYS` (14 por defecto) |
| canceled, incomplete_expired | canceled | ❌ | ✅ durante el periodo de gracia |
| incomplete | incomplete | ❌ | ✅ durante el periodo de gracia |

El periodo de gracia se guarda en `creators.portal_access_until` cuando la suscripción deja de estar al día, y lo aplica **RLS** (`creator_portal_open()`), no solo la interfaz.

## Planes

Se definen en `src/lib/plans.ts`. Todos incluyen 30 días de prueba con tarjeta obligatoria. No hay plan gratuito permanente.

| Plan | Precio | Almacenamiento | Clientes |
|---|---|---|---|
| Entry | $4.99/mes | 25 GB | 3 |
| Medium | $17.99/mes | 250 GB | Ilimitados |
| High | $49.99/mes | 1 TB | Ilimitados |

Para cambiar un precio, edita `plans.ts` y vuelve a ejecutar `npm run stripe:setup`. El script crea un precio nuevo, le transfiere el `lookup_key` y archiva el anterior. Las suscripciones existentes conservan el precio que tenían.

---

## Desarrollo local

Requisitos: Node 22 o superior, una cuenta de Supabase, una de Cloudflare (R2), una de Stripe en modo test y una de Resend.

```bash
npm install
cp .env.example .env.local     # complétalo siguiendo las secciones 1–4
npm run test:db                # pruebas del esquema y RLS (no necesitan Supabase)
npm run dev
```

Para recibir webhooks en local:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook \
  --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.trial_will_end,invoice.payment_failed
# Copia el whsec_... que imprime a STRIPE_WEBHOOK_SECRET
```

---

## 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. **Aplica la migración** después de revisarla (`supabase/migrations/20261116000000_init.sql`). Puedes hacerlo de dos formas:
   - Con la CLI: `npx supabase link --project-ref <ref>` y después `npx supabase db push`.
   - Pegando el archivo en el *SQL Editor* del dashboard.
3. Copia **Project URL**, **anon key** y **service_role key** (*Settings → API*) a `.env.local`.
4. En *Authentication → URL Configuration*:
   - **Site URL:** `https://tu-dominio` (en local: `http://localhost:3000`).
   - **Redirect URLs:** `http://localhost:3000/**` y `https://tu-dominio/**`.
5. En *Authentication → Providers → Email*: deja activado **Confirm email**.
6. En *Authentication → Email Templates*, cambia los enlaces para que usen `token_hash`. Así funcionan aunque el usuario los abra en otro dispositivo:
   - **Confirm signup:**
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`
   - **Reset password:**
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
   - Los correos de acceso de clientes **no** usan la plantilla de Supabase. Se generan con `auth.admin.generateLink` y se envían con Resend.
7. *Authentication → SMTP Settings*: activa **Custom SMTP** con Resend para que los correos de Auth salgan de tu dominio:
   host `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña = tu `RESEND_API_KEY`, remitente `hola@cloud.hidopastudio.com`.
8. *Authentication → Providers → Email → Email OTP Expiration*: súbelo a `86400` (24 h). Ese valor es el que anuncia el correo de acceso del cliente.

> Si cambias el esquema, regenera los tipos con `npx supabase gen types typescript --project-id <ref> > src/types/database.ts`.

## 2. Cloudflare R2

1. *R2 → Create bucket* → por ejemplo `hidopa-cloud-media`. Déjalo **privado** (sin dominio público). Todo se sirve con URLs firmadas.
2. *R2 → Manage R2 API Tokens → Create API token*: permiso **Object Read & Write**, limitado a ese bucket. Copia `Access Key ID`, `Secret Access Key` y el `Account ID`.
3. *Bucket → Settings → CORS policy*. Es imprescindible para subir desde el navegador y leer el `ETag`:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://tu-dominio"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

4. Opcional: crea una *Object lifecycle rule* que aborte los multipart incompletos tras 1 día, como respaldo del cron.

## 3. Stripe (modo test)

> Todo esto se hace con claves **sk_test_**. La app y el script rechazan claves live sin confirmación explícita.

1. Copia la *Secret key* de test a `STRIPE_SECRET_KEY`.
2. Crea productos, precios y la configuración del Customer Portal:

   ```bash
   npm run stripe:setup
   ```

   El script es idempotente y crea:
   - Los productos `hidopa_cloud_entry`, `hidopa_cloud_medium` y `hidopa_cloud_high`.
   - Precios mensuales con `lookup_key` (`hidopa_*_monthly_v1`).
   - Una configuración del portal que permite cambiar entre los 3 planes (con prorrateo), actualizar la tarjeta, ver facturas y cancelar al final del periodo.

   Al terminar imprime `STRIPE_PRICE_*` y `STRIPE_PORTAL_CONFIGURATION_ID`. Cópialos a tu `.env`.
3. **Webhook en producción:** *Developers → Webhooks → Add endpoint* → `https://tu-dominio/api/stripe/webhook` con estos eventos:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `invoice.payment_failed`.
   Copia el *Signing secret* a `STRIPE_WEBHOOK_SECRET`.
4. *Settings → Billing → Subscriptions and emails*:
   - Activa **Retry failed payments** (Smart Retries).
   - Tras los reintentos fallidos, elige **cancel the subscription** o **mark as unpaid**. Ambos casos están cubiertos.
   - La app ya envía su propio recordatorio de fin de prueba y su aviso de pago fallido. Si no quieres que el cliente reciba también los correos de Stripe, desactiva los equivalentes de Stripe.

### Cómo funciona

- **Checkout** (`createCheckoutSession`): `mode: subscription`, `trial_period_days: 30`, `payment_method_collection: 'always'` y `client_reference_id = creators.id`. Quien ya tuvo una suscripción no recibe otra prueba.
- **Success URL** → `/api/stripe/checkout/success`. Sincroniza la suscripción al momento para que el panel no dependa de que el webhook llegue antes que el usuario.
- **Webhook** (`/api/stripe/webhook`):
  1. Verifica la firma con el cuerpo en crudo.
  2. Para la idempotencia, *reclama* el evento insertándolo en `stripe_events`:
     - Si ya existe con `processed_at`, responde 200 y lo salta.
     - Si otro intento lo está procesando, responde 409 y Stripe reintenta.
     - Si el proceso falla, borra el reclamo y responde 500 para que el reintento lo procese.
  3. Siempre vuelve a leer la suscripción desde la API de Stripe, porque los eventos pueden llegar desordenados.
- **`customer.subscription.trial_will_end`**: Stripe lo envía 3 días antes del fin de la prueba. La app manda el recordatorio con la fecha y el importe del cobro.
- **`invoice.payment_failed`**: pasa la suscripción a `past_due`, bloquea las subidas y avisa al creador.

Para probar los flujos usa la tarjeta `4242 4242 4242 4242`. Para adelantar el fin de una prueba, usa **Test clocks** de Stripe o `stripe trigger customer.subscription.trial_will_end`.

## 4. Resend (correo)

1. En [resend.com](https://resend.com) → *Domains → Add domain* → `cloud.hidopastudio.com`.
2. Añade en el DNS de `hidopastudio.com` los registros que indica Resend (MX y TXT/SPF para `send.cloud`, y el DKIM `resend._domainkey.cloud`). Espera a que el dominio aparezca como **Verified**.
3. Recomendado: un registro DMARC `_dmarc.cloud.hidopastudio.com` con `v=DMARC1; p=none;` para empezar.
4. *API Keys → Create* (permiso *Sending access*, limitado al dominio) → `RESEND_API_KEY`.
5. `EMAIL_FROM="Hi Dopa Cloud <hola@cloud.hidopastudio.com>"`.

Correos que envía la app:

| Correo | Cuándo | Reply-To |
|---|---|---|
| Acceso de cliente | Se publica un proyecto con un cliente sin acceso, se agrega un cliente a un proyecto ya publicado, o el creador pulsa "Reenviar acceso" | Correo del creador |
| Fin de prueba | `trial_will_end`, unos 3 días antes del cobro | — |
| Pago fallido | `invoice.payment_failed` | — |
| Confirmación y recuperación | Supabase Auth vía SMTP de Resend | — |

## 5. Despliegue en Vercel

1. Sube el repo a GitHub y en Vercel elige *Add New → Project → Import*.
2. El framework se detecta solo (Next.js). No hace falta ningún comando especial.
3. En *Settings → Environment Variables*, añade todas las variables de `.env.example` para *Production* (y *Preview* si quieres):
   - `NEXT_PUBLIC_APP_URL=https://tu-dominio`
   - `CRON_SECRET`: genera uno con `openssl rand -hex 32`. Vercel lo envía al cron como `Authorization: Bearer`.
   - `SHARE_SECRET`: genera uno con `openssl rand -base64 32`. Firma el acceso de los visitantes de galerías compartidas.
4. *Deploy*.
5. *Settings → Domains*: añade tu dominio (por ejemplo `cloud.hidopastudio.com` o `app.hidopastudio.com`).
6. Actualiza con el dominio final:
   - Supabase: Site URL y Redirect URLs.
   - R2: `AllowedOrigins` del CORS.
   - Stripe: endpoint del webhook.
   - `NEXT_PUBLIC_APP_URL`, y vuelve a desplegar.
7. Los crons de `vercel.json` (`/api/cron/cleanup-uploads` y `/api/cron/print-store`, diarios) se activan solo en producción.

### Checklist después del despliegue

- [ ] Registro → correo de confirmación → onboarding → Checkout (tarjeta 4242) → panel con «30 días de prueba».
- [ ] Crear un proyecto → agregarle un cliente → publicarlo → al cliente le llega el correo desde `hola@cloud.hidopastudio.com` → crea su contraseña → `/portal`.
- [ ] Subir una foto y un video de más de 300 MB, publicar el proyecto y verlo en el portal del cliente. Probar descarga y copia de texto.
- [ ] En *Developers → Webhooks* de Stripe, todos los eventos responden 200.
- [ ] Con un segundo creador, comprobar que no ve nada del primero.

## 6. Tienda de impresiones (WHCC)

Los clientes compran impresiones y cuadros desde la galería; el laboratorio
[WHCC](https://www.whcc.com/developer/docs/) los produce y los envía directo a
su casa (EE.UU. continental, caja sin marcas). Hi Dopa Cloud tiene **una sola
cuenta mayorista** en WHCC: los fotógrafos no necesitan cuenta en el laboratorio.

**El dinero**

| | |
| --- | --- |
| Precio al cliente | costo WHCC × (1 + margen del fotógrafo), redondeado a .99 |
| Envío | se cobra al costo: $7.95 por paquete ($9.95 de noviembre a mediados de enero); cada categoría se envía aparte |
| Cobro | Stripe Checkout de la plataforma (opcional: Stripe Tax con `STRIPE_TAX_ENABLED=true`) |
| Laboratorio | WHCC cobra el costo a la tarjeta de la cuenta de WHCC de la plataforma |
| Fotógrafo | margen − comisión de la plataforma (`storeFeePercent` del plan: Entry 15 %, Medium 10 %, High 0 %) − comisión de Stripe. Se le transfiere (Stripe Connect Express) **cuando el pedido se envía** |

**Flujo de un pedido:** carrito (navegador) → `/api/store/checkout` (precios en
el servidor, pedido `pending_payment`) → Stripe → webhook
`checkout.session.completed` → `paid` → se arma cada producto en WHCC con la
foto original (URL firmada de R2, 7 días), se espera a que WHCC la procese y se
envía (`Idempotency-Key` = id del pedido) → `in_production` → evento
`order.shipped` de WHCC → `shipped`, correo con seguimiento y transferencia al
fotógrafo. Si WHCC rechaza o cancela, se reembolsa automáticamente.

**Configuración (una vez)**

1. Crea la cuenta en [whcc.com](https://www.whcc.com/account/signup) con la dirección y la tarjeta del negocio.
2. En *Connected Accounts → API access*, crea una **llave de prueba** y ponla en Vercel como `WHCC_API_KEY` (con `WHCC_ENV=test`).
3. Genera `WHCC_WEBHOOK_SECRET` (`openssl rand -base64 32`), ponlo en Vercel y crea la suscripción de eventos:

   ```bash
   WHCC_API_KEY=… WHCC_WEBHOOK_SECRET=… NEXT_PUBLIC_APP_URL=https://tu-dominio npm run whcc:subscribe
   ```

4. En Stripe: activa **Connect** (cuentas Express) y, si cobrarás impuestos, **Tax**. Agrega al webhook de Stripe el evento `checkout.session.expired`.
5. El catálogo y los costos se sincronizan a diario (`/api/cron/print-store`); la primera vez se cargan al abrir *Tienda* en el panel.
6. Cada fotógrafo: *Tienda → Conectar cobros*, ajusta su margen y activa la tienda en cada galería.

**Pasar a pedidos reales:** pide *Live access* en WHCC (lo revisan), crea la
llave live y pon `WHCC_API_KEY` (live), `WHCC_ENV=live` y `WHCC_ALLOW_LIVE=true`;
vuelve a ejecutar `whcc:subscribe` con la llave live. Envía tu certificado de
reventa a billing@whcc.com para que WHCC no cobre impuesto sobre el costo.

**Catálogo curado** (`src/lib/print-offerings.ts`): impresiones en papel
fotográfico (4×6 a 20×30), canvas gallery wrap (8×10 a 24×36), photobooks
(tapa dura, tapa blanda y layflat) y tarjetas 5×7 planas o dobladas (mínimo 25).
Para cambiar lo que se vende, edita esa lista; el cron la sincroniza.

**Photobooks y tarjetas** se diseñan en el editor de WHCC: el botón *Tienda*
de la galería crea el producto con las fotos de la galería en la bandeja
(`/api/store/editor`), el cliente lo diseña y vuelve a
`/tienda/{galería}/editor-listo` (token de un solo uso), donde se comprueba con
`calculate` que esté terminado antes de pasar al carrito. Al pagar se recotiza
con WHCC (páginas, cantidad y envío por pieza).

## Paso a producción (modo live)

**No se crea nada en Stripe live sin tu confirmación.** Cuando decidas lanzar:

1. Activa tu cuenta de Stripe (datos del negocio y cuenta bancaria).
2. Ejecuta el script con tu clave live. Exige doble confirmación:

   ```bash
   STRIPE_SECRET_KEY=sk_live_... STRIPE_CONFIRM_LIVE=yes npm run stripe:setup -- --live
   ```

3. Crea el webhook live con los mismos eventos.
4. En Vercel (*Production*), pon `STRIPE_SECRET_KEY=sk_live_...`, el nuevo `STRIPE_WEBHOOK_SECRET`, los `STRIPE_PRICE_*` live y **`STRIPE_ALLOW_LIVE=true`**. Sin esta última, la app se niega a usar una clave live.

---

## Seguridad

- **RLS en todas las tablas.** El creador solo accede a filas cuyo `creator_id` sea el suyo (`current_creator_id()`). El cliente solo lee proyectos **publicados** de su ficha (`clients.user_id = auth.uid()`) y sus assets completos, mientras el portal esté abierto.
- **Privilegios por columna.** El rol `authenticated` no puede escribir plan, límites, estado de suscripción, `size_bytes`, `upload_status` ni `clients.user_id`. Esos campos solo los toca el servidor con la service role, tras verificar la operación.
- **Integridad entre tenants en la base.** Las FKs compuestas `(creator_id, client_id)` y `(creator_id, project_id)` impiden que un proyecto o asset apunte a datos de otro creador.
- **Límites atómicos.** `reserve_asset_upload()` bloquea la fila del creador y comprueba almacenamiento y número de clientes, así que no hay condiciones de carrera entre subidas paralelas. El trigger `enforce_client_limit` hace lo mismo con los clientes.
- **R2.** Las credenciales solo existen en el servidor. El bucket es privado. Las URLs de subida duran 1 h y las de lectura entre 5 y 60 min. El MIME, la extensión y el tamaño se validan antes de firmar, y el tamaño real se comprueba al completar.
- **Stripe.** Firma del webhook verificada, idempotencia con `stripe_events` y protección contra claves live sin confirmación.
- `npm run test:db` ejecuta 39 comprobaciones de aislamiento, privilegios, límites y periodo de gracia sobre la migración real.

## Decisiones de diseño

Cambios o añadidos respecto a la especificación original:

- **Clave en R2:** `creators/{creator_id}/projects/{project_id}/{photos|videos}/{asset_id}-{file_name}`. El cliente **no** forma parte de la ruta: un proyecto se crea sin cliente y lo recibe (o lo cambia) después sin mover archivos. Se añade el id del asset delante del nombre para que dos archivos con el mismo nombre no se sobrescriban. `file_name` conserva el nombre original, que es el que se usa al descargar.
- **Proyecto primero, cliente después** (migración `20261120000000_projects_optional_client.sql`). `projects.client_id` es opcional. El creador crea el proyecto, sube el contenido y, dentro del proyecto, pulsa **Agregar cliente** (uno existente o uno nuevo con nombre y correo). El cliente recibe su enlace de acceso cuando el proyecto se publica. Si se elimina un cliente, sus proyectos y archivos se conservan sin cliente asignado.
- **`projects.status`:** `draft | published | archived`. El cliente solo ve proyectos `published`, así el creador puede preparar el contenido antes de entregarlo.
- **Columnas extra:**
  - `creators.portal_access_until` (fin del periodo de gracia) y `updated_at`.
  - `clients.invited_at` (cuándo se envió el acceso) y `accepted_at`.
  - `assets.r2_upload_id` y `completed_at`.
  - `stripe_events.received_at`.
- **Dos plantillas para el cliente** (según el tipo de proyecto, se puede cambiar en cualquier momento):
  - **Feed de Instagram** (`monthly_content`): cabecera tipo perfil y cuadrícula 3 columnas con íconos de carrusel/video. Al tocar una publicación, en computadora se abre como Instagram web (media a la izquierda, copy y botones a la derecha, flechas y teclado para navegar); en el teléfono se abre el feed vertical desde esa publicación.
  - **Galería de fotos** (`photo_session`), estilo Pixieset: portada a pantalla completa, mosaico que respeta la proporción de cada foto (ordenado de izquierda a derecha) y visor a pantalla completa con flechas, teclado, deslizar y descarga.
- **Editor de diseño de la galería** (`/design/[projectId]`, migración `20261123000000_gallery_design.sql`): vista previa en vivo y panel con estilo (Airy, Folk, Editorial), paleta (Marfil, Blanco, Arena, Salvia, Noche), tipografía (Sans *Jost* / Serif *Cormorant Garamond*, cargadas desde Google Fonts en el navegador), portada (pantalla completa, dividida o con marco), foto de portada, tamaño de las fotos y espaciado. Se guarda en `projects.design` (jsonb, validado con zod en `src/lib/gallery-design.ts`).
- **Escenas:** en proyectos de galería, las publicaciones funcionan como escenas (secciones con título, sin el límite de 20). Se crean desde la biblioteca; el cliente las ve como pestañas y títulos, y las fotos sin escena aparecen al final como “Más fotos”. El ZIP se organiza por escena.
- **Galería compartida por enlace y contactos** (migración `20261124000000_share_links_and_leads.sql`): en un proyecto de galería, “Compartir por enlace” genera `/g/{token}` (token aleatorio de 128 bits, se puede desactivar o regenerar). Quien entra deja nombre, apellido y correo, con una casilla opcional de consentimiento de marketing; `register_gallery_lead()` lo guarda en `gallery_leads` (sin duplicar por correo y galería, cuenta visitas) y el navegador recibe una cookie firmada con `SHARE_SECRET` (HMAC, 30 días). Las descargas de visitantes pasan por `/api/share/{token}/download/{assetId}`. En **Contactos** el creador ve la lista y exporta CSV (todos o solo quienes aceptaron marketing).
- **Descargar todo:** ZIP generado en el navegador con [`client-zip`](https://github.com/Touffy/client-zip) a partir de las URLs firmadas de R2 (no pasa por Vercel). En Chrome/Edge se escribe directo a disco; en el resto se arma en memoria y, si supera 1,5 GB, se descargan los archivos uno a uno. En el feed, el ZIP va organizado por publicación e incluye el copy de cada una en `copy.txt`.
- **Guardar en Fotos (iPhone/Android):** en el teléfono, una descarga normal va a la app Archivos. El botón “Guardar en Fotos” descarga el archivo en el navegador y abre el menú de compartir del sistema (Web Share API), que ofrece “Guardar imagen/video” o “Guardar N imágenes” para un carrusel. Solo aparece en móviles con soporte y para archivos de hasta 500 MB en total.
- **Vista previa:** botón en cada proyecto (`/preview/[projectId]`) que muestra exactamente la plantilla del cliente, aunque el proyecto esté en borrador o sin cliente.
- **Biblioteca y publicaciones** (migraciones `20261121000000_posts_and_carousels.sql` y `20261122000000_media_library.sql`). El creador sube todo el material a la **biblioteca del proyecto** (`assets.post_id = NULL`). Después selecciona archivos —el orden de selección es el orden del carrusel— y crea una **publicación** (`posts`, con un copy): 1 archivo = foto o video individual, de 2 a 20 = carrusel (el límite lo aplica el trigger `enforce_carousel_limit`). También puede añadir archivos a una publicación existente, reordenarlos, quitarlos (vuelven a la biblioteca) o eliminar la publicación (sus archivos vuelven a la biblioteca). En plantilla **Galería de fotos** el cliente ve toda la biblioteca; en **Feed de Instagram** solo ve los archivos que están en publicaciones (lo aplica RLS).
- **Tamaños máximos:** fotos 50 MB y videos 5 GB por defecto. Se configuran con `MAX_PHOTO_UPLOAD_MB` y `MAX_VIDEO_UPLOAD_MB`.
- **1 GB = 1024³ bytes** en los límites de almacenamiento.
