# DentalSys — Sistema de Gestión Odontológica

Stack 100% Cloudflare-native. Sin Supabase. Sin servicios externos.

```
React + Vite → Cloudflare Pages
Pages Functions → API (Workers)
D1 (SQLite) → Base de datos
KV → Sesiones
JWT con Web Crypto API → Auth
```

---

## Deploy en 5 pasos

### 1. Instalar dependencias

```bash
npm install
```

### 2. Crear base de datos D1

```bash
# Crear la DB
npx wrangler d1 create dentalsys-db

# Copiar el database_id que devuelve el comando
# Pegarlo en wrangler.toml → [[d1_databases]] → database_id
```

### 3. Crear KV namespace para sesiones

```bash
npx wrangler kv:namespace create SESSIONS

# Copiar el id y pegarlo en wrangler.toml → [[kv_namespaces]] → id
```

### 4. Inicializar el schema SQL

```bash
# Producción
npm run db:init

# Local (para desarrollo)
npm run db:local
```

### 5. Configurar variables de entorno

En el dashboard de Cloudflare Pages → Settings → Environment Variables:

| Variable | Valor |
|---|---|
| `JWT_SECRET` | Una cadena aleatoria de 32+ chars |

O en `wrangler.toml` para desarrollo local:
```toml
[vars]
JWT_SECRET = "tu-secret-seguro-aqui-32-chars-min"
```

### 6. Deploy

```bash
npm run deploy
```

---

## Desarrollo local

```bash
# Build del frontend
npm run build

# Servidor local con D1 y KV emulados
npx wrangler pages dev dist --d1=DB --kv=SESSIONS

# O con dev del frontend
npm run dev
# (El frontend en dev no tiene acceso a las Functions — usar wrangler para el stack completo)
```

---

## Estructura del proyecto

```
dentalsys/
├── wrangler.toml              ← Config Cloudflare
├── schema.sql                 ← Schema D1 — ejecutar una vez
├── preset.odontologia.json    ← 30 prestaciones default, estados, etc.
│
├── functions/                 ← API (Workers / Pages Functions)
│   ├── _middleware.js         ← Auth JWT global
│   ├── _lib/
│   │   ├── auth.js            ← JWT puro con Web Crypto API
│   │   ├── response.js        ← Helpers HTTP
│   │   └── db.js              ← Helpers D1
│   └── api/
│       ├── auth/              ← login, register, me
│       ├── pacientes/         ← CRUD + búsqueda
│       ├── turnos/            ← Agenda
│       ├── pagos/             ← Caja
│       ├── odontograma/       ← Estado por pieza (upsert)
│       ├── evoluciones/       ← Historia clínica
│       ├── presupuestos/      ← Con items
│       ├── prestaciones/      ← Catálogo
│       ├── insumos/           ← Inventario + movimientos
│       └── config/            ← Configuración consultorio
│
└── src/                       ← Frontend React
    ├── lib/
    │   ├── api.js             ← Cliente HTTP (sin Supabase)
    │   └── db.js              ← Dexie (offline cache futuro)
    ├── contexts/
    │   └── AuthContext.jsx    ← Auth con localStorage token
    ├── components/
    │   ├── Layout.jsx         ← Sidebar + topbar
    │   └── Odontograma.jsx    ← SVG interactivo 32 piezas FDI
    └── pages/
        ├── LoginPage.jsx
        ├── DashboardPage.jsx
        ├── PacientesPage.jsx
        ├── PacienteDetailPage.jsx  ← HC + Odontograma + Turnos + Presupuestos + Pagos
        ├── AgendaPage.jsx          ← Vista semanal
        ├── CajaPage.jsx            ← Caja + gráfico mensual
        ├── InsumosPage.jsx
        └── ConfigPage.jsx          ← Consultorio + Prestaciones + Agenda
```

---

## Módulos incluidos

| Módulo | Features |
|---|---|
| **Auth** | Login/register con JWT Web Crypto. Token en localStorage |
| **Pacientes** | CRUD completo, búsqueda, datos clínicos, obra social |
| **Odontograma** | SVG interactivo 32 piezas, notación FDI, 13 estados posibles |
| **Historia Clínica** | Evoluciones por paciente, vinculadas a prestaciones |
| **Agenda** | Vista semanal, arrastre por hora, estados de turno |
| **Presupuestos** | Con ítems, número correlativo, estados |
| **Caja** | Por día/mes/mes anterior, gráfico 6 meses, desglose por método |
| **Insumos** | Inventario, stock mínimo, alertas, movimientos |
| **Prestaciones** | Catálogo configurable, 30 prestaciones default |
| **Configuración** | Datos consultorio, agenda, catálogo |

---

## Costos estimados

| Servicio | Costo |
|---|---|
| Cloudflare Pages | Gratis |
| D1 (SQLite) | Gratis hasta 5M rows/mes |
| Workers (Functions) | Gratis hasta 100K req/día |
| KV | Gratis hasta 100K reads/día |
| **Total** | **$0/mes** |

---

## Seguridad

- JWT firmado con HMAC-SHA256 vía Web Crypto API nativa
- Middleware global verifica token en todas las rutas `/api/*`
- Todas las queries filtran por `tenant_id` (aislamiento por usuario)
- Soft delete en pacientes (archivado, no borrado)
- Passwords hasheados con HMAC-SHA256 + salt aleatorio
