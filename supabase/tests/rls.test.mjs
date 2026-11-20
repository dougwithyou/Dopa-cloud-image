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

await db.exec(`
  insert into public.assets (project_id, creator_id, kind, r2_key, file_name, mime_type, size_bytes, upload_status)
  values ('${pA1pub}','${cA}','photo','k1','a.jpg','image/jpeg',100,'complete'),
         ('${pA1pub}','${cA}','video','k2','b.mp4','video/mp4',200,'pending'),
         ('${pA1draft}','${cA}','photo','k3','c.jpg','image/jpeg',100,'complete'),
         ('${pB1}','${cB}','photo','k4','d.jpg','image/jpeg',100,'complete');
  insert into public.assets (project_id, creator_id, kind, copy_text, upload_status)
  values ('${pA1pub}','${cA}','copy','Hola','complete');
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
  check("Creador A ve sus 4 assets (incl. pending y borrador)", assets.rows.length === 4);
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
    "Creador A no puede insertar assets de media directamente",
    (await fails(
      `insert into public.assets (project_id, creator_id, kind, copy_text, upload_status) values ('${pA1pub}','${cA}','photo','x','complete')`,
    )) !== null,
  );
  const copy = await db.query(
    `insert into public.assets (project_id, creator_id, kind, copy_text, upload_status) values ('${pA1pub}','${cA}','copy','Texto','complete') returning id`,
  );
  check("Creador A sí puede insertar textos (copy)", copy.rows.length === 1);
  await db.query(`delete from public.assets where id = '${copy.rows[0].id}'`);
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
    "Cliente A1 ve solo assets complete de su proyecto publicado (foto + copy)",
    assets.rows.length === 2 && assets.rows.every((a) => a.upload_status === "complete"),
    JSON.stringify(assets.rows),
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
  `select * from public.reserve_asset_upload(gen_random_uuid(),'${cA}','${pA1pub}','photo','r2','x.jpg','image/jpeg',1000)`,
);
check("reserve: crea asset pending con posición", ok.rows[0]?.upload_status === "pending");
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
await db.exec(`reset role; update public.creators set client_limit = 1 where id = '${cA}'; set role service_role;`);
check(
  "reserve: bloquea si el creador excede client_limit (tras bajar de plan)",
  /client_limit_exceeded/.test(
    await fails(`select public.reserve_asset_upload(gen_random_uuid(),'${cA}','${pA1pub}','photo','r5','x.jpg','image/jpeg',1)`),
  ),
);
await db.exec(`reset role;`);

// Restricción de campos por tipo
check(
  "CHECK: un asset copy no puede tener r2_key",
  (await fails(
    `insert into public.assets (project_id, creator_id, kind, r2_key, copy_text, upload_status) values ('${pA1pub}','${cA}','copy','k9','x','complete')`,
  )) !== null,
);

console.log(failures === 0 ? "\nTODAS LAS PRUEBAS PASARON" : `\n${failures} PRUEBAS FALLARON`);
process.exit(failures === 0 ? 0 : 1);
