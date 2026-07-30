# Casita — catálogo de artículos personales

Abrí `index.html` en un navegador para ver el catálogo.

## Cómo usarlo

1. Tocá **Administrar** arriba a la derecha.
2. Creá un formulario en [Formspree](https://formspree.io), verificá tu email y copiá su endpoint (por ejemplo: `https://formspree.io/f/tu_form_id`).
3. En **Configuración**, pegá ese endpoint de Formspree.
4. En **Artículos**, agregá, editá o eliminá publicaciones. Cada una necesita una URL de foto.
5. Compartí el enlace donde publiques esta carpeta (por ejemplo, Netlify, Vercel o GitHub Pages).

Cada botón de compra abre un formulario con el artículo y precio ya incluidos. Formspree te envía esa consulta al email que configures en su panel.

Los artículos y la configuración quedan guardados en el navegador mientras esta versión es local. Para que el mismo catálogo y las publicaciones sean compartidos por todos los dispositivos, el próximo paso es conectarlo a una base de datos y una pantalla de acceso privada.

## Perfiles (múltiples ventas de garage)

La app soporta varias ventas de garage independientes ("perfiles"), cada una con su propia URL, sus propios artículos y su propio botón de WhatsApp. Los productos de un perfil nunca se mezclan con los de otro.

- Cada perfil vive en `casita.com/<slug>` (el slug se elige a mano al crearlo).
- El alta de perfiles es manual, sin formulario público: entrás a `/admin.html` con la contraseña maestra (`ADMIN_PASSWORD`), cargás nombre + email + celular (con país y código de área) + el slug elegido, y el panel te muestra una contraseña generada **una sola vez** — se la pasás al dueño del perfil (por WhatsApp, por ejemplo) para que entre a administrar sus propios artículos desde `/<slug>` → **Administrar**.
- El botón de WhatsApp de cada perfil usa el celular cargado en su alta, no un número fijo.
- La variable de entorno `ROOT_SLUG` define qué perfil se muestra en `/` (la raíz del dominio) — normalmente el tuyo propio.
- Si ya tenías artículos cargados de antes de esta versión (single-tenant), corré una única vez `scripts/migrate-multitenant.js` (ver comentarios arriba del archivo para las variables de entorno que necesita) para envolver esos datos en tu propio perfil sin perderlos.
