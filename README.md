# CRM Carpa Diem

CRM web de CARPADIEM IBÉRICA S.L. para gestionar leads, presupuestos (con la plantilla Word en SharePoint), eventos y planificación. Multiusuario y en tiempo real.

> Las especificaciones completas están en [`CLAUDE.md`](CLAUDE.md).

## Estado

| Fase | Qué | Estado |
|---|---|---|
| 0 | Cuentas, registro en Entra ID, repositorio | Hecha |
| 1 | Diseño de Inicio, Ficha de presupuesto y Planificación | Hecha |
| 2 | Login, modelo de datos, tiempo real, roles, historial y papelera | Hecha |
| 3–9 | Funcionalidad, Word/SharePoint, eventos, móvil, copias, demo, producción | Pendiente |

## Piezas

| Pieza | Servicio |
|---|---|
| Código | GitHub (repositorio privado `LuisCreus/crm-carpadiem`) |
| App web | Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui |
| Base de datos y tiempo real | Supabase, proyecto `dvfqrleonfkyibsrfzut` (región París) |
| Login | Microsoft Entra ID (registro "CRM Carpa Diem") a través de Supabase Auth |
| Documentos | SharePoint con Microsoft Graph (Fase 4) |
| Hosting de la demo | Vercel (equipo `carpa-diem`) |

## Arrancar el proyecto en el ordenador

Hace falta Node.js 24 y Git (ya instalados).

```bash
npm install          # solo la primera vez o si cambian las dependencias
npm run dev          # abre http://localhost:3000
```

Antes, crea `.env.local` copiando `.env.example` y rellena las claves.

Otros comandos:

```bash
npm test             # tests (numeración, historial, papelera, formatos…)
npm run build        # compila como en producción
npm run db:push      # sube las migraciones nuevas a Supabase (pide confirmación)
```

> Las tres primeras migraciones se aplicaron pegándolas en el *SQL Editor* de Supabase. Antes de usar `db:push` por primera vez hay que enlazar el proyecto (`npx.cmd supabase login` y `npx.cmd supabase link --project-ref dvfqrleonfkyibsrfzut`) y marcarlas como aplicadas con `npx.cmd supabase migration repair --status applied 20261028170000 20261028170100 20261028170200`.

```bash
# (en PowerShell usa npx.cmd y npm.cmd: Windows bloquea npx.ps1)
```

## Qué hace cada parte

```
src/
  app/
    login/               Pantalla de entrada ("Entrar con Microsoft")
    auth/callback/       Vuelta desde Microsoft tras iniciar sesión
    auth/salir/          Cerrar sesión
    (app)/               Todo lo que necesita sesión iniciada
      layout.tsx         Menú lateral (ordenador) y pestañas de abajo (móvil)
      page.tsx           Inicio
      intermediarios/    Primera pantalla real: lista en tiempo real, historial y papelera
      ajustes/           Solo admin: usuarios, dominios permitidos y numeración por año
      papelera/          Solo admin: restaurar o borrar definitivamente
      mas/               Pestaña "Más" del móvil
  components/            Piezas de interfaz (shadcn/ui en components/ui)
  hooks/use-tabla-en-vivo.ts   Carga datos y los recarga al instante cuando alguien cambia algo
  lib/
    auth.ts              Usuario actual y comprobación de administrador
    formato.ts           Importes "13.246 €" y fechas "dd/mm/aaaa"
    supabase/            Conexión con Supabase (navegador, servidor y proxy de sesión)
  proxy.ts               Refresca la sesión y manda a /login a quien no la tenga

supabase/
  migrations/            El modelo de datos, en SQL (se aplica con `npm run db:push`)
    …_base.sql           Ajustes, usuarios, listas editables e historial de cambios
    …_negocio.sql        Clientes, leads, presupuestos, numeración, cobros, eventos, inventario
    …_permisos.sql       Quién puede ver y cambiar qué, papelera y tiempo real
  tests/                 Tests de la base de datos sobre un Postgres en memoria
```

## Cómo funciona la seguridad

- **Entrar:** solo con Microsoft, solo cuentas del tenant de Grupo Gilca y solo de los dominios de *Ajustes → Dominios permitidos* (de momento `carpa-diem.com`). Si alguien de otro dominio lo intenta, la base de datos rechaza el alta.
- **Administrador:** `lcreus@carpa-diem.com` recibe el rol de administrador al entrar por primera vez. Desde *Ajustes* puede hacer administrador a otra persona o desactivar un usuario.
- **Permisos en la base de datos** (no solo en la pantalla): todo el equipo ve y edita todo; solo el administrador cambia listas y ajustes, ve la papelera, restaura y borra definitivamente.
- **Borrar:** cualquier usuario puede "borrar", pero el registro va a la papelera.
- **Historial:** cada alta, cambio, borrado y restauración queda registrado con quién, cuándo y qué cambió (valor anterior → nuevo). Nadie puede modificarlo.
- **Numeración:** `CD` + 3 dígitos, correlativa por año de creación. La da la base de datos con un bloqueo, así que nunca se repite aunque dos personas creen presupuestos a la vez. 2026 empieza en el 13.

## Decisiones técnicas

- **Cache Components de Next.js desactivado:** el CRM es una app con sesión y los datos llegan en vivo desde Supabase, así que no aporta nada y complica el código.
- **Login a través de Supabase Auth (proveedor Azure):** así la base de datos sabe quién es cada usuario y aplica los permisos fila a fila.
- **SharePoint con permiso `Sites.Selected`:** el CRM solo podrá tocar el sitio GrupoGS (se configura en la Fase 4).

## Secretos

Las claves **nunca** se suben a GitHub. Van en `.env.local` (ignorado por git), en Supabase y en las variables de entorno de Vercel.

- **Secreto de cliente de Entra ID:** caduca a los 24 meses de crearlo. Antes de que caduque, crea uno nuevo en Entra ID y cámbialo en Supabase (*Authentication → Providers → Azure*), en `.env.local` y en Vercel.

## Preparado para el ERP (no construido)

Facturas, datos fiscales, costes por evento y margen colgarán de `eventos` y `presupuestos`. Todas las tablas ya guardan quién y cuándo, y los importes son `numeric(12,2)`.
