# OpenFSM: Open Field Service Management

OpenFSM es una solucion tecnologica Software as a Service (SaaS) multinquilino, serverless y basada en eventos (EDA) desplegada en Amazon Web Services (AWS). Esta disenada para la coordinacion de tecnicos, visitas de campo, ordenes de trabajo e inventario en empresas de servicios tecnicos.

---

## 1. Estructura del Repositorio

El proyecto mantiene la estructura requerida de tres subsistemas principales:

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
│   ├── src/                   # Codigo fuente con soporte para Demo de 2 o mas tenants
│   ├── package.json           # Dependencias y scripts de compilacion
│   └── .env.example           # Variables de entorno para conexion al API Gateway
├── ingest/                    # Motor de generacion e ingesta de datos sinteticos (Python)
│   ├── main.py                # CLI de generacion (>= 30,000 registros por microservicio en 3 tenants)
│   ├── generator.py           # Generador de datos sinteticos con coherencia relacional
│   ├── dynamodb_loader.py     # Ingestor por lotes directo a Amazon DynamoDB (batch_writer)
│   ├── json_exporter.py       # Exportador a archivos JSON locales
│   ├── sql_exporter.py        # Exportador a script SQL para RDS (Single DB, Multiple Schemas)
│   ├── requirements.txt       # Dependencias del generador
│   └── sql/
│       └── schema_tenant_rds.sql # DDL de base de datos relacional para RDS
└── docs/
    └── ARCHITECTURE.md        # Documentacion tecnica detallada, diagramas de arquitectura y ER
```

---

## 2. Requisitos de Arquitectura Cumplidos

1. **Multi-Tenancy:**
   - Aislamiento logico garantizado en runtime mediante tokens JWT firmados con HMAC-SHA256 y validados por un API Gateway Lambda Token Authorizer.
   - Particionamiento en DynamoDB por clave de particion `tenant_id`.
   - Soporte relacional en RDS con el patron Single Database, Multiple Schemas (`tenant_alpha`, `tenant_beta`, `tenant_gamma`).
2. **Serverless:**
   - 100% implementado con AWS Lambda y Amazon API Gateway en Python 3.11.
   - Tablas DynamoDB con modo de facturacion bajo demanda (`PAY_PER_REQUEST`).
3. **Arquitectura Basada en Eventos (EDA):**
   - **Amazon SNS:** Publicacion de eventos de dominio (`WorkOrderCreated`, `WorkOrderStatusChanged`).
   - **Amazon SQS:** Cola suscrita al topico SNS con Dead Letter Queue (DLQ) para desacoplar el auto-agendamiento de visitas.
   - **Amazon S3:** Bucket para almacenamiento de fotos de inspeccion, reportes tecnicos y firmas digitales mediante URLs prefirmadas.
4. **Despliegue Automatizado con Serverless Framework:**
   - Integracion obligatoria con el rol institucional `arn:aws:iam::${aws:accountId}:role/LabRole`.
   - Prefijado de todos los recursos CloudFormation con el codigo del usuario que despliega (`userCode`).

---

## 3. Microservicios del Backend

El backend se compone de 5 microservicios de dominio protegidos, mas el modulo de autenticacion y autorizacion:

| Microservicio | Responsabilidad | Base de Datos NoSQL | Base de Datos SQL |
| :--- | :--- | :--- | :--- |
| **Auth & Authorizer** | Emision de tokens JWT y autorizacion en API Gateway | Tabla `users` | N/A |
| **Customers** | Directorio de clientes, sedes y tipos de contrato | Tabla `customers` | Esquema `customers` |
| **Technicians** | Perfil tecnico, certificaciones, disponibilidad y GPS | Tabla `technicians` | Esquema `technicians` |
| **Work Orders** | Ciclo de vida de ordenes y publicacion en SNS | Tabla `workorders` | Esquema `work_orders` |
| **Visits** | Agendamiento, checklist, fotos en S3 y worker SQS | Tabla `visits` | Esquema `visits` |
| **Inventory** | Catalogo de repuestos y descuento de existencias | Tabla `inventory` | Esquema `inventory_items` |

### Rutas API Principales

- Publicas:
  - `POST /auth/login`: Autenticacion por tenant y emision de token Bearer.
  - `POST /auth/register`: Registro de usuario en tenant.
- Protegidas con Lambda Token Authorizer:
  - `GET /auth/me`: Validacion de sesion y claims.
  - `GET /customers`, `POST /customers`, `GET /customers/{id}`, `DELETE /customers/{id}`.
  - `GET /technicians`, `POST /technicians`, `GET /technicians/{id}`, `PUT /technicians/{id}/status`.
  - `GET /workorders`, `POST /workorders`, `GET /workorders/{id}`, `PUT /workorders/{id}/status`.
  - `GET /visits`, `POST /visits`, `GET /visits/{id}`, `PUT /visits/{id}/complete`.
  - `POST /visits/evidence-url`: Genera URL prefirmada PUT para carga en S3.
  - `GET /inventory`, `POST /inventory`, `GET /inventory/{id}`, `POST /inventory/consume`.

---

## 4. Guia de Despliegue con Serverless Framework

### Requisitos Previos
- Node.js (v18+) y Serverless Framework instalado (`npm install -g serverless` o `pnpm add -g serverless`).
- Credenciales de AWS configuradas en la terminal (ejemplo: credenciales de AWS Academy Learner Lab).

### Paso 1: Configurar Variables y Validar Sintaxis
El archivo `serverless.yml` utiliza el rol existente `LabRole` e incorpora el codigo de usuario:

```bash
cd back

# Opcional: configurar variable de entorno para el codigo de usuario
export USER_CODE="u202112345"
```

### Paso 2: Desplegar el Backend
Ejecutar el despliegue indicando la etapa y el codigo de usuario:

```bash
serverless deploy --stage dev --param="userCode=u202112345" --region us-east-1
```

Al finalizar, Serverless Framework desplegara la API REST en API Gateway, las funciones Lambda, las 6 tablas DynamoDB, el bucket S3, el topico SNS y la cola SQS con su DLQ.

---

## 5. Ingesta de Datos Sinteticos (30,000 Registros por Microservicio)

El modulo `ingest/` permite generar 150,000 registros sinteticos en total (30,000 por microservicio, repartidos equitativamente en 10,000 por cada uno de los 3 tenants).

### Opciones de Ejecucion

Crear el entorno virtual e instalar dependencias:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r ingest/requirements.txt
```

#### Modo 1: Generar Archivos JSON Locales (Uso Offline / Evaluacion)
Genera 30,000 registros por microservicio en archivos JSON dentro de `ingest/output/json/`:
```bash
python ingest/main.py --records-per-tenant 10000 --output json
```

#### Modo 2: Generar Script SQL para Amazon RDS
Genera el script SQL de insercion con esquemas `tenant_alpha`, `tenant_beta` y `tenant_gamma`:
```bash
python ingest/main.py --records-per-tenant 10000 --output sql
```
El archivo resultante se ubica en `ingest/output/sql/seed_rds.sql`.

#### Modo 3: Carga Directa por Lotes a DynamoDB en AWS
Carga los registros directamente a las tablas DynamoDB desplegadas:
```bash
python ingest/main.py --records-per-tenant 10000 --output dynamodb --user-code u202112345 --stage dev
```

#### Modo Rapido (Muestra de Validacion):
Para pruebas instantaneas con 100 registros por tenant (1,500 registros en total):
```bash
python ingest/main.py --sample --output all --user-code u202112345
```

---

## 6. Frontend y Despliegue en AWS Amplify

La aplicacion frontend en `front/` esta construida con React 19, TypeScript y Vite. Dispone de un selector de inquilino para la demo con multiples tenants (`tenant-alpha`, `tenant-beta`, `tenant-gamma`), emulacion de autenticacion y creacion de ordenes de trabajo.

### Ejecucion Local
```bash
cd front
pnpm install
pnpm dev
```

### Compilacion de Produccion
```bash
cd front
pnpm build
```

### Despliegue en AWS Amplify
1. Conectar el repositorio de Git en la consola de AWS Amplify Hosting.
2. Seleccionar la carpeta base `front`.
3. Configurar los comandos de construccion:
   ```yaml
   version: 1
   frontend:
     phases:
       preBuild:
         commands:
           - corepack enable
           - pnpm install
       build:
         commands:
           - pnpm run build
     artifacts:
       baseDirectory: dist
       files:
         - '**/*'
     cache:
       paths:
         - node_modules/**/*
   ```
4. Guardar y desplegar.

---

## 7. Ejecucion de Pruebas Unitarias

El backend incluye pruebas unitarias que validan la generacion y decodificacion de tokens JWT, hashing seguro de contraseñas, validacion del autorizador Lambda y rechazo de solicitudes no autorizadas:

```bash
python3 -m unittest discover -s back/tests
```

---

## 8. Checklist de Cumplimiento

- [x] Al menos 5 microservicios serverless protegidos (API Gateway + Lambda)
- [x] Base de datos propia por microservicio (DynamoDB y RDS Single DB, Multiple Schemas)
- [x] Al menos 30,000 registros por microservicio, divididos en 3 tenants
- [x] S3, SNS y SQS integrados en flujos de eventos
- [x] Despliegue 100% automatizado con Serverless Framework
- [x] Uso mandatorio de LabRole e identificador de usuario (`userCode`)
- [x] Frontend listo para compilacion y despliegue en AWS Amplify
- [x] Diagrama de arquitectura de solucion y diagramas ER en Mermaid
- [x] Demo funcional con 2 o mas tenants
- [x] Documentacion completa sin emojis en formato Markdown
