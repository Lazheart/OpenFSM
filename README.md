# OpenFSM: Open Field Service Management

OpenFSM es una plataforma Software as a Service (SaaS) multinquilino, serverless y orientada a eventos (Event-Driven Architecture - EDA) desplegada en Amazon Web Services (AWS). Esta disenada para la coordinacion integral de tecnicos, visitas en campo, ordenes de trabajo e inventario en empresas de servicios tecnicos.

---

## 1. Informacion del Proyecto

### 1.1 Resumen Ejecutivo
OpenFSM implementa un modelo de gestion operativa en campo (Field Service Management - FSM) de nivel empresarial. La solucion esta concebida para operar en un ecosistema de nube publica con costos proporcionales al uso efectivo (pay-as-you-go), garantizando alta disponibilidad, aislamiento de datos entre clientes corporativos y procesamiento asincrono de alta resiliencia.

- **Tipo de Solucion:** Software as a Service (SaaS) B2B
- **Dominio:** Field Service Management (FSM)
- **Plataforma de Nube:** Amazon Web Services (AWS)
- **Marco Academico:** Competencia 4.1 (Nivel 3) - Crear, seleccionar, adaptar y aplicar tecnicas, recursos y herramientas modernas para la practica de la computacion y comprender sus limitaciones.
- **Referencias de la Industria:** Salesforce Field Service, ServiceTitan, Jobber.

### 1.2 Stack Tecnologico
- **Backend Serverless:** Python 3.11 en AWS Lambda y Amazon API Gateway (REST API).
- **Seguridad y Control de Acceso:** API Gateway Lambda Custom Token Authorizer con tokens JWT (HMAC-SHA256) y contraseñas cifradas con PBKDF2-SHA256.
- **Bases de Datos NoSQL:** Amazon DynamoDB con modo de capacidad bajo demanda (`PAY_PER_REQUEST`) y clave de particion `tenant_id`.
- **Bases de Datos Relacionales (SQL):** Amazon RDS bajo el patron *Single Database, Multiple Schemas* (`tenant_alpha`, `tenant_beta`, `tenant_gamma`).
- **Mensajeria y Eventos (EDA):** Amazon SNS (Topic Fan-Out) y Amazon SQS (Queue con Dead Letter Queue - DLQ).
- **Almacenamiento de Archivos:** Amazon S3 con firmas criptograficas temporales (Pre-signed URLs) y politicas CORS.
- **Automatizacion de Infraestructura (IaC):** Serverless Framework (v3/v4) parametrizado e integrado con el rol de ejecucion `LabRole`.
- **Frontend SPA:** React 19, TypeScript, Vite y Tailwind CSS / CSS Modules, preparado para despliegue en AWS Amplify Hosting.
- **Motor de Ingesta:** Python CLI capaz de generar e ingerir mas de 30,000 registros por microservicio en 3 tenants.

### 1.3 Estructura del Repositorio
```text
OpenFSM/
├── back/                      # Backend serverless en Python (5 microservicios + Auth + Authorizer)
│   ├── serverless.yml         # Definicion de infraestructura automatizada con Serverless Framework
│   ├── requirements.txt       # Dependencias del backend (boto3, PyJWT)
│   ├── common/                # Modulos reutilizables (auth_utils, db_utils, event_utils, response_utils)
│   ├── auth/                  # Servicio de autenticacion y Lambda Custom Token Authorizer
│   ├── customers/             # Microservicio 1: Gestion de Clientes y Sedes
│   ├── technicians/           # Microservicio 2: Tecnicos, Habilidades y Flota
│   ├── workorders/            # Microservicio 3: Ordenes de Trabajo (Emisor SNS)
│   ├── visits/                # Microservicio 4: Visitas de Campo, S3 y Consumidor SQS
│   ├── inventory/             # Microservicio 5: Inventario, Repuestos y Facturacion
│   └── tests/                 # Pruebas unitarias de controladores y autorizador
├── front/                     # Frontend SPA en React + Vite + TypeScript (Desplegable en AWS Amplify)
│   ├── src/                   # Codigo fuente con soporte para Demo interactiva de multiples tenants
│   ├── package.json           # Dependencias y scripts de compilacion
│   └── .env.example           # Plantilla de variables de entorno para conexion al API Gateway
├── ingest/                    # Motor de generacion e ingesta masiva de datos sinteticos
│   ├── main.py                # Punto de entrada CLI para generacion y carga
│   ├── generator.py           # Generador de datos sinteticos con coherencia relacional
│   ├── dynamodb_loader.py     # Ingestor por lotes directo a Amazon DynamoDB (batch_writer)
│   ├── json_exporter.py       # Exportador a archivos JSON locales
│   ├── sql_exporter.py        # Exportador a script SQL para RDS (Single DB, Multiple Schemas)
│   ├── requirements.txt       # Dependencias del generador
│   └── sql/
│       └── schema_tenant_rds.sql # DDL de base de datos relacional para RDS
└── docs/
    ├── ARCHITECTURE.md        # Documentacion tecnica detallada, diagramas de arquitectura y ER
    └── DEPLOY.md              # Guia exhaustiva de despliegue, variables de entorno y smoke testing
```

### 1.4 Documentacion Complementaria
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md):** Diagrama de arquitectura de solucion, especificacion de contratos de datos, diagramas entidad-relacion (ER) para RDS y esquemas JSON para DynamoDB.
- **[DEPLOY.md](docs/DEPLOY.md):** Tabla maestra de variables de entorno, instrucciones paso a paso para el despliegue con Serverless Framework, ingesta de datos sinteticos y despliegue en AWS Amplify.

---

## 2. Finalidad del Proyecto

La gestion de servicios en campo (Field Service Management) representa uno de los mayores desafios logisticos y operativos para empresas de mantenimiento, telecomunicaciones, energia y climatizacion. La falta de visibilidad en tiempo real entre los despachadores en oficina y las cuadrillas en ruta genera retrasos, perdida de inventario y acuerdos de nivel de servicio (SLA) incumplidos.

OpenFSM tiene como finalidad resolver estos desafios mediante una plataforma de software distribuida y moderna que:

1. **Centraliza la Operacion de Campo:** Coordina de punta a punta la creacion de ordenes de trabajo correctivas y preventivas, la asignacion de tecnicos segun sus competencias y la ejecucion fisica de visitas en terreno.
2. **Garantiza la Privacidad y el Aislamiento Multinquilino:** Permite que multiples empresas compartan la misma infraestructura de software reduciendo costos operativos, manteniendo sus datos estrictamente confidenciales y aislados logica y fisicamente.
3. **Optimiza Costos y Disponibilidad con Serverless:** Elimina la necesidad de aprovisionar y mantener servidores virtuales dedicados, reduciendo los costos de operacion a cero cuando no existe demanda activa.
4. **Habilita el Desacoplamiento Operativo Mediante Eventos (EDA):** Automatiza procesos derivados (como la creacion y notificacion de visitas tras la emision de una orden de trabajo) sin bloquear al usuario y tolerando fallos transitorios mediante colas de mensajes y colas de mensajes no procesados (DLQ).
5. **Ofrece Trazabilidad y Evidencia Digital:** Registra firmas, fotografias y consumos de inventario para cada visita, proporcionando a los clientes un historial inmutable de las intervenciones realizadas.

---

## 3. Explicacion de Feats (Funcionalidades)

### 3.1 Arquitectura Multinquilino (Multi-Tenancy)
OpenFSM soporta de forma nativa multiples organizaciones clientes (tenants) sobre la misma infraestructura:
- **Aislamiento en Nivel de Acceso:** Cada solicitud HTTP entrante es interceptada por un autorizador Lambda en API Gateway. El autorizador extrae y verifica el `tenant_id` contenido criptograficamente en el token JWT, inyectandolo como contexto seguro de autorizacion (`requestContext.authorizer.tenant_id`).
- **Aislamiento NoSQL (DynamoDB):** Todas las tablas utilizan una clave compuesta donde la clave de particion (Partition Key) es estrictamente `tenant_id` y la clave de ordenamiento (Sort Key) es el identificador de la entidad (`id`). Esto garantiza que ninguna operacion de lectura o escritura pueda cruzar limites de inquilinos.
- **Aislamiento SQL (RDS):** Aplica el patron *BD Multi-tenancy - Patron 2: Single Database, Multiple Schemas*. La base de datos relacional aloja esquemas separados e independientes por inquilino (`tenant_alpha`, `tenant_beta`, `tenant_gamma`), compartiendo una sola instancia para maximizar la eficiencia de recursos.

### 3.2 Modulo de Autenticacion y Lambda Custom Token Authorizer
- **Rutas Publicas (`/auth/login`, `/auth/register`):** Permiten el registro seguro y la obtencion de tokens de sesion asociados a un inquilino especifico.
- **Ruta Protegida (`/auth/me`):** Permite verificar la validez del token y obtener los datos del usuario en sesion.
- **Lambda Token Authorizer:** Funciona como un guardian centralizado en API Gateway. Si el token es valido, genera una politica IAM dinamica de tipo `Allow` y cachea la respuesta durante 300 segundos, reduciendo la latencia y los costos de invocacion.

### 3.3 Microservicio 1: Customers (Gestion de Clientes y Sedes)
- Permite registrar y consultar el directorio corporativo de clientes y sus sedes operativas.
- Clasifica a los clientes por tipo de contrato y nivel de servicio acordado (SLA: Standard, Gold, Platinum).
- Endpoints protegidos: `GET /customers`, `POST /customers`, `GET /customers/{id}`, `DELETE /customers/{id}`.

### 3.4 Microservicio 2: Technicians (Tecnicos, Habilidades y Flota)
- Administra el perfil de los tecnicos de campo, sus especialidades tecnicas (HVAC, Fibra Optica, Media Tension, Automatizacion), certificaciones y zonas asignadas.
- Actualiza en tiempo real el estado de disponibilidad del tecnico (`AVAILABLE`, `ON_DUTY`, `OFF_DUTY`) y su geolocalizacion aproximada.
- Endpoints protegidos: `GET /technicians`, `POST /technicians`, `GET /technicians/{id}`, `PUT /technicians/{id}/status`.

### 3.5 Microservicio 3: Work Orders (Ordenes de Trabajo y Emisor SNS)
- Controla el ciclo de vida de las solicitudes de mantenimiento (`PENDING`, `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`).
- Asocia una orden a un cliente, una sede, una prioridad (`LOW`, `NORMAL`, `HIGH`, `EMERGENCY`) y un tecnico asignado.
- **Emision de Eventos:** Al crearse una orden de trabajo o actualizarse su estado, el microservicio publica asincronamente un evento de dominio (`WorkOrderCreated`, `WorkOrderStatusChanged`) en el topico Amazon SNS `openfsm-${userCode}-${stage}-events`.
- Endpoints protegidos: `GET /workorders`, `POST /workorders`, `GET /workorders/{id}`, `PUT /workorders/{id}/status`.

### 3.6 Microservicio 4: Visits (Visitas, S3 y Consumidor SQS)
- Coordina la intervencion fisica del tecnico en la sede del cliente.
- **Consumo Asincrono (Worker SQS):** La funcion Lambda `visitsSqsWorker` escucha la cola Amazon SQS suscrita al topico SNS. Cuando recibe un evento `WorkOrderCreated`, agenda y genera automaticamente la visita inicial de evaluacion sin requerir intervencion manual del operador.
- **Tolerancia a Fallos (DLQ):** En caso de fallas transitorias en el procesamiento del worker, los mensajes son reenviados a la cola de mensajes no procesados (Dead Letter Queue) tras 3 intentos.
- **Evidencias Fotograficas en Amazon S3:** Proporciona un endpoint (`POST /visits/evidence-url`) que genera URLs prefirmadas de tipo PUT. El cliente o la app movil carga las fotos de la inspeccion directamente a Amazon S3, evitando transferencias pesadas por API Gateway y Lambda.
- Endpoints protegidos: `GET /visits`, `POST /visits`, `GET /visits/{id}`, `PUT /visits/{id}/complete`, `POST /visits/evidence-url`.

### 3.7 Microservicio 5: Inventory (Inventario y Repuestos)
- Mantiene el catalogo de piezas, repuestos y herramientas asignadas a almacenes centrales o vehiculos de servicio.
- Registra el consumo de repuestos vinculado a cada orden de trabajo con descuento atomico de existencias (`POST /inventory/consume`).
- Endpoints protegidos: `GET /inventory`, `POST /inventory`, `GET /inventory/{id}`, `POST /inventory/consume`.

### 3.8 Motor de Ingesta Sintetica (`ingest/`)
- Genera mas de 150,000 registros sinteticos en total (30,000 registros por microservicio, distribuidos equitativamente en 10,000 registros para cada uno de los 3 tenants).
- Garantiza coherencia e integridad referencial en memoria (las ordenes hacen referencia a clientes y tecnicos existentes del mismo inquilino; las visitas hacen referencia a ordenes reales; los consumos de inventario descuentan articulos existentes).
- Permite la exportacion concurrente a archivos JSON locales, scripts DDL/DML para Amazon RDS o carga por lotes optimizada (`batch_writer`) hacia Amazon DynamoDB en AWS.

### 3.9 Frontend SPA Multinquilino (`front/`)
- Construido con React 19, TypeScript y Vite.
- Incorpora un conmutador de inquilinos interactivo en caliente que permite a los evaluadores alternar de inmediato entre `tenant-alpha`, `tenant-beta` y `tenant-gamma` para verificar visualmente que las listas de ordenes, clientes y tecnicos cambian por completo, evidenciando el aislamiento de datos.
- Permite la creacion interactiva de ordenes de trabajo, visualizacion de estados y simulacion del flujo operativo.

---

## 4. Convenciones y Practicas de Ingenieria

### 4.1 Convenciones de Nomenclatura de Recursos en AWS
Para evitar colisiones en cuentas compartidas o entornos de laboratorio (como AWS Academy Learner Lab), todos los nombres de recursos en CloudFormation, API Gateway, Lambda, DynamoDB, S3, SNS y SQS siguen un patron estricto de identificacion:

```text
openfsm-${userCode}-${stage}-${recurso}
```

- `${userCode}`: Codigo identificador del usuario o estudiante (ejemplo: `u202112345`).
- `${stage}`: Entorno de despliegue (`dev`, `staging`, `prod`).
- `${recurso}`: Nombre descriptivo del componente (`customers`, `evidence`, `events`, `visits-queue`).

### 4.2 Convenciones de Codigo y Empaquetado Serverless
- **Eliminacion de `__init__.py` Redundantes:** En conformidad con las especificaciones de Python 3.3+ (PEP 420 - Implicit Namespace Packages) y para reducir tiempos de empaquetado y peso en las funciones Lambda, no se utilizan archivos `__init__.py` innecesarios en la estructura de los microservicios.
- **Desacoplamiento Handler / Capa de Utilidades:** Los controladores HTTP en cada microservicio (`handler.py`) actuan exclusivamente como adaptadores de entrada y salida, delegando el acceso a bases de datos, hashing y respuestas HTTP en modulos reutilizables ubicados en `back/common/` (`auth_utils.py`, `db_utils.py`, `event_utils.py`, `response_utils.py`).
- **Inmutabilidad y Pureza de Funciones:** Las funciones Lambda no retienen estado mutable en memoria entre invocaciones, garantizando que el auto-escalado horizontal sea transparente y seguro.

### 4.3 Formato Unificado de Respuestas API y CORS
Todas las respuestas generadas por los microservicios respetan un contrato JSON uniforme para simplificar el consumo desde el cliente frontend y el manejo de excepciones:

```json
{
  "success": true,
  "data": { ... },
  "message": "Operacion realizada exitosamente",
  "error": null
}
```

En caso de error:

```json
{
  "success": false,
  "data": null,
  "message": "Descripcion legible del error",
  "error": "TIPO_DE_ERROR_O_DETALLE"
}
```

Todas las respuestas incluyen cabeceras CORS preconfiguradas:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: Content-Type,Authorization,X-Tenant-Id`
- `Access-Control-Allow-Methods: OPTIONS,GET,POST,PUT,DELETE`

### 4.4 Semantica Estricta de Codigos de Estado HTTP
- `200 OK`: Consultas y actualizaciones exitosas.
- `201 Created`: Creacion exitosa de recursos (clientes, ordenes, visitas, usuarios).
- `400 Bad Request`: Peticiones con cuerpo invalido o campos obligatorios faltantes.
- `401 Unauthorized`: Peticion sin cabecera `Authorization` o con token JWT expirado/invalido.
- `403 Forbidden`: Intento de acceder a recursos pertenecientes a otro inquilino.
- `404 Not Found`: Recurso no encontrado en el tenant activo.
- `500 Internal Server Error`: Errores no controlados en la capa de servicios.

### 4.5 Practicas de Seguridad en la Nube
- **Principio de Menor Privilegio (PoLP):** La solucion esta configurada para interoperar estrictamente con el rol preexistente `arn:aws:iam::${aws:accountId}:role/LabRole`, garantizando compatibilidad con entornos restringidos sin requerir creacion de politicas IAM globales no permitidas.
- **Almacenamiento Seguro de Credenciales:** Las contraseñas de los usuarios nunca se guardan en texto plano; se utiliza derivacion criptografica PBKDF2 con algoritmo SHA-256 y un salt aleatorio de 16 bytes generado por sesion.
- **Tokens Autocontenidos Firmados:** Los tokens JWT contienen un tiempo de expiracion (`exp`) de 24 horas y los identificadores criticos del usuario (`user_id`, `tenant_id`, `role`), firmados con el algoritmo HMAC-SHA256 utilizando el secreto inyectado en variables de entorno.

### 4.6 Patrones de Resiliencia en Arquitectura Basada en Eventos
- **Desacoplamiento con SNS Fan-Out:** Los productores de eventos no conocen la cantidad ni la identidad de los consumidores. Nuevos consumidores (auditoria, facturacion, analitica) pueden suscribirse al topico sin modificar el codigo del microservicio de ordenes de trabajo.
- **Dead Letter Queue (DLQ):** La cola `FSMVisitsQueue` cuenta con una directiva de redrive que traslada los mensajes fallidos a `FSMVisitsDLQ` tras 3 intentos, evitando bucles infinitos de ejecucion y perdida de informacion.
- **Descargas y Subidas Directas a S3:** El manejo de archivos binarios pesados (fotografias y firmas) no transita por la memoria de las funciones Lambda ni por los limites de carga util de API Gateway (10 MB), sino que se delega a Amazon S3 mediante URLs prefirmadas con validez de 15 minutos.

---

## 5. Checklist de Cumplimiento

- [x] Al menos 5 microservicios serverless protegidos (API Gateway + Lambda)
- [x] Base de datos propia por microservicio (DynamoDB NoSQL y RDS Single DB, Multiple Schemas)
- [x] Al menos 30,000 registros por microservicio, divididos en 3 tenants
- [x] Amazon S3, Amazon SNS y Amazon SQS integrados en flujos de eventos
- [x] Despliegue 100% automatizado con Serverless Framework
- [x] Uso del rol institucional `LabRole` e identificador parametrizable `userCode`
- [x] Frontend en React + TypeScript preparado para despliegue en AWS Amplify
- [x] Diagrama de arquitectura de solucion y diagramas ER en [ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [x] Guia completa de variables y procedimientos de despliegue en [DEPLOY.md](docs/DEPLOY.md)
- [x] Demostracion funcional interactiva con multiples tenants
- [x] Optimizacion de empaquetado sin archivos `__init__.py` redundantes
