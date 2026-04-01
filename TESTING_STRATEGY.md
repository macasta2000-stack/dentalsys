# DentalSys — Estrategia de Testing para Beta

> Generado: 1 de abril 2026 · Basado en inventario completo del codebase + 300K pruebas reales

---

## Estado actual

| Métrica | Valor |
|---------|-------|
| Pruebas ejecutadas | 300.229 |
| Tasa de éxito | 97.88% |
| Endpoints cubiertos | ~15 de 40+ |
| Categorías probadas | workflow, seguridad, edge-cases, carga |
| Framework de unit tests | ❌ No existe |
| Tests de UI (Playwright) | ⚠️ Estructura creada, no implementado |

---

## Pirámide de testing

```
            /  E2E (Playwright)  \         ~20 tests · flujos completos en browser
           /   API Integration    \        ~300K+ tests · bot-tester (✅ ACTIVO)
          /     Unit Tests         \       ~200 tests · Vitest (POR HACER)
```

---

## CAPA 1: Unit Tests (POR HACER)

**Framework recomendado:** Vitest (compatible con Vite, ya en el stack)

### Backend — functions/_lib/

| Archivo | Qué testear | Tests estimados |
|---------|------------|-----------------|
| `db.js` — `pick()` | Solo permite campos del whitelist por tabla | 15 |
| `db.js` — `update()` | Retorna null con data vacía, genera SQL correcto | 10 |
| `db.js` — `insert()` | SQL correcto, bind de parámetros | 8 |
| `auth.js` — `hashPassword()` | PBKDF2 format correcto, sal aleatoria | 5 |
| `auth.js` — `verifyPassword()` | Acepta hash nuevo y viejo (backward compat) | 5 |
| `auth.js` — `signJWT()` / `verifyJWT()` | Token válido, expirado, manipulado | 10 |
| `auth.js` — `generateApiKey()` | Formato msy_ correcto, hash almacenable | 3 |
| `response.js` — `ok/err/notFound` | Status codes y formato JSON correcto | 6 |
| `email.js` — templates | Genera HTML con variables reemplazadas | 8 |

### Frontend — src/lib/

| Archivo | Qué testear | Tests |
|---------|------------|-------|
| `api.js` | Headers de auth, manejo de 401/403, retry | 10 |
| `utils.js` | Formateo de fechas, moneda, validaciones | 15 |
| `comprobantePDF.js` | Genera PDF sin crashear, datos correctos | 5 |
| `recetaPDF.js` | Genera PDF con medicamentos | 5 |

### Frontend — src/hooks/

| Hook | Qué testear | Tests |
|------|------------|-------|
| `usePlanFeatures.js` | isTrial, isExpired, hasFeature por plan | 10 |
| `useRoleAccess.js` | canAccess por rol (profesional, recepcionista) | 8 |

**Total unit tests estimados: ~143**

---

## CAPA 2: API Integration Tests (✅ ACTIVO — bot-tester)

### Endpoints cubiertos actualmente ✅

| Módulo | Endpoints | Estado |
|--------|-----------|--------|
| Auth (login, register, me) | 3 | ✅ |
| Pacientes (CRUD + search) | 4 | ✅ |
| Turnos (CRUD + estados) | 4 | ✅ |
| Evoluciones (create + list) | 2 | ✅ |
| Pagos (create + list caja) | 2 | ✅ |
| Presupuestos (create + approve) | 3 | ✅ |
| Planes de pago (create + cuotas) | 3 | ✅ |
| Prestaciones (list) | 1 | ✅ |
| Config (get) | 1 | ✅ |
| Seguridad (auth, injection, XSS) | 12+ | ✅ |

### Endpoints SIN cobertura ⚠️ — Agregar al bot

| Módulo | Endpoints faltantes | Prioridad |
|--------|-------------------|-----------|
| **Colaboradores** | CRUD + roles + login | 🔴 ALTA |
| **Odontograma** | CRUD por pieza dental | 🔴 ALTA |
| **Recetas** | Create + list + PDF | 🟡 MEDIA |
| **Anamnesis** | Create + update | 🟡 MEDIA |
| **Convenios (obras sociales)** | CRUD + aplicación en pago | 🟡 MEDIA |
| **Insumos** | CRUD + movimientos stock | 🟡 MEDIA |
| **Comprobantes** | Create + void | 🟡 MEDIA |
| **Giftcards** | Create + redimir + vencimiento | 🟡 MEDIA |
| **Reportes** | Generación por rango de fechas | 🟢 BAJA |
| **Encuestas** | Create + responder con token público | 🟢 BAJA |
| **Suscripción** | Get plan + features gate | 🟢 BAJA |
| **Import** | CSV upload + validación | 🟢 BAJA |
| **Developer keys** | CRUD + auth por API key | 🟢 BAJA |
| **Video sessions** | Create + join | 🟢 BAJA |
| **Admin (superadmin)** | Revenue + tenant management | 🟢 BAJA |

### Tests de seguridad adicionales necesarios

| Test | Qué verifica | Prioridad |
|------|-------------|-----------|
| Cross-tenant en TODOS los endpoints | Tenant A no puede ver datos de Tenant B | 🔴 ALTA |
| Colaborador con rol recepcionista | No puede crear presupuestos (si está restringido) | 🔴 ALTA |
| Trial expirado → modo read-only | POST/PATCH devuelve 402 | 🔴 ALTA |
| Account suspendido → 403 | Todo bloqueado | 🔴 ALTA |
| API key auth | msy_ key funciona igual que JWT | 🟡 MEDIA |
| Rate limiting en login | 429 después de 5 intentos | ✅ VERIFICADO |
| Token versioning | Cambio de contraseña invalida tokens previos | 🟡 MEDIA |
| Campo plan_id en body | Non-superadmin no puede setear plan_id | 🟡 MEDIA |

---

## CAPA 3: E2E Browser Tests (Playwright — POR COMPLETAR)

### Flujos críticos a testear

| # | Flujo | Pasos | Prioridad |
|---|-------|-------|-----------|
| 1 | **Onboarding completo** | Register → Onboarding wizard → Dashboard | 🔴 ALTA |
| 2 | **Día típico del dentista** | Login → Ver agenda → Atender paciente → Cobrar → Cerrar caja | 🔴 ALTA |
| 3 | **Crear paciente completo** | Pacientes → Nuevo → Llenar form → Guardar → Ver en lista | 🔴 ALTA |
| 4 | **Gestión de turnos** | Agenda → Nuevo turno → Confirmar → Presente → Completar | 🔴 ALTA |
| 5 | **Presupuesto → Plan de pago** | Crear presupuesto → Aprobar → Armar plan → Pagar cuota | 🟡 MEDIA |
| 6 | **Odontograma** | Detalle paciente → Clic en pieza → Cambiar estado → Guardar | 🟡 MEDIA |
| 7 | **Receta médica** | Detalle paciente → Nueva receta → Agregar medicamentos → PDF | 🟡 MEDIA |
| 8 | **Config del consultorio** | Config → Cambiar horarios → Cambiar datos → Guardar | 🟡 MEDIA |
| 9 | **Login colaborador** | Login con credenciales de profesional → Ve solo sus turnos | 🟡 MEDIA |
| 10 | **Modal drag-close** | Abrir modal → Drag texto dentro → Modal NO se cierra | 🔴 ALTA (bug previo) |

### Tests de regresión visual

| Test | Verifica |
|------|----------|
| Dashboard carga sin errores de consola | No hay errores JS |
| Agenda muestra turnos del día | Grid de horarios visible |
| Caja muestra totales correctos | Suma de pagos = total mostrado |
| Responsive mobile (375px) | Sidebar se colapsa, agenda scrolleable |

---

## CAPA 4: Tests especializados

### Offline/Sync (src/lib/localDB.js + syncManager.js)

| Test | Qué verifica |
|------|-------------|
| Crear paciente offline → reconectar → sincroniza | IndexedDB queue se vacía |
| Conflicto: mismo paciente editado offline + online | Resolución sin pérdida de datos |
| PWA funciona sin red | Service worker cachea assets |

### Integración externa

| Servicio | Test |
|----------|------|
| MercadoPago webhook | POST válido → actualiza estado del pago |
| MercadoPago webhook | POST con firma inválida → 401 |
| Email (Sendgrid) | Template de confirmación de turno se genera |

### Performance

| Test | Objetivo | Herramienta |
|------|----------|-------------|
| 50 turnos en agenda → renderiza < 1s | UX fluida | Playwright + performance.now() |
| 500 pacientes en lista → busca < 300ms | Búsqueda rápida | Bot (ya testeado ✅) |
| Dashboard con 1000+ pagos → carga < 2s | Reportes rápidos | Bot + Playwright |

---

## Plan de implementación

### Sprint 1 — Pre-beta (1-2 semanas)

1. ✅ **Bot-tester corriendo 24/7** — 300K pruebas/día
2. 🔲 Agregar al bot: colaboradores, odontograma, recetas, convenios
3. 🔲 Agregar al bot: tests de trial expirado + account suspendido
4. 🔲 Completar Playwright: flujos 1-4 (onboarding, día típico, paciente, turnos)
5. 🔲 Fix: bugs que aparezcan de los nuevos endpoints

### Sprint 2 — Beta week 1 (1 semana)

6. 🔲 Setup Vitest + primeros unit tests (auth.js, db.js pick/update)
7. 🔲 Playwright: flujos 5-10 (presupuesto, odontograma, config)
8. 🔲 Agregar al bot: insumos, giftcards, comprobantes
9. 🔲 Test de performance con datos reales

### Sprint 3 — Beta week 2+ (ongoing)

10. 🔲 Unit tests de hooks (usePlanFeatures, useRoleAccess)
11. 🔲 Tests offline/sync
12. 🔲 MercadoPago webhook test
13. 🔲 Visual regression (screenshots comparativos)

---

## Métricas objetivo

| Métrica | Objetivo beta | Objetivo v1.0 |
|---------|--------------|----------------|
| API pass rate (bot) | > 99% ✅ (actual: 99.97%) | > 99.9% |
| Endpoints cubiertos | 25 de 40+ (60%) | 40 de 40+ (100%) |
| Unit test coverage | > 50% de _lib/ | > 80% |
| E2E flujos cubiertos | 4 críticos | 10 completos |
| Tiempo de respuesta p95 | < 1.5s | < 800ms |
| Zero 500 errors en producción | ✅ | ✅ |

---

## Herramientas

| Herramienta | Uso | Estado |
|-------------|-----|--------|
| **bot-tester** (custom) | API integration + stress + security | ✅ ACTIVO |
| **Vitest** | Unit tests | 🔲 POR INSTALAR |
| **Playwright** | Browser E2E | ⚠️ Instalado, tests parciales |
| **AUDIT_REPORT.md** | Dashboard de resultados en tiempo real | ✅ ACTIVO |
| **AUDIT_DASHBOARD.html** | Reporte visual HTML | ✅ GENERADO |

---

*Generado por Claude Code · Testing Strategy Skill · DentalSys QA*
