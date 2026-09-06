/**
 * Avisa a los buscadores que usan IndexNow (Bing, Yandex, Naver, Seznam; y por Bing,
 * ChatGPT Search y Copilot) de que las URLs públicas cambiaron.
 *
 * Google NO usa IndexNow: ahí sigue haciendo falta pedir indexación en Search Console,
 * con su cuota de unas diez solicitudes diarias por cuenta. Esto no la sustituye; cubre
 * el resto, donde no hay cuota y la respuesta llega en minutos.
 *
 * Se ejecuta a mano después de un despliegue con URLs nuevas:
 *
 *     npm run seo:indexnow
 *
 * Las URLs se leen del sitemap ya publicado, que en NexaLab es dinámico
 * (app/sitemap.ts, force-dynamic porque NEXT_PUBLIC_APP_URL solo existe en la etapa
 * runner): pedirlo por HTTP es la única forma de ver lo mismo que ve un buscador.
 * La clave es pública por diseño — el protocolo comprueba que /<clave>.txt exista en
 * el dominio, y eso demuestra que quien avisa controla el sitio.
 */
const HOST = 'nexalaboratories.com';
const KEY = '516be499357c5afa53b85a48cec79253';

const keyCheck = await fetch(`https://${HOST}/${KEY}.txt`);
if (!keyCheck.ok || (await keyCheck.text()).trim() !== KEY) {
  console.error(`[indexnow] https://${HOST}/${KEY}.txt no responde con la clave: ¿ya se desplegó este build?`);
  process.exit(1);
}

const sitemap = await fetch(`https://${HOST}/sitemap.xml`).then((r) => r.text());
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => m[1])
  .filter((url) => url.startsWith(`https://${HOST}`));

if (!urlList.length) {
  console.error('[indexnow] el sitemap no devolvió ninguna URL del dominio');
  process.exit(1);
}

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList }),
});

console.log(`[indexnow] ${urlList.length} URLs enviadas → HTTP ${response.status} ${response.statusText}`);
if (response.status >= 400) process.exit(1);
