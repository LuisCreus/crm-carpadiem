# CRM Carpa Diem

CRM web de CARPADIEM IBÉRICA S.L. para gestionar leads, presupuestos (con la plantilla Word en SharePoint), eventos y planificación.

> Proyecto en construcción. Las especificaciones completas están en [`CLAUDE.md`](CLAUDE.md).

## Estado

- **Fase 0 — Preparación:** en curso.

## Piezas

| Pieza | Servicio |
|---|---|
| Código | GitHub (repositorio privado `LuisCreus/crm-carpadiem`) |
| Base de datos y tiempo real | Supabase (proyecto `dvfqrleonfkyibsrfzut`) |
| Hosting de la demo | Vercel (equipo `carpa-diem`) |
| Login y documentos | Microsoft Entra ID + Microsoft Graph (SharePoint) |

## Secretos

Las claves (secreto de Entra ID, claves de Supabase) **nunca** se suben a GitHub. Van en `.env.local` (ignorado por git) y en las variables de entorno de Vercel.
