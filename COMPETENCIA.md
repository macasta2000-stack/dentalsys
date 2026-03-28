# Análisis Competitivo — Software de Gestión Odontológica

> Investigación basada en reseñas de Capterra, G2, Google Play y foros sectoriales.
> Fecha: Marzo 2026

---

## 1. DENTALINK (Chile — USD 29+/mes)

### Lo que los usuarios ODIAN
1. **Pricing opaco**: Requiere demo para conocer el precio real; funciones bloqueadas por plan y por país
2. **Sin modo offline**: Si cae internet, no podés atender ni ver la agenda
3. **WhatsApp solo en planes superiores**: Los recordatorios automáticos están en planes pagos altos
4. **Curva de aprendizaje alta**: La configuración inicial requiere acompañamiento del equipo de soporte
5. **Exportación limitada**: Difícil extraer los datos propios (lock-in)

### Lo que los usuarios AMAN
1. Dashboard de crecimiento con métricas de negocio (cobertura, ausentismo, facturación)
2. Comunidad educativa y webinars gratuitos
3. UX limpia y moderna (comparado con software legacy)
4. Informes financieros detallados con gráficos
5. Escalabilidad para consultorios con varios profesionales

**Precio visible**: USD 29/mes (plan básico) — solo disponible en LATAM

---

## 2. DOCTOCLIQ (Perú — USD 0–19+/mes)

### Lo que los usuarios ODIAN
1. **Muy pocas reseñas independientes** (la mayoría son contenido propio del vendor)
2. **Sin API pública**: No se puede integrar con otros sistemas
3. **IA y recordatorios WhatsApp** solo en el plan anual más caro
4. **Factura electrónica** limitada a 4 países
5. **Curva inicial**: El módulo de productividad en tiempo real confunde al principio

### Lo que los usuarios AMAN
1. **Recordatorios WhatsApp automáticos** — es la funcionalidad más mencionada en reseñas
2. Pagos multi-moneda
3. Integración con Google Calendar y Zoom
4. Módulo de productividad en tiempo real
5. Mejor relación precio/funcionalidades del mercado

**Precio visible**: Plan gratuito (muy limitado) / USD 19/mes (profesional)

---

## 3. BILOG (Argentina — precio no público)

### Lo que los usuarios ODIAN
1. **Actualización reciente empeoró UX**: Tareas que antes eran 1 clic ahora requieren 3
2. **App mobile es solo companion**: No es una solución completa en celular
3. **Sin precio público**: Requiere contacto comercial
4. **Limitado fuera de Argentina** (obras sociales y facturación muy locales)
5. **Backup manual**: Aunque tiene backup automático en cloud, la configuración es compleja

### Lo que los usuarios AMAN
1. **Liquidación de obras sociales** (nóminas, bonos) — funcionalidad única para Argentina
2. Soporte personalizado con cuenta dedicada
3. Producto maduro y estable (más de 15 años en el mercado)
4. Backups automáticos
5. Flujo completo de paciente: desde turno hasta factura

**Precio visible**: No publicado (requiere cotización)

---

## 4. ODONTOSYS (Hispanoamérica — modelo de licencia anual)

### Lo que los usuarios ODIAN
1. **Soporte por TeamViewer**: Invasivo e incómodo para el profesional
2. **Sin reseñas en Capterra/G2**: Poca presencia en plataformas de terceros
3. **Sin herramientas de marketing/recall**: No envía recordatorios ni campañas
4. **Licenciamiento por dispositivo**: Pagar por cada computadora que accede
5. **Equipo pequeño**: Actualizaciones poco frecuentes

### Lo que los usuarios AMAN
1. **Soporte personalizado excepcional** (según usuarios directos)
2. Recordatorios automáticos de turnos
3. Imágenes clínicas dentro de la ficha del paciente
4. Informes de control financiero
5. Sincronización multi-dispositivo

**Precio visible**: Licencia anual, precio no publicado

---

## Análisis estratégico para DentalSys

### A) Lo que los usuarios AMAN de la competencia que DentalSys puede agregar

| Feature | Competidor | Status en DentalSys |
|---------|-----------|---------------------|
| Recordatorios WhatsApp automáticos | Doctocliq, Odontosys | ❌ Pendiente |
| Dashboard de métricas de negocio (cobertura, ausentismo %) | Dentalink | ⚠️ Parcial (caja básica) |
| Imágenes clínicas en ficha del paciente | Odontosys | ❌ Pendiente |
| Liquidación de obras sociales (nóminas) | Bilog | ❌ Pendiente |
| Integración Google Calendar | Doctocliq | ❌ Pendiente |
| Backups automáticos | Bilog | ✅ (D1 cloud) |
| App mobile funcional | Todos | ⚠️ Optimización en curso |

### B) Problemas que DentalSys resuelve mejor que la competencia

| Problema de la competencia | Solución en DentalSys |
|--------------------------|----------------------|
| Pricing opaco (Dentalink, Bilog) | Precio transparente y público |
| Sin modo offline (Dentalink, Doctocliq) | PWA con Service Worker (planificado) |
| Curva de aprendizaje alta | UX intuitiva, sin necesidad de capacitación |
| Dependencia de soporte externo para cambios | Auto-administración completa desde config |
| Lock-in / difícil exportar datos | Datos propios, exportable en todo momento |
| WhatsApp bloqueado en planes básicos | WhatsApp directo desde ficha del paciente (ya implementado) |
| App mobile no funcional | Diseño mobile-first en progreso |

### Funcionalidades priorizadas para implementar (orden de impacto)

1. **Recordatorios WhatsApp automáticos** — alta demanda en todos los competidores
2. **Dashboard de métricas avanzadas** — cobertura, ausentismo %, ingresos por prestación
3. **Imágenes clínicas** (foto intraoral, RX) en ficha del paciente
4. **Recall automático** — avisar a pacientes sin turno en X meses
5. **Exportar historia clínica** en PDF por paciente
