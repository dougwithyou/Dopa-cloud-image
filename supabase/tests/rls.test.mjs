// Ejecuta la migración en PGlite (Postgres en WASM) con un stub mínimo de
// Supabase (roles anon/authenticated/service_role y auth.uid()) y prueba RLS,
// privilegios por columna, límites del plan y periodo de gracia.
//   npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

// Aplica todas las migraciones recibidas como argumentos, en orden.
const migrations = process.argv.slice(2).map((f) => readFileSync(f, "utf8"));
const db = new PGlite();

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  -- Supabase concede por defecto todo a estos roles en public; lo simulamos para
  -- comprobar que la migración lo revoca correctamente.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);

for (const m of migrations) await db.exec(m);
console.log(`✓ ${migrations.length} migraciones aplicadas sin errores`);

const U = {
  creatorA: "00000000-0000-0000-0000-00000000000a",
  creatorB: "00000000-0000-0000-0000-00000000000b",
  clientA1: "00000000-0000-0000-0000-0000000000a1",
  clientA2: "00000000-0000-0000-0000-0000000000a2",
  stranger: "00000000-0000-0000-0000-0000000000ff",
};
await db.exec(`insert into auth.users (id, email) values
  ('${U.creatorA}','a@x.com'),('${U.creatorB}','b@x.com'),('${U.clientA1}','c1@x.com'),
  ('${U.clientA2}','c2@x.com'),('${U.stranger}','s@x.com');`);

// Datos de prueba (como service role / superusuario)
const GB = 1024 ** 3;
const seed = await db.query(`
  insert into public.creators (user_id, business_name, plan, subscription_status, storage_limit_bytes, client_limit)
  values ('${U.creatorA}','Estudio A','entry','trialing', ${GB}, 2),
         ('${U.creatorB}','Estudio B','medium','active', ${GB}, null)
  returning id, business_name`);
const [cA, cB] = seed.rows.map((r) => r.id);

const cl = await db.query(`
  insert into public.clients (creator_id, name, email, user_id) values
   ('${cA}','Cliente A1','c1@x.com','${U.clientA1}'),
   ('${cA}','Cliente A2','c2@x.com','${U.clientA2}'),
   ('${cB}','Cliente B1','b1@x.com',null)
  returning id`);
const [clA1, clA2, clB1] = cl.rows.map((r) => r.id);

const pr = await db.query(`
  insert into public.projects (creator_id, client_id, title, type, status) values
   ('${cA}','${clA1}','A1 publicado','monthly_content','published'),
   ('${cA}','${clA1}','A1 borrador','photo_session','draft'),
   ('${cA}','${clA2}','A2 publicado','monthly_content','published'),
   ('${cB}','${clB1}','B1 publicado','monthly_content','published')
  returning id`);
const [pA1pub, pA1draft, pA2pub, pB1] = pr.rows.map((r) => r.id);

// Publicaciones: postA1 es un carrusel (foto completa + video pendiente).
const po = await db.query(`
  insert into public.posts (creator_id, project_id, caption, position) values
   ('${cA}','${pA1pub}','Hola',0),
   ('${cA}','${pA1draft}','Borrador',0),
   ('${cB}','${pB1}','De B',0)
  returning id`);
const [postA1, postA1draft, postB] = po.rows.map((r) => r.id);

await db.exec(`
  insert into public.assets (project_id, post_id, creator_id, kind, r2_key, file_name, mime_type, size_bytes, upload_status, position)
  values ('${pA1pub}','${postA1}','${cA}','photo','k1','a.jpg','image/jpeg',100,'complete',0),
         ('${pA1pub}','${postA1}','${cA}','video','k2','b.mp4','video/mp4',200,'pending',1),
         ('${pA1draft}','${postA1draft}','${cA}','photo','k3','c.jpg','image/jpeg',100,'complete',0),
         ('${pB1}','${postB}','${cB}','photo','k4','d.jpg','image/jpeg',100,'complete',0);
`);

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`✓ ${name}`);
  else {
    failures++;
    console.log(`✗ ${name} ${detail}`);
  }
}

async function as(userId, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId ?? ""}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
  }
}
async function fails(sql) {
  try {
    await db.query(sql);
    return null;
  } catch (e) {
    return e.message;
  }
}

// ---------- Aislamiento entre creadores ----------
await as(U.creatorA, async () => {
  const creators = await db.query(`select id from public.creators`);
  check("Creador A solo ve su fila de creators", creators.rows.length === 1 && creators.rows[0].id === cA);
  const clients = await db.query(`select id from public.clients`);
  check("Creador A ve solo sus 2 clientes", clients.rows.length === 2);
  const projects = await db.query(`select id from public.projects`);
  check("Creador A ve solo sus 3 proyectos", projects.rows.length === 3);
  const assets = await db.query(`select id from public.assets`);
  check("Creador A ve sus 3 archivos (incl. pending y borrador)", assets.rows.length === 3);
  const posts = await db.query(`select id from public.posts`);
  check("Creador A ve solo sus 2 publicaciones", posts.rows.length === 2);
  const other = await db.query(`select id from public.assets where creator_id = '${cB}'`);
  check("Creador A no ve assets de B", other.rows.length === 0);

  check(
    "Creador A no puede crear cliente para B",
    (await fails(`insert into public.clients (creator_id, name, email) values ('${cB}','x','x@y.com')`)) !== null,
  );
  check(
    "Creador A no puede crear proyecto con cliente de B (FK compuesta / RLS)",
    (await fails(
      `insert into public.projects (creator_id, client_id, title, type) values ('${cA}','${clB1}','x','photo_session')`,
    )) !== null,
  );
  check(
    "Creador A no puede cambiar su storage_limit_bytes",
    /permission denied/.test(await fails(`update public.creators set storage_limit_bytes = 999999999999`)),
  );
  check(
    "Creador A no puede cambiar subscription_status",
    /permission denied/.test(await fails(`update public.creators set subscription_status = 'active'`)),
  );
  const upd = await db.query(`update public.creators set business_name = 'Nuevo' returning id`);
  check("Creador A sí puede cambiar business_name", upd.rows.length === 1);
  check(
    "Creador A no puede insertar archivos directamente (solo vía reserve)",
    /permission denied/.test(
      await fails(
        `insert into public.assets (project_id, post_id, creator_id, kind, r2_key, file_name, mime_type) values ('${pA1pub}','${postA1}','${cA}','photo','x','x.jpg','image/jpeg')`,
      ),
    ),
  );
  const newPost = await db.query(
    `insert into public.posts (creator_id, project_id, caption) values ('${cA}','${pA1pub}','Copy nuevo') returning id`,
  );
  check("Creador A puede crear una publicación con su copy", newPost.rows.length === 1);
  const edited = await db.query(`update public.posts set caption = 'Editado' where id = '${newPost.rows[0].id}' returning caption`);
  check("Creador A puede editar el copy de su publicación", edited.rows[0]?.caption === "Editado");
  await db.query(`delete from public.posts where id = '${newPost.rows[0].id}'`);
  check(
    "Creador A no puede crear publicaciones en proyectos de B",
    (await fails(`insert into public.posts (creator_id, project_id) values ('${cA}','${pB1}')`)) !== null,
  );
  check(
    "Creador A no puede editar publicaciones de B",
    (await db.query(`update public.posts set caption = 'hack' where id = '${postB}' returning id`)).rows.length === 0,
  );
  check(
    "Creador A no puede marcar upload_status = complete",
    /permission denied/.test(await fails(`update public.assets set upload_status = 'complete'`)),
  );
  check(
    "Creador A no puede cambiar size_bytes",
    /permission denied/.test(await fails(`update public.assets set size_bytes = 0`)),
  );
  check(
    "Creador A no puede fijar user_id de un cliente",
    /permission denied/.test(await fails(`update public.clients set user_id = '${U.stranger}'`)),
  );
  check(
    "Creador A no puede llamar reserve_asset_upload",
    /permission denied/.test(
      await fails(
        `select public.reserve_asset_upload(gen_random_uuid(),'${cA}','${pA1pub}','photo','kx','x.jpg','image/jpeg',1)`,
      ),
    ),
  );
  check("stripe_events inaccesible", /permission denied/.test(await fails(`select * from public.stripe_events`)));
  const used = await db.query(`select public.my_storage_used() as used`);
  check("my_storage_used = 400 (incluye pending)", Number(used.rows[0].used) === 400, JSON.stringify(used.rows));

  // Límite de clientes (plan con 2 clientes)
  check(
    "Trigger client_limit bloquea el 3er cliente",
    /client_limit_exceeded/.test(
      await fails(`insert into public.clients (creator_id, name, email) values ('${cA}','C3','c3@x.com')`),
    ),
  );
});

// ---------- Cliente final ----------
await as(U.clientA1, async () => {
  const projects = await db.query(`select id, title from public.projects`);
  check(
    "Cliente A1 ve solo su proyecto publicado",
    projects.rows.length === 1 && projects.rows[0].id === pA1pub,
    JSON.stringify(projects.rows),
  );
  const assets = await db.query(`select id, kind, upload_status from public.assets`);
  check(
    "Cliente A1 ve solo archivos complete de su proyecto publicado",
    assets.rows.length === 1 && assets.rows[0].upload_status === "complete",
    JSON.stringify(assets.rows),
  );
  const posts = await db.query(`select id, caption from public.posts`);
  check(
    "Cliente A1 ve solo la publicación de su proyecto publicado, con su copy",
    posts.rows.length === 1 && posts.rows[0].id === postA1 && posts.rows[0].caption === "Hola",
    JSON.stringify(posts.rows),
  );
  check(
    "Cliente no puede editar el copy",
    (await db.query(`update public.posts set caption = 'hack' returning id`)).rows.length === 0,
  );
  const creators = await db.query(`select * from public.creators`);
  check("Cliente no lee la tabla creators (datos de facturación)", creators.rows.length === 0);
  const mine = await db.query(`select * from public.my_creators()`);
  check("my_creators() devuelve el nombre de su creador", mine.rows.length === 1 && mine.rows[0].id === cA);
  const clients = await db.query(`select id from public.clients`);
  check("Cliente ve solo su ficha", clients.rows.length === 1 && clients.rows[0].id === clA1);
  check(
    "Cliente no puede modificar proyectos",
    (await db.query(`update public.projects set title = 'hack' returning id`)).rows.length === 0,
  );
  check(
    "Cliente no puede borrar assets",
    (await db.query(`delete from public.assets returning id`)).rows.length === 0,
  );
});

await as(U.clientA2, async () => {
  const projects = await db.query(`select id from public.projects`);
  check("Cliente A2 no ve proyectos de A1", projects.rows.length === 1 && projects.rows[0].id === pA2pub);
});

await as(U.stranger, async () => {
  const counts = await db.query(
    `select (select count(*) from public.creators) c, (select count(*) from public.clients) cl,
            (select count(*) from public.projects) p, (select count(*) from public.assets) a`,
  );
  const r = counts.rows[0];
  check("Usuario ajeno no ve nada", [r.c, r.cl, r.p, r.a].every((n) => Number(n) === 0), JSON.stringify(r));
});

// anon
await db.exec(`set role anon;`);
check("anon no puede leer assets", /permission denied/.test(await fails(`select * from public.assets`)));
await db.exec(`reset role;`);

// ---------- Proyectos sin cliente / agregar cliente al proyecto ----------
await as(U.creatorA, async () => {
  const noClient = await db.query(
    `insert into public.projects (creator_id, title, type) values ('${cA}','Sin cliente','photo_session') returning id, client_id`,
  );
  check("Creador puede crear un proyecto sin cliente", noClient.rows.length === 1 && noClient.rows[0].client_id === null);
  const pNoClient = noClient.rows[0].id;

  const assigned = await db.query(
    `update public.projects set client_id = '${clA2}' where id = '${pNoClient}' returning client_id`,
  );
  check("Creador puede agregar su cliente al proyecto", assigned.rows[0]?.client_id === clA2);
  check(
    "Creador no puede agregar un cliente de otro creador",
    (await fails(`update public.projects set client_id = '${clB1}' where id = '${pNoClient}'`)) !== null,
  );
  await db.query(`update public.projects set client_id = null where id = '${pNoClient}'`);
  const removed = await db.query(`select client_id from public.projects where id = '${pNoClient}'`);
  check("Creador puede quitar el cliente del proyecto", removed.rows[0].client_id === null);
});

// Eliminar un cliente conserva sus proyectos (client_id -> NULL)
{
  const tmp = await db.query(
    `insert into public.clients (creator_id, name, email) values ('${cB}','Temporal','tmp@x.com') returning id`,
  );
  const tmpClient = tmp.rows[0].id;
  const tmpProj = await db.query(
    `insert into public.projects (creator_id, client_id, title, type) values ('${cB}','${tmpClient}','Del temporal','photo_session') returning id`,
  );
  await db.query(`delete from public.clients where id = '${tmpClient}'`);
  const after = await db.query(`select creator_id, client_id from public.projects where id = '${tmpProj.rows[0].id}'`);
  check(
    "Eliminar un cliente conserva sus proyectos sin cliente",
    after.rows.length === 1 && after.rows[0].client_id === null && after.rows[0].creator_id === cB,
  );
}

// ---------- Periodo de gracia ----------
await db.exec(`update public.creators set subscription_status = 'canceled', portal_access_until = now() + interval '14 days' where id = '${cA}'`);
await as(U.clientA1, async () => {
  const p = await db.query(`select id from public.projects`);
  check("Cancelado dentro de gracia: el cliente sigue viendo su portal", p.rows.length === 1);
});
await db.exec(`update public.creators set portal_access_until = now() - interval '1 day' where id = '${cA}'`);
await as(U.clientA1, async () => {
  const p = await db.query(`select id from public.projects`);
  const a = await db.query(`select id from public.assets`);
  check("Gracia vencida: el cliente ya no ve proyectos ni assets", p.rows.length === 0 && a.rows.length === 0);
});
await as(U.creatorA, async () => {
  const p = await db.query(`select id from public.projects`);
  check("Gracia vencida: el creador sigue viendo sus datos", p.rows.length === 4);
});

// ---------- reserve_asset_upload (service role) ----------
await db.exec(`set role service_role;`);
check(
  "reserve: bloquea con suscripción cancelada",
  /subscription_inactive/.test(
    await fails(`select public.reserve_asset_upload(gen_random_uuid(),'${cA}','${pA1pub}','photo','r1','x.jpg','image/jpeg',10)`),
  ),
);
await db.exec(`reset role; update public.creators set subscription_status = 'active', portal_access_until = null where id = '${cA}'; set role service_role;`);
const ok = await db.query(
  `select * from public.reserve_asset_upload(gen_random_uuid(),'${cA}','${pA1pub}','photo','r2','x.jpg','image/jpeg',1000,'${postA1}')`,
);
check(
  "reserve: crea archivo pending al final del carrusel",
  ok.rows[0]?.upload_status === "pending" && ok.rows[0]?.position === 2 && ok.rows[0]?.project_id === pA1pub,
  JSON.stringify(ok.rows[0]),
);
check(
  "reserve: bloquea al superar storage_limit_bytes",
  /storage_limit_exceeded/.test(
    await fails(`select public.reserve_asset_upload(gen_random_uuid(),'${cA}','${pA1pub}','video','r3','x.mp4','video/mp4',${GB})`),
  ),
);
check(
  "reserve: bloquea proyecto de otro creador",
  /project_not_found/.test(
    await fails(`select public.reserve_asset_upload(gen_random_uuid(),'${cA}','${pB1}','photo','r4','x.jpg','image/jpeg',1)`),
  ),
);
check(
  "reserve: bloquea publicación de otro creador",
  /post_not_found/.test(
    await fails(`select public.reserve_asset_upload(gen_random_uuid(),'${cA}','${pA1pub}','photo','r4b','x.jpg','image/jpeg',1,'${postB}')`),
  ),
);
await db.exec(`reset role; update public.creators set client_limit = 1 where id = '${cA}'; set role service_role;`);
check(
  "reserve: bloquea si el creador excede client_limit (tras bajar de plan)",
  /client_limit_exceeded/.test(
    await fails(`select public.reserve_asset_upload(gen_random_uuid(),'${cA}','${pA1pub}','photo','r5','x.jpg','image/jpeg',1)`),
  ),
);
await db.exec(`reset role;`);

// Límite de carrusel (20) — se llena una publicación como superusuario.
await db.exec(`update public.creators set client_limit = null where id = '${cA}'`);
const full = await db.query(`insert into public.posts (creator_id, project_id) values ('${cA}','${pA1pub}') returning id`);
const fullPost = full.rows[0].id;
await db.exec(`
  insert into public.assets (project_id, post_id, creator_id, kind, r2_key, file_name, mime_type, size_bytes, upload_status, position)
  select '${pA1pub}','${fullPost}','${cA}','photo','full-'||g,'f.jpg','image/jpeg',1,'complete',g from generate_series(1,20) g;
`);
await db.exec(`set role service_role;`);
check(
  "reserve: bloquea el elemento 21 de un carrusel",
  /carousel_limit_exceeded/.test(
    await fails(`select public.reserve_asset_upload(gen_random_uuid(),'${cA}','${pA1pub}','photo','r6','x.jpg','image/jpeg',1,'${fullPost}')`),
  ),
);
await db.exec(`reset role;`);

// Integridad: un archivo no puede apuntar a una publicación de otro proyecto.
check(
  "FK: archivo y publicación deben ser del mismo proyecto",
  (await fails(
    `insert into public.assets (project_id, post_id, creator_id, kind, r2_key, file_name, mime_type) values ('${pA2pub}','${postA1}','${cA}','photo','k9','x.jpg','image/jpeg')`,
  )) !== null,
);
check(
  "CHECK: ya no existen archivos de tipo 'copy'",
  (await fails(
    `insert into public.assets (project_id, post_id, creator_id, kind, r2_key, file_name, mime_type) values ('${pA1pub}','${postA1}','${cA}','copy','k10','x','text/plain')`,
  )) !== null,
);
// Borrar la publicación borra sus archivos.
await db.exec(`delete from public.posts where id = '${fullPost}'`);
const back = await db.query(`select count(*)::int n from public.assets where r2_key like 'full-%' and post_id is null`);
check("Eliminar una publicación devuelve sus archivos a la biblioteca", back.rows[0].n === 20, JSON.stringify(back.rows));

// ---------- Biblioteca: subir sin publicación y armar publicaciones ----------
await db.exec(`set role service_role;`);
const lib = await db.query(
  `select * from public.reserve_asset_upload(gen_random_uuid(),'${cA}','${pA1pub}','photo','lib1','l.jpg','image/jpeg',1)`,
);
check("reserve: sube a la biblioteca sin publicación", lib.rows[0]?.post_id === null);
await db.exec(`reset role; update public.assets set upload_status = 'complete' where r2_key = 'lib1';`);
const libId = lib.rows[0].id;

await as(U.creatorA, async () => {
  const p = await db.query(`insert into public.posts (creator_id, project_id, caption) values ('${cA}','${pA1pub}','Nuevo') returning id`);
  const newPost = p.rows[0].id;
  const assigned = await db.query(`update public.assets set post_id = '${newPost}', position = 0 where id = '${libId}' returning post_id`);
  check("Creador puede asignar un archivo de la biblioteca a una publicación", assigned.rows[0]?.post_id === newPost);
  check(
    "No se puede asignar un archivo a una publicación de otro proyecto",
    (await fails(`update public.assets set post_id = '${postB}' where id = '${libId}'`)) !== null,
  );
  await db.query(`update public.assets set post_id = null where id = '${libId}'`);
  check(
    "Trigger: no se pueden asignar más de 20 archivos a un carrusel",
    /carousel_limit_exceeded/.test(
      await fails(`update public.assets set post_id = '${newPost}' where r2_key like 'full-%' or id = '${libId}'`),
    ),
  );
  await db.query(`delete from public.posts where id = '${newPost}'`);
});

// El cliente no ve la biblioteca en un feed; sí en una galería de fotos.
await as(U.clientA1, async () => {
  const r = await db.query(`select id from public.assets where id = '${libId}'`);
  check("Cliente (feed) no ve archivos de la biblioteca sin publicar", r.rows.length === 0);
});
await db.exec(`update public.projects set type = 'photo_session' where id = '${pA1pub}'`);
await as(U.clientA1, async () => {
  const r = await db.query(`select id from public.assets where id = '${libId}'`);
  check("Cliente (galería) ve toda la biblioteca", r.rows.length === 1);
});
await db.exec(`update public.projects set type = 'monthly_content' where id = '${pA1pub}'`);

// ---------- Diseño de galería y escenas ----------
await as(U.creatorA, async () => {
  const d = await db.query(
    `update public.projects set design = '{"style":"editorial"}' where id = '${pA1draft}' returning design`,
  );
  check("Creador puede guardar el diseño de su galería", d.rows[0]?.design?.style === "editorial");
  check(
    "Creador no puede cambiar el diseño de proyectos de B",
    (await db.query(`update public.projects set design = '{}' where id = '${pB1}' returning id`)).rows.length === 0,
  );
});
await as(U.clientA1, async () => {
  check(
    "Cliente no puede cambiar el diseño",
    (await db.query(`update public.projects set design = '{}' returning id`)).rows.length === 0,
  );
});
{
  // Una escena de galería admite más de 20 archivos.
  await db.exec(`update public.projects set type = 'photo_session' where id = '${pA1pub}'`);
  const scene = await db.query(`insert into public.posts (creator_id, project_id, caption) values ('${cA}','${pA1pub}','Ceremonia') returning id`);
  const sceneId = scene.rows[0].id;
  const err = await fails(`update public.assets set post_id = '${sceneId}' where r2_key like 'full-%' or r2_key = 'lib1'`);
  const n = await db.query(`select count(*)::int n from public.assets where post_id = '${sceneId}'`);
  check("Escena de galería admite más de 20 archivos", err === null && n.rows[0].n === 21, err ?? "");
  await db.exec(`delete from public.posts where id = '${sceneId}'; update public.projects set type = 'monthly_content' where id = '${pA1pub}'`);
}

// ---------- Enlace público y contactos ----------
await db.exec(`update public.projects set type = 'photo_session', share_enabled = true, share_token = 'tok-a' where id = '${pA2pub}'`);
await db.exec(`set role service_role;`);
const lead1 = await db.query(`select * from public.register_gallery_lead('tok-a','Ana','Pérez','Ana@Mail.com ', true)`);
const lead2 = await db.query(`select * from public.register_gallery_lead('tok-a','Ana','Pérez','ana@mail.com', false)`);
check("Registro con enlace activo crea el contacto", lead1.rows.length === 1 && lead1.rows[0].project_id === pA2pub);
check("Segunda visita del mismo correo no duplica", lead1.rows[0].lead_id === lead2.rows[0].lead_id);
const leadRow = await db.query(`select email, visits, marketing_consent from public.gallery_leads where id = '${lead1.rows[0].lead_id}'`);
check(
  "Correo normalizado, visitas contadas y consentimiento conservado",
  leadRow.rows[0].email === "ana@mail.com" && leadRow.rows[0].visits === 2 && leadRow.rows[0].marketing_consent === true,
  JSON.stringify(leadRow.rows),
);
check(
  "Token inexistente no registra",
  /share_link_not_found/.test(await fails(`select * from public.register_gallery_lead('nope','A','B','a@b.com', false)`)),
);
await db.exec(`reset role; update public.projects set share_enabled = false where id = '${pA2pub}'; set role service_role;`);
check(
  "Enlace desactivado no registra",
  /share_link_not_found/.test(await fails(`select * from public.register_gallery_lead('tok-a','A','B','a@b.com', false)`)),
);
await db.exec(`reset role;`);
await as(U.creatorA, async () => {
  const r = await db.query(`select id from public.gallery_leads`);
  check("Creador ve sus contactos", r.rows.length === 1);
  check(
    "Creador no puede insertar contactos directamente",
    /permission denied/.test(await fails(`insert into public.gallery_leads (creator_id, first_name, last_name, email) values ('${cA}','x','y','x@y.com')`)),
  );
});
await as(U.creatorB, async () => {
  check("Otro creador no ve esos contactos", (await db.query(`select id from public.gallery_leads`)).rows.length === 0);
});
await as(U.clientA2, async () => {
  check("Cliente no ve contactos", (await db.query(`select id from public.gallery_leads`)).rows.length === 0);
});
await db.exec(`set role anon;`);
check("anon no puede leer contactos", /permission denied/.test(await fails(`select * from public.gallery_leads`)));
check(
  "anon no puede llamar register_gallery_lead",
  /permission denied/.test(await fails(`select * from public.register_gallery_lead('tok-a','A','B','a@b.com', false)`)),
);
await db.exec(`reset role; update public.projects set type = 'monthly_content', share_token = null where id = '${pA2pub}'`);

// ---------- Tienda de impresiones ----------
{
  const prod = await db.query(`
    insert into public.print_products (lab, product_ref, product_name, category_ref, category_name, size_id, size_label, selections, cost_cents)
    values ('whcc','photo-print','Photo Print','prints','Prints','8x10','8×10','{"size":"8x10"}', 450),
           ('whcc','metal-print','Metal Print','wall-art','Wall Art','8x10','8×10','{"size":"8x10"}', 2900)
    returning id`);
  const [prodPrint, prodMetal] = prod.rows.map((r) => r.id);
  const order = await db.query(`
    insert into public.print_orders (reference, creator_id, project_id, buyer_email, buyer_name, shipping_address,
      subtotal_cents, shipping_cents, lab_cost_cents, platform_fee_percent, lab)
    values ('HDC-TEST1','${cA}','${pA2pub}','x@y.com','X Y','{}', 1000, 995, 450, 15, 'whcc')
    returning id`);
  const orderA = order.rows[0].id;
  await db.exec(`
    insert into public.print_order_items (order_id, creator_id, product_id, product_name, size_label, file_name, selections, quantity, unit_price_cents, unit_cost_cents)
    values ('${orderA}','${cA}','${prodPrint}','Photo Print','8×10','a.jpg','{}',1,1000,450)`);

  await as(U.creatorA, async () => {
    check("Creador lee el catálogo", (await db.query(`select id from public.print_products`)).rows.length === 2);
    check(
      "Creador no puede cambiar costos del catálogo",
      /permission denied/.test(await fails(`update public.print_products set cost_cents = 1`)),
    );
    check(
      "Creador no puede insertar productos",
      /permission denied/.test(
        await fails(`insert into public.print_products (lab, product_ref, product_name, category_ref, category_name, size_id, size_label, cost_cents) values ('x','x','x','x','x','x','x',1)`),
      ),
    );
    const own = await db.query(
      `insert into public.creator_product_prices (creator_id, product_id, markup_percent) values ('${cA}','${prodPrint}', 150) returning product_id`,
    );
    check("Creador fija su margen por producto", own.rows.length === 1);
    check(
      "Margen por debajo del mínimo rechazado",
      (await fails(`update public.creator_product_prices set markup_percent = 5 where product_id = '${prodPrint}'`)) !== null,
    );
    check(
      "Creador no puede fijar precios de otro creador",
      (await fails(`insert into public.creator_product_prices (creator_id, product_id) values ('${cB}','${prodMetal}')`)) !== null,
    );
    check("Creador cambia su margen por defecto", (await db.query(`update public.creators set store_markup_percent = 120 returning id`)).rows.length === 1);
    check(
      "Creador no puede fijar su cuenta de cobros",
      /permission denied/.test(await fails(`update public.creators set connect_payouts_enabled = true`)),
    );
    check(
      "Creador puede activar la tienda de su galería",
      (await db.query(`update public.projects set store_enabled = true where id = '${pA2pub}' returning id`)).rows.length === 1,
    );
    check("Creador ve sus pedidos", (await db.query(`select id from public.print_orders`)).rows.length === 1);
    check("Creador ve las líneas de sus pedidos", (await db.query(`select id from public.print_order_items`)).rows.length === 1);
    check(
      "Creador no puede modificar pedidos",
      /permission denied/.test(await fails(`update public.print_orders set creator_earnings_cents = 999999`)),
    );
    check(
      "Creador no puede crear pedidos",
      /permission denied/.test(
        await fails(`insert into public.print_orders (reference, creator_id, buyer_email, buyer_name, shipping_address, subtotal_cents, shipping_cents, lab_cost_cents, platform_fee_percent, lab) values ('x','${cA}','a','b','{}',1,1,1,1,'whcc')`),
      ),
    );
    check("lab_events inaccesible", /permission denied/.test(await fails(`select * from public.lab_events`)));
  });
  await as(U.creatorB, async () => {
    check("Otro creador no ve esos pedidos", (await db.query(`select id from public.print_orders`)).rows.length === 0);
    check("Otro creador no ve esas líneas", (await db.query(`select id from public.print_order_items`)).rows.length === 0);
    check("Otro creador no ve márgenes ajenos", (await db.query(`select * from public.creator_product_prices`)).rows.length === 0);
  });
  await as(U.clientA2, async () => {
    check("Cliente no ve pedidos del creador", (await db.query(`select id from public.print_orders`)).rows.length === 0);
    check("Cliente no ve el catálogo con costos", (await db.query(`select id from public.print_products`)).rows.length === 0);
  });
  await db.exec(`set role anon;`);
  check("anon no lee el catálogo", /permission denied/.test(await fails(`select * from public.print_products`)));
  check("anon no lee pedidos", /permission denied/.test(await fails(`select * from public.print_orders`)));
  await db.exec(`reset role;`);
  await db.exec(`update public.projects set store_enabled = false where id = '${pA2pub}'`);
}

console.log(failures === 0 ? "\nTODAS LAS PRUEBAS PASARON" : `\n${failures} PRUEBAS FALLARON`);
process.exit(failures === 0 ? 0 : 1);
