# Prompt para Claude Code — CRM de Carpa Diem (v3)

> **Cómo usarlo:**
> 1. Crea una carpeta vacía en tu ordenador (por ejemplo, `crm-carpadiem`).
> 2. Guarda este archivo dentro con el nombre `CLAUDE.md`.
> 3. Abre Claude Code en esa carpeta y escribe: **"Lee CLAUDE.md y empieza por la Fase 0."**
>
> Los datos que todavía tengo que dar yo están marcados como **[PENDIENTE LUIS]**.

---

## 1. Quién soy y qué quiero

Soy Luis Creus, director general de **CARPADIEM IBÉRICA S.L.** (Vía de los Poblados 17, 28033 Madrid). Alquilamos carpas para eventos privados (bodas, comuniones, celebraciones) y para algún proyecto de larga duración. Empezamos a operar en 2026.

Trabajamos con:
- carpas beduinas o tensocarpas (15x12, 12x9, 9x6…);
- carpas modulares (6x6, 5x5, 3x3);
- tarima, estera, cortinas, iluminación, sombrillas, decoración, transporte y montaje.

**No sé programar.** Por eso te pido que:
- me expliques cada paso en lenguaje sencillo;
- me digas exactamente qué tengo que hacer yo (clics, cuentas, permisos);
- **pares y me preguntes antes de cualquier paso que no se pueda deshacer.**

### Qué quiero

Un **CRM web, en línea, multiusuario y en tiempo real**: cuando alguien cambia algo, los demás lo ven al instante. Este CRM **sustituye por completo a nuestros Excel de presupuestos y de eventos cerrados**. Cuando esté en marcha, dejaremos de usarlos y todo se gestionará desde el CRM.

### Qué no cambia

Los presupuestos **se siguen haciendo en mi plantilla de Word**, porque es la que tiene la estética de la empresa. El CRM no sustituye a Word: **lo orquesta**. Es decir, el CRM:
1. crea el documento a partir de la plantilla en la carpeta del cliente en SharePoint;
2. me lo abre para que lo edite libremente en Word;
3. cuando termino, genera el PDF y lo guarda en esa misma carpeta.

### Más adelante

Lo ampliaremos a un **ERP** con facturación, datos fiscales y costes por evento. Diseña el modelo de datos pensando en ello, pero no lo construyas ahora.

---

## 2. Usuarios y accesos

- **Todo el equipo usa el CRM y todos ven todo.** No hay restricciones de visibilidad.
- **Yo (`lcreus@carpa-diem.com`) soy el administrador.** Solo yo puedo:
  - gestionar usuarios;
  - editar listas y ajustes;
  - borrar registros definitivamente.
- El resto de usuarios crea y edita. Cuando borran algo, el borrado es lógico: va a una papelera que solo ve el administrador.
- **Login con Microsoft (Entra ID)**, de momento solo con cuentas `@carpa-diem.com`.
  - Nuestro Microsoft 365 es el del tenant de Grupo Gilca (SharePoint en `gilcasoundsl749.sharepoint.com`). Comprueba que `carpa-diem.com` está en ese tenant.
  - Deja en los ajustes una lista de dominios permitidos para añadir más adelante otros como `@grupogilca.com` o `@gilcasound.com` sin tocar código.
- **Comerciales** (lista editable): Álvaro, Ámparo, Jimena, Macarena, Felipe, Diego, Jorge, Pedro y Luis.
- **Historial de cambios** en cada registro: quién cambió qué y cuándo.

---

## 3. Ordenador y móvil

- El uso principal es en **ordenador**, pero en el **móvil** tiene que funcionar perfecto.
- Hazlo como **PWA** (aplicación web instalable): se añade a la pantalla de inicio del iPhone o Android, se abre a pantalla completa y tiene el icono de Carpa Diem. Sin pasar por App Store.
- **Diseña también pensando en el móvil**, no como una versión encogida del escritorio. En el móvil la navegación va con pestañas abajo; en el escritorio, con un menú lateral.
- En el móvil, prioriza:
  - consultar la planificación;
  - ver una ficha y llamar o escribir al cliente con un toque;
  - cambiar estados;
  - apuntar un lead rápido;
  - **compartir** un PDF (presupuesto u hoja de montaje) por WhatsApp o email con el menú nativo del teléfono.

---

## 4. Cómo trabajamos hoy y cómo será con el CRM

### Hoy

1. Llega un lead por correo.
2. Apuntamos el presupuesto en un Excel: número correlativo, cliente, fecha del evento y descripción del material.
3. Creamos a mano la carpeta del cliente en SharePoint.
4. Copiamos la plantilla Word, la adaptamos, la pasamos a PDF y la enviamos por Outlook.
5. Si se acepta, lo pasamos a otro Excel de eventos cerrados.

### Con el CRM

1. El lead se apunta en el CRM, o se crea directamente el presupuesto.
2. Pulso **"Nuevo presupuesto"** o **"Duplicar"** sobre uno anterior. El CRM:
   - asigna el número;
   - crea la carpeta del cliente;
   - crea el Word con la cabecera rellena;
   - me lo abre.
3. Edito el Word con total libertad: partidas, precios, descuentos, transporte…
4. Pulso **"Generar PDF"**. El CRM guarda el PDF en la carpeta y me pide confirmar el importe.
5. Envío yo el PDF por Outlook y pulso **"Marcar como enviado"**.
6. Voy cambiando el estado. Si el cliente acepta, el presupuesto se convierte en evento y aparece en la **Planificación**.

### Reglas de nombres (exactas)

- **Carpeta del cliente:**
  `CARPA DIEM/01. CLIENTES/{AÑO DEL EVENTO}/{MM}. {MES EN MAYÚSCULAS}/{DD-MM} {NOMBRE CLIENTE EN MAYÚSCULAS}`
  Ejemplo real: `CARPA DIEM/01. CLIENTES/2027/05. MAYO/08-05 CARLOTA DURÁN`
- **Presupuesto:**
  `PRESUPUESTO CD {nº con 3 dígitos} {NOMBRE CLIENTE} V{versión con 2 dígitos}`, en `.docx` y en `.pdf`.
  Ejemplo: `PRESUPUESTO CD 078 CARLOTA DURÁN V01.pdf`. Si hay cambios después de enviarlo, se crean V02, V03…
- **Fecha sin cerrar:** si la fecha del evento no está cerrada (por ejemplo, "junio de 2027"), pregúntame cómo nombrar la carpeta. Mi propuesta es `XX-06 NOMBRE` dentro del mes previsto, y moverla cuando se confirme la fecha.
- **Cambios de fecha o de nombre:** si cambian después de crear la carpeta, el CRM la mueve o la renombra, pidiendo confirmación.

---

## 5. SharePoint

Sitio: `https://gilcasoundsl749.sharepoint.com/sites/GrupoGS` → biblioteca "Documentos compartidos" → carpeta `CARPA DIEM/`.

| Qué | Ruta | Uso |
|---|---|---|
| Plantilla principal del presupuesto | `CARPA DIEM/02. PLANTILLAS/01. PRESUPUESTOS/PRESU WORD _ CARPADIEM.docx` | Base de la plantilla del CRM. **No modificar el original.** |
| Plantilla neutra | `CARPA DIEM/02. PLANTILLAS/01. PRESUPUESTOS/PRESU WORD NEUTRO _ CARPADIEM .docx` | Segunda plantilla elegible. **No modificar el original.** |
| Carpetas de clientes | `CARPA DIEM/01. CLIENTES/` | Donde se crean carpetas, Word y PDF |
| Logos | `CARPA DIEM/04. MEDIA/` | Logo para el CRM y la hoja de montaje |
| Excel de presupuestos y eventos (a sustituir) | `CARPA DIEM/PRESUPUESTOS Y EVENTOS CARPA DIEM V01.xlsx` | **Solo lectura**, para la importación inicial |
| Excel contable | `CARPA DIEM/03. FINANCIERO/Cuentas_y_facturas_Carpadiem_Ibérica_SL V02.xlsx`, hoja `Facturas` | **Solo lectura**, para deducir estados de pago al importar. **Nunca escribir en él.** |
| Pruebas (crear, con mi OK) | `CARPA DIEM/00. CRM PRUEBAS/` | Todo lo que se haga durante la demo |
| Copias de seguridad (crear, con mi OK) | `CARPA DIEM/00. CRM/COPIAS DE SEGURIDAD/` | Exportaciones semanales |

---

## 6. Arquitectura (salvo que me des una razón de peso para cambiarla)

| Pieza | Tecnología |
|---|---|
| App web | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui |
| Base de datos y tiempo real | Supabase (Postgres + Realtime), **en una región de la UE** (protección de datos). Plan gratuito para la demo |
| Login | Microsoft Entra ID, limitado a nuestro tenant y a los dominios permitidos |
| Microsoft 365 | Microsoft Graph API (v1.0): crear, mover y renombrar carpetas; copiar archivos; leer y escribir `.docx`; convertir a PDF con `GET /drives/{drive-id}/items/{item-id}/content?format=pdf`; enlaces para abrir en Word de escritorio (`ms-word:ofe\|u\|{url}`) y en Word Online |
| Código | Repositorio privado en GitHub |
| Hosting de la demo | Vercel (gratis). Para producción, compárame opciones (Vercel de pago, Hostinger, otras), con coste mensual |
| App móvil | PWA |

**Principios:**
- **No hay sincronización con Excel.** La base de datos del CRM es la única fuente de verdad. SharePoint solo guarda documentos (Word, PDF, hojas de montaje) y las copias de seguridad.
- **Secretos** (ID de cliente, claves): nunca en el código ni en GitHub. Solo en `.env.local` y en las variables de entorno del hosting.

---

## 7. Presupuestos con la plantilla Word (la pieza clave)

### 7.1 Plantillas del CRM

- Haz **copias** de mis dos plantillas en la misma carpeta: `PLANTILLA CRM _ CARPADIEM.docx` y `PLANTILLA CRM NEUTRA _ CARPADIEM.docx`. **Los originales no se tocan.**
- En las copias, inserta **controles de contenido de Word** (con etiqueta o *tag*) en:
  - Cliente;
  - Fecha;
  - Ubicación;
  - Nº Presupuesto;
  - el **% de reserva** dentro de las condiciones.
- **Usa controles de contenido, no marcadores de texto tipo `{cliente}`.** Los controles siguen existiendo después de rellenarse, así que se pueden volver a rellenar en copias. Esto es imprescindible para "Duplicar".
- No cambies nada más del diseño. Enséñame un PDF de antes y de después para compararlos.
- Si en el futuro cambio el diseño, edito esa plantilla del CRM en SharePoint y el CRM la usa automáticamente.

### 7.2 Nuevo presupuesto

**1. Formulario corto**, con estos datos:
- **Cliente.**
- **Contactos:** uno o varios, cada uno con nombre, rol (novio/a, familia, wedding planner, finca, empresa…), teléfono y email.
- **Tipo de cliente:** Particular, Empresa, Wedding planner, Finca, Ayuntamiento, Otro.
- **Tipo de evento:** Boda, Preboda, Comunión, Fiesta/cumpleaños, Corporativo, Proyecto de larga duración, Otro.
- **Intermediario** (opcional): wedding planner, finca, Gilca Sound…, con su comisión si la hay. Cada intermediario tiene una ficha ligera con su historial, porque los intermediarios sí repiten.
- **Fecha del evento:** también puede ser "por definir" o solo mes y año. Fecha de fin si el evento dura varios días.
- **Ubicación y provincia.**
- **Descripción breve del material**, como en el Excel. Por ejemplo: "2 beduinas 12x15 + tarima 72 m²".
- **Comercial.**
- **% de reserva:** por defecto, el del tipo de cliente; editable.
- **Plantilla:** Carpa Diem o Neutra.

**2. Creación automática.** El CRM:
- asigna el número;
- crea la carpeta si no existe;
- crea el `.docx` desde la plantilla con los controles rellenos y el nombre `... V01`.

**3. Edición.** Dos botones: **"Abrir en Word"** (escritorio) y **"Abrir en el navegador"** (Word Online).

**4. "Generar PDF".**
- Convierte a PDF la última versión guardada del `.docx`, con el mismo nombre y en la misma carpeta.
- **Antes de convertir**, comprueba que Word ha guardado los cambios. Si el documento se modificó hace unos segundos o hay cambios pendientes, avisa: "espera a que Word termine de guardar".
- Después, **lee del documento el "TOTAL (SIN IVA)" y el % de reserva** y muestra una confirmación, por ejemplo: *"Importe 13.246 € · Reserva 30 % = 3.973,80 € — ¿Correcto?"*. Si no consigue leerlo, me deja escribirlo a mano.

**5. Enlaces.** El CRM guarda los enlaces al Word, al PDF y a la carpeta.

### 7.3 Duplicar presupuesto (para ahorrar tiempo)

Ejemplo: vendí dos carpas 12x15 en Madrid y me sale otro cliente muy parecido.

- Desde cualquier presupuesto anterior: botón **"Duplicar para otro cliente"**.
- Buscador de presupuestos anteriores por material, provincia, importe y fecha (por ejemplo, "2 beduinas" + "Madrid").
- Al duplicar, el CRM:
  1. asigna un número nuevo;
  2. pide los datos del cliente nuevo;
  3. copia el Word de la **última versión** del presupuesto original a la carpeta nueva, con su nombre `V01`;
  4. **vuelve a rellenar los controles de contenido** con los datos nuevos;
  5. me lo abre para adaptarlo.

### 7.4 Nueva versión

- Botón **"Crear V02"**: copia el último `.docx` como V02 en la misma carpeta y lo abre. Después, "Generar PDF".
- El CRM guarda el historial de versiones, marca cuál se envió y actualiza el importe.

### 7.5 Opciones para un mismo cliente

- Hoy, cuando damos opciones, hacemos presupuestos con números distintos (por ejemplo, Elena Guinea nº 62 con 1 beduina y nº 63 con 2 beduinas). Se mantiene así: cada opción tiene su número.
- En el CRM quedan **agrupadas como opciones de una misma oportunidad**. Al aceptar una, las demás pasan solas a "Descartada (otra opción aceptada)".

### 7.6 Numeración

- Formato **`CD` + 3 dígitos**, correlativo **por año**, según la **fecha de creación** del presupuesto, no la del evento.
- **Nunca se repite**, aunque dos personas creen presupuestos a la vez. Usa una secuencia o un bloqueo en la base de datos.
- En 2026 continuamos desde el Excel. **[PENDIENTE LUIS: el siguiente número es el 77 o el 78. En el Excel ya hay un nº 77 apuntado (Marta Barberá, Salamanca, 03/07/2027, 2 beduinas 12x15).]**
- **Número inicial de cada año configurable** por el administrador. En 2026 empezamos a propósito en el 13, para que el primer cliente no viera un "001". Recuérdame decidir el número inicial de 2027 antes del 1 de enero.

### 7.7 Envío

- Sigue siendo **manual, por Outlook**.
- Botón **"Marcar como enviado"**, que guarda la fecha y la versión enviada.
- Botones **"Descargar PDF"** y **"Copiar enlace"**, y **"Compartir"** en el móvil.

### 7.8 Estados y cobros

**Estados:**

| Estado | Cuándo |
|---|---|
| **Borrador** | Creado, todavía no enviado |
| **Pendiente** | Enviado, esperando respuesta |
| **Aceptado** | El cliente acepta. Se crea el evento automáticamente |
| **Reserva pagada** | Lo cobrado llega al % de reserva |
| **Pagado 100 %** | Lo cobrado iguala el total |
| **Rechazado** | Con un motivo opcional |
| **Caducado** | Automático si pasa la fecha del evento y sigue Pendiente. Reversible |
| **Descartada** | Otra opción de la misma oportunidad fue aceptada |

**Cobros:**
- Se apunta **cada pago**: fecha, importe y concepto (reserva o resto).
- El estado de pago se calcula solo.
- Se ve siempre **lo pendiente de cobro**.

### 7.9 % de reserva

- Cambia según el **tipo de cliente**. Hay un valor por defecto por tipo, configurable por el administrador. **[PENDIENTE LUIS: valores por defecto. No bloquea; se configuran después.]**
- Es editable en cada presupuesto.
- El CRM lo escribe en la condición del Word mediante el control de contenido.

### 7.10 Tarifa

- Los precios viven en la plantilla Word y los ajusto en cada presupuesto (por ejemplo, a veces vendo la beduina a 13 €/m² en vez de 14 €/m²).
- **En la v1 no hay catálogo de precios en el CRM.**

---

## 8. Leads (prospección)

- **Alta rápida**, en menos de 30 segundos desde el móvil. Campos:
  - comercial;
  - fecha del primer contacto;
  - cliente y contacto (teléfono y email);
  - tipo de cliente;
  - canal: Llamada, Email, WhatsApp, Feria, Referido, Web, Gilca Sound;
  - fecha y lugar aproximados del evento;
  - qué pide;
  - próxima acción (fecha + texto);
  - comentarios.
- **Estados:** Por contactar, Contactado, Interesado, Presupuesto enviado, Ganado, Perdido.
- **Vista Kanban** (arrastrar entre estados) y **vista tabla** con filtros.
- Botón **"Crear presupuesto"**: arrastra los datos del lead al presupuesto.

---

## 9. Eventos

**Creación:** el evento se crea al aceptar un presupuesto.

**Campos:**
- fechas de inicio y fin, y día de la semana automático;
- cliente y contactos;
- tipo de evento;
- intermediario;
- ubicación, con enlace a Google Maps, y provincia;
- material;
- importe, cobrado y pendiente;
- comentarios;
- enlaces al presupuesto y a la carpeta.

**Modalidad:**
- **Confirmado:** el evento va sí o sí.
- **Seguro (de lluvia):** el cliente paga un % y le reservamos el material.
  - Puede decidir **hasta 10 días antes del evento**. El CRM calcula la fecha límite (evento − 10 días) y avisa desde 3 días antes.
  - Si **sigue adelante**, pasa a Confirmado.
  - Si **cancela**, pasa a "Cancelado – reserva retenida", con el importe retenido (Carpa Diem se queda lo pagado).

**Montaje:**
- Fecha y hora de **montaje** y de **desmontaje**.
- **Equipo de montadores**, de una lista editable (por ejemplo, David Mendoza, montador autónomo). Los montadores **no usan el CRM**.

**Hoja de montaje (PDF):**
- Un botón la genera con diseño limpio y nuestro logo.
- Contenido:
  - dirección con enlace a Maps;
  - contacto en destino;
  - horarios de montaje y desmontaje;
  - material;
  - montadores;
  - observaciones.
- **Sin precios.**
- Se guarda en la carpeta del cliente como `HOJA DE MONTAJE CD 078 NOMBRE.pdf` y se comparte por WhatsApp o email.

**Control de material por evento:**
- Material que sale (con fecha) y material que entra (con fecha).
- Check automático **OK / FALTAN / SOBRAN**.
- Observaciones.

**Inventario:**
- Tabla editable con: material, cantidad propia y si es propio o subalquilado. **[PENDIENTE LUIS: subirá el inventario completo.]**
- Cuando esté cargado, el CRM **avisa si eventos que se solapan piden más material del disponible**, contando también los proyectos de larga duración.

**Proyectos de larga duración (por ejemplo, Peñalagos):**
- En la v1 se tratan como un evento con fecha de inicio y de fin, para que el material figure como ocupado. **[PENDIENTE LUIS: fechas de ocupación de Peñalagos.]**
- La plantilla de oferta de proyectos y las cuotas mensuales quedan fuera de la v1.

---

## 10. Pestaña "Planificación"

Para ver rápidamente, mes a mes, qué eventos tenemos cerrados y planificar bien.

- **Vista por defecto:** cuadrícula de los **12 meses** del año.
  - Selector de año, porque ya tenemos eventos en 2027.
  - Opción "próximos 12 meses".
- **Cada mes** muestra:
  - una cabecera con el **nº de eventos y el importe total**;
  - **tarjetas** de evento con: día, cliente, tipo de evento, material, lugar, etiqueta **Confirmado** (verde suave) o **Seguro** (ámbar suave) e indicador de cobrado o pendiente.
- **Interruptor "Mostrar presupuestos pendientes"**: los muestra en gris claro y con borde discontinuo, para prever choques de material.
- **Clic en un mes:** detalle con calendario (mes y semana) donde evento, montaje y desmontaje aparecen en colores distintos.
- **En el móvil:** lista vertical por meses, plegable.

---

## 11. Inicio, avisos y búsqueda

**Inicio** (la pantalla que se abre al entrar):
- **Hoy y esta semana:**
  - seguimientos pendientes;
  - montajes y desmontajes;
  - plazos de seguro de lluvia;
  - cobros pendientes después del evento.
- **Próximos eventos.**
- **Números del mes y del año:**
  - presupuestos enviados;
  - tasa de aceptación;
  - € presupuestados frente a € aceptados;
  - reservas cobradas frente a pendientes.

**Avisos dentro del CRM:**
- recordatorio de seguimiento **7 días después de "enviado"** (configurable);
- plazo del seguro de lluvia;
- montaje al día siguiente;
- cobro pendiente después del evento.

**Búsqueda global** (atajo `⌘K` / `Ctrl+K`): por cliente, número de presupuesto, lugar, fecha o intermediario.

---

## 12. Copias de seguridad

- **Exportación automática semanal** (por ejemplo, el lunes a las 7:00) de todo el CRM a un Excel en `CARPA DIEM/00. CRM/COPIAS DE SEGURIDAD/CRM CARPA DIEM AAAA-MM-DD.xlsx`.
  - Hojas: Presupuestos, Eventos, Leads, Cobros, Material.
  - Se guardan las últimas 12 semanas.
  - Es una foto para consulta, no para editar.
- Botón **"Exportar ahora"**, solo para el administrador.
- En producción, además, las copias diarias del plan de pago de la base de datos. Explícame cuántos días se guardan.
- Ojo: **el plan gratuito no tiene copias automáticas**.

---

## 13. Fuera de la v1 (déjalo preparado, no lo construyas)

- **ERP y facturación:**
  - datos fiscales (los daré más adelante);
  - facturas `CD 2026/n` e IVA;
  - **costes variables por evento** (montadores, furgoneta, gasolina, comisiones, carpas subalquiladas) y margen por evento;
  - conexión con el Excel contable.
- Crear leads automáticamente desde Outlook.
- Enviar presupuestos desde el CRM.
- Firma digital.
- Sincronizar eventos y montajes con un calendario compartido de Outlook.
- Email con resumen diario.
- Ofertas de proyectos (`02. PLANTILLAS/02. PROYECTOS`) y cuotas mensuales.
- Catálogo o tarifa estructurada.

---

## 14. Estética: muy limpia, casi blanca e intuitiva

- **Base casi blanca**: mucho aire, tipografía clara, grises suaves para bordes y textos secundarios.
- **El color de marca solo en detalles**: botón principal, menú activo, etiquetas de estado y algún acento.
  - Saca los colores y las tipografías de **www.carpa-diem.com** (analiza su CSS y sus Google Fonts).
  - Logo: el de la web o el de `CARPA DIEM/04. MEDIA/`.
- **Solo modo claro.**
- **Referencias:** la limpieza de Linear, Notion o Attio. Nada de paneles recargados, sombras fuertes ni colorines.
- **Intuitivo:**
  - una acción principal clara por pantalla;
  - formularios cortos;
  - estados como etiquetas de color suave;
  - confirmaciones discretas ("Guardado ✓");
  - estados vacíos con un mensaje y un botón para empezar.
- **Todo en español**, fechas en formato `dd/mm/aaaa` e importes con formato `13.246 €`.
- **Antes de construir nada, enséñame tres pantallas** en versión ordenador y móvil: **Inicio**, **Ficha de presupuesto** y **Planificación**.

---

## 15. Importación de los datos existentes

Se hace una sola vez, con un script, y **enseñándome antes un resumen**: cuántos registros, qué cambios y qué se descarta.

1. **Presupuestos** de la hoja `PPTS 25-26`: del nº **13 al 77**.
   - No existen del 1 al 12: empezamos en el 13 a propósito.
   - Ignora las filas basura del final (".diego", "presu fdo", "."…).
   - Normaliza los nombres de los comerciales ("LUIS " con espacio → "LUIS").
2. **Los estados del Excel no están al día.** Propón el estado correcto usando la hoja `Facturas` del Excel contable (solo lectura) y **revisa la lista conmigo antes de importar**. Lo que ya sé:
   - Figuran como "Pendiente", pero se hicieron y se facturaron:
     - 32 (Boda Oriol / Marta Barberá);
     - 46 (Cristina Ybáñez);
     - 48 (Manuel Jaquete);
     - 62 o 63 (Elena Guinea; pregúntame cuál de los dos).
   - El resto de "Pendiente" con la fecha del evento ya pasada → **Caducado**.
   - Los estados de pago (reserva o total) se deducen de las facturas: "Facturación general" es el total e "Importe factura" lo facturado. **Confírmame los dudosos**, por ejemplo el evento Fever del 10/09/2026 (nº 60): era un seguro y el comentario dice "solo se quedan con el seguro".
3. **Eventos:** a partir de los presupuestos aceptados y de la hoja `EVNTS CERRADOS`. Las fechas de montaje y desmontaje quedan vacías.
4. **Control de material:** hoja `CONTROL MATERIAL`, enlazando cada fila con su evento.
5. **Carpetas existentes:** busca la carpeta de cada presupuesto importado en `01. CLIENTES` y enlázala, junto con su PDF si existe. **No muevas ni renombres nada.**
6. **Datos raros:**
   - fechas inválidas ("XX(06/27" → "por definir, junio 2027");
   - varios emails en una celda → varios contactos;
   - erratas en lugares ("MADARID").

   Propón las correcciones.
7. Cuando estemos en producción, propónme mover los Excel antiguos a `CARPA DIEM/OLD/`. **Solo con mi OK.**

---

## 16. Plan por fases (para al final de cada fase y espera mi OK)

- **Fase 0 — Preparación.**
  - Cuentas gratuitas: GitHub, Supabase (región UE) y Vercel.
  - **Registro de la app en Microsoft Entra ID**, clic a clic (soy el administrador): qué permisos de Graph pedir (los mínimos) y dónde guardar el ID de cliente y el secreto.
  - Crear el repositorio privado.
- **Fase 1 — Diseño.** Las tres pantallas (Inicio, Ficha de presupuesto, Planificación), en ordenador y móvil.
- **Fase 2 — Base.** Login, modelo de datos, tiempo real, roles, historial de cambios y papelera.
- **Fase 3 — Funcionalidad sin Microsoft.** Presupuestos, leads, eventos y planificación dentro del CRM, más una importación de prueba.
- **Fase 4 — Integración con Word y SharePoint**, solo en `00. CRM PRUEBAS`:
  - plantillas con controles de contenido;
  - crear, duplicar y nuevas versiones;
  - abrir en Word;
  - generar PDF;
  - lectura del importe.

  Si esta integración da problemas, **el CRM debe seguir funcionando**: como plan B, permite subir el PDF a mano.
- **Fase 5 — Operativa de eventos.** Seguros de lluvia, montajes, hoja de montaje, material, avisos e Inicio.
- **Fase 6 — Móvil.** PWA y pulido, con pruebas reales en iPhone y Android.
- **Fase 7 — Copias de seguridad.** Exportación semanal.
- **Fase 8 — Demo en línea** en Vercel, probándola con 2–3 compañeros a la vez.
- **Fase 9 — Producción.**
  - Importación real revisada conmigo.
  - Apuntar a las carpetas reales (con mi OK).
  - Plan de pago, copias de seguridad y costes.
  - Archivar los Excel antiguos (con mi OK).

---

## 17. Reglas de trabajo

- **Pregunta antes de cualquier cosa irreversible.**
- **Nunca escribas en archivos o carpetas reales** hasta que yo lo autorice. Todas las pruebas, en `CARPA DIEM/00. CRM PRUEBAS/`.
- **Nunca modifiques** las plantillas originales ni el Excel contable.
- **Escribe tests** de lo crítico:
  - numeración anual sin duplicados y con número inicial configurable;
  - nombres de carpetas y archivos (también versiones y fechas por definir);
  - fecha límite del seguro de lluvia;
  - estados de pago;
  - relleno de controles de contenido en copias duplicadas.
- Mantén un **`README.md` en español** que explique cómo arrancar el proyecto y qué hace cada parte.

---

## 18. Entorno técnico (ordenador de Luis)

- **Sistema:** Windows (x64).
- **Carpeta del proyecto:** `crm-carpadiem`, dentro de la carpeta Documentos del usuario (`~\Documents\crm-carpadiem`).
- **Ojo con el repositorio de la carpeta personal.** En la carpeta personal del usuario (`~`) hay una carpeta `.git`, es decir, la carpeta personal entera es un repositorio git.
  - Antes de nada, compruébalo con `git rev-parse --show-toplevel`.
  - Crea el repositorio del CRM con `git init` **dentro de `crm-carpadiem`**.
  - **Nunca** hagas commits, cambios ni push en ese repositorio superior.
  - Avísame de que existe, pero no lo toques.
- **No crees nada en las carpetas sincronizadas.** `~\Gilcasound SL` parece ser la carpeta de SharePoint sincronizada con OneDrive; tampoco uses `~\OneDrive`. La carpeta `node_modules` y la sincronización no se llevan bien.
  - Si durante el desarrollo necesitas ver la plantilla Word, puedes leerla desde ahí **en modo solo lectura**, confirmándolo antes conmigo.
  - La app accederá siempre a SharePoint mediante Microsoft Graph, nunca mediante la carpeta sincronizada.
- **Programas necesarios.** Es posible que falten Node.js (versión LTS) y Git for Windows. Compruébalo y, si faltan, guíame paso a paso para instalarlos desde sus instaladores oficiales.
