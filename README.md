# OpenFSM: Open Field Service Management

SaaS **multi-tenant**, **serverless** y **orientado a eventos** sobre AWS para coordinar técnicos, visitas en campo, órdenes de trabajo, inventario de repuestos y notificaciones. Proyecto final de CS2032 Cloud Computing (UTEC). El tipo de SaaS asignado es **FSM** y las referencias de industria son Salesforce Field Service, ServiceTitan y Jobber.

- **Arquitectura, eventos y diseño de datos:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Despliegue paso a paso en AWS Academy:** [docs/DEPLOY.md](docs/DEPLOY.md)

---

## Stack

| Capa | Tecnología |
| :--- | :--- |
| Frontend | React 19 + TypeScript + Vite, desplegado en **AWS Amplify Hosting** |
| API | **Amazon API Gateway** (REST) con un **Lambda authorizer** que valida un JWT HS256 |
| Cómputo | **AWS Lambda** (Python 3.11): 6 microservicios + Auth, 3 workers SQS y 1 procesador de eventos S3 |
| Datos | **Amazon DynamoDB**, una tabla por microservicio, con partición `tenant_id`. **No se usa RDS** |
| Eventos | **Amazon SNS** (1 tópico de dominio) y **Amazon SQS** (3 colas con DLQ y `FilterPolicy`) |
| Archivos | **Amazon S3**: bucket privado de evidencias con URLs prefirmadas y evento `ObjectCreated` |
| IaC | **Serverless Framework**, todo con `LabRole` (compatible con AWS Academy) |

## Microservicios

| # | Servicio | Tabla | Eventos que publica | Eventos que consume |
| :-: | :--- | :--- | :--- | :--- |
| 1 | Customers | `customers` | — | — |
| 2 | Technicians | `technicians` | `TechnicianStatusChanged` | — |
| 3 | Work Orders | `workorders` | `WorkOrderCreated`, `WorkOrderStatusChanged` | `VisitScheduled`, `VisitStatusChanged`, `VisitCompleted` |
| 4 | Visits | `visits` | `VisitScheduled`, `VisitStatusChanged`, `VisitCompleted`, `EvidenceUploaded` | `WorkOrderCreated`, S3 `ObjectCreated` |
| 5 | Inventory | `inventory` | `PartConsumed`, `InventoryLowStock` | — |
| 6 | Notifications | `notifications` | — | Todos |
| — | Auth | `users` | — | — |

## Estructura

```text
OpenFSM/
├── amplify.yml                 # Build de Amplify (monorepo, appRoot: front)
├── back/                       # Backend serverless (Python)
│   ├── serverless.yml          # Lambdas, API, DynamoDB, SNS, SQS+DLQ, S3, GatewayResponses
│   ├── common/                 # auth_utils, http_utils, db_utils, event_utils, sqs_utils, response_utils
│   ├── auth/                   # login / register / me + Lambda authorizer
│   ├── customers/  technicians/  inventory/
│   ├── workorders/             # handler.py (API) + worker.py (SQS)
│   ├── visits/                 # handler.py (API) + worker.py (SQS) + evidence.py (evento S3)
│   ├── notifications/          # worker SQS + GET /notifications
│   └── tests/                  # pytest, sin AWS
├── front/                      # SPA: panel, despacho (Gantt), órdenes, visitas, clientes, técnicos, inventario, eventos
├── ingest/                     # Generador y carga de datos sintéticos (30k por microservicio, 3 tenants)
└── docs/                       # ARCHITECTURE.md, DEPLOY.md
```

## Inicio rápido

```bash
# Backend
cd back && export JWT_SECRET="$(openssl rand -hex 32)" && export USER_CODE=u202112345
serverless deploy --stage dev --region us-east-1

# Datos (7 tablas × 30,000 registros)
cd ../ingest && pip install -r requirements.txt
python main.py --output dynamodb --user-code u202112345

# Frontend
cd ../front && pnpm install && pnpm dev
```

Cuentas demo (en cada tenant: `tenant-alpha`, `tenant-beta` y `tenant-gamma`):

| Usuario | Contraseña | Rol |
| :--- | :--- | :--- |
| `admin` | `admin123` | ADMIN |
| `dispatcher` | `disp123` | DISPATCHER |
| `tech1` | `tech123` | TECHNICIAN |

## Checklist de la rúbrica

- [x] ≥ 5 microservicios serverless protegidos (API Gateway + Lambda + authorizer JWT): son 6, más Auth
- [x] Base de datos propia por microservicio: DynamoDB, con la estructura JSON de cada uno en ARCHITECTURE §6
- [x] ≥ 30,000 registros por microservicio en 3 tenants (`ingest/`)
- [x] S3, SNS y SQS integrados en flujos de eventos: 9 tipos de evento, 3 colas con DLQ y un evento S3
- [x] Despliegue automatizado con Serverless Framework
- [x] Frontend desplegable en Amplify (`amplify.yml`)
- [x] Diagrama de arquitectura de solución (ARCHITECTURE §2)
- [ ] Demo con 2 tenants, informe y PPT (los prepara el equipo)
