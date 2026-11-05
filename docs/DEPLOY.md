# Guia de Despliegue de OpenFSM

Este documento detalla todas las variables de entorno, parametros de configuracion, prerrequisitos y procedimientos paso a paso necesarios para desplegar la solucion OpenFSM en Amazon Web Services (AWS) utilizando Serverless Framework, Amazon DynamoDB, Amazon S3, Amazon SNS, Amazon SQS y AWS Amplify.

---

## 1. Tabla Maestra de Variables de Entorno y Parametros

A continuacion se presentan todas las variables necesarias para el despliegue del backend, ejecucion del motor de ingesta de datos y configuracion del frontend.

### 1.1 Variables de Credenciales de AWS (Entorno Global / Terminal)

Estas variables autentican al usuario ante AWS CLI, Boto3 y Serverless Framework. Son indispensables al trabajar en entornos como AWS Academy Learner Lab.

| Variable | Tipo | Descripcion | Requerida | Valor por Defecto / Ejemplo |
| :--- | :--- | :--- | :--- | :--- |
| `AWS_ACCESS_KEY_ID` | String | Clave de acceso temporal o permanente de AWS. | Si | `ASIAXXXXXXXXXXXXXXXX` |
| `AWS_SECRET_ACCESS_KEY` | String | Clave secreta asociada a la clave de acceso. | Si | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `AWS_SESSION_TOKEN` | String | Token de sesion temporal (obligatorio en AWS Learner Lab). | Si (en Lab) | `IQoJb3JpZ2luX2VjEAEaCXVzLWVhc3QtMS...` |
| `AWS_DEFAULT_REGION` | String | Region de AWS por defecto para el despliegue. | Opcional | `us-east-1` |
| `AWS_REGION` | String | Alias de region utilizado por clientes Boto3. | Opcional | `us-east-1` |

### 1.2 Parametros y Variables del Backend (Serverless Framework)

Definidas en `back/serverless.yml` o inyectadas via linea de comandos (`--param`, `--stage`, `--region`).

| Variable / Parametro | Origen | Descripcion | Requerida | Valor por Defecto |
| :--- | :--- | :--- | :--- | :--- |
| `userCode` | `--param="userCode=..."` o env `USER_CODE` | Identificador de usuario o codigo de estudiante para prefijar y aislar todos los recursos creados en AWS. | Si | `u202112345` |
| `stage` | `--stage <nombre>` o env `STAGE` | Etapa de despliegue (`dev`, `staging`, `prod`). | Opcional | `dev` |
| `region` | `--region <region>` | Region geografica de AWS para los recursos. | Opcional | `us-east-1` |
| `JWT_SECRET` | Variable de entorno | Clave secreta usada para firmar y validar tokens JWT en el autorizador. | Opcional | `openfsm-jwt-secret-academic-lab-2026` |
| `role` (IAM) | CloudFormation | ARN del rol IAM con permisos de ejecucion. Configurado para usar el rol de AWS Academy Lab. | Fijo | `arn:aws:iam::${aws:accountId}:role/LabRole` |

#### Recursos de Infraestructura Derivados Automatica y Dinamicamente:

Los nombres de los recursos se construyen en `serverless.yml` a partir de `userCode` y `stage`:

- **Tabla Clientes:** `openfsm-${userCode}-${stage}-customers`
- **Tabla Tecnicos:** `openfsm-${userCode}-${stage}-technicians`
- **Tabla Ordenes de Trabajo:** `openfsm-${userCode}-${stage}-workorders`
- **Tabla Visitas:** `openfsm-${userCode}-${stage}-visits`
- **Tabla Inventario:** `openfsm-${userCode}-${stage}-inventory`
- **Tabla Usuarios (Auth):** `openfsm-${userCode}-${stage}-users`
- **Bucket S3 de Evidencias:** `openfsm-${userCode}-${stage}-evidence`
- **Topico SNS:** `openfsm-${userCode}-${stage}-events`
- **Cola SQS Visitas:** `openfsm-${userCode}-${stage}-visits-queue`
- **Cola DLQ Visitas:** `openfsm-${userCode}-${stage}-visits-dlq`

### 1.3 Parametros del Motor de Ingesta Sintetica (`ingest/`)

Utilizados por `ingest/main.py` para generar y cargar los registros sinteticos (>= 30,000 por microservicio divididos en 3 tenants).

| Argumento CLI | Variable de Entorno | Descripcion | Requerida | Valor por Defecto |
| :--- | :--- | :--- | :--- | :--- |
| `--records-per-tenant` | N/A | Cantidad de registros por tenant por microservicio. 10,000 genera 30,000 por microservicio. | Opcional | `10000` |
| `--output` | N/A | Destino de exportacion (`all`, `json`, `sql`, `dynamodb`). | Opcional | `all` |
| `--user-code` | `USER_CODE` | Prefijo de las tablas DynamoDB destino. | Si (en carga a AWS) | `u202112345` |
| `--stage` | `STAGE` | Etapa del despliegue asociada a las tablas DynamoDB. | Opcional | `dev` |
| `--region` | `AWS_REGION` | Region de AWS de las tablas DynamoDB. | Opcional | `us-east-1` |
| `--sample` | N/A | Bandera para generacion rapida de prueba (100 registros por tenant, 1,500 en total). | Opcional | `false` |
| `--output-dir` | N/A | Directorio local donde se guardan archivos JSON y SQL generados. | Opcional | `ingest/output` |

### 1.4 Variables de Entorno del Frontend (`front/`)

Configuradas en `front/.env` para la ejecucion local o inyectadas en AWS Amplify Hosting como variables de entorno de aplicacion.

| Variable | Descripcion | Requerida | Ejemplo de Valor |
| :--- | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | URL base del API Gateway desplegado con Serverless Framework. | Si | `https://abc123xyz.execute-api.us-east-1.amazonaws.com/dev` |
| `VITE_DEFAULT_TENANT` | Identificador del inquilino predeterminado al inicializar la sesion. | Opcional | `tenant-alpha` |

---

## 2. Prerrequisitos de Software

Antes de iniciar el despliegue, asegurese de contar con las siguientes herramientas instaladas y configuradas:

1. **Node.js:** Version 18.x o superior (`node -v`).
2. **Gestor de Paquetes:** `npm` o `pnpm` (`pnpm -v`).
3. **Serverless Framework CLI:** Version 3.x o 4.x (`serverless -v`).
4. **Python:** Version 3.11 o superior (`python3 -v`).
5. **AWS CLI:** Version 2.x (`aws --version`).

---

## 3. Procedimiento de Despliegue Paso a Paso

### Paso 1: Exportar Credenciales de AWS en la Terminal

Si utiliza AWS Academy Learner Lab, copie el bloque de credenciales desde el panel de control de la sesion:

```bash
export AWS_ACCESS_KEY_ID="ASIA..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_SESSION_TOKEN="IQoJb3Jp..."
export AWS_DEFAULT_REGION="us-east-1"
```

Verifique la identidad autenticada:

```bash
aws sts get-caller-identity
```

### Paso 2: Despliegue del Backend Serverless

1. Navegue al directorio `back/`:
   ```bash
   cd back
   ```

2. Defina su codigo de usuario y ejecute el despliegue:
   ```bash
   export USER_CODE="u202112345"
   export JWT_SECRET="miClaveSecretaUltraSegura2026"

   serverless deploy --stage dev --param="userCode=${USER_CODE}" --region us-east-1
   ```

3. Al concluir la ejecucion, Serverless Framework desplegara:
   - El stack de CloudFormation `openfsm-${USER_CODE}-dev`.
   - Las 21 funciones Lambda asociadas a los microservicios y autorizador.
   - La API REST en Amazon API Gateway.
   - Las 6 tablas Amazon DynamoDB con particionamiento `tenant_id`.
   - El bucket Amazon S3 para evidencias con configuracion de CORS.
   - El topico Amazon SNS y la cola Amazon SQS con su DLQ.
   - La URL base de los endpoints (anote esta URL para la configuracion del frontend).

### Paso 3: Ingesta Masiva de Datos Sinteticos

Para dar cumplimiento al requisito de minimo 30,000 registros por microservicio divididos en 3 tenants:

1. Ingrese a la carpeta `ingest/`:
   ```bash
   cd ../ingest
   ```

2. Cree y active el entorno virtual de Python:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Opcion A: Carga Directa a Amazon DynamoDB en AWS:**
   ```bash
   python main.py \
     --records-per-tenant 10000 \
     --output dynamodb \
     --user-code u202112345 \
     --stage dev \
     --region us-east-1
   ```
   Esto insertara 10,000 registros por inquilino (`tenant-alpha`, `tenant-beta`, `tenant-gamma`) por cada uno de los 5 microservicios (150,000 registros en total) usando lotes optimizados con `batch_writer`.

4. **Opcion B: Generacion de Scripts SQL para Amazon RDS:**
   ```bash
   python main.py \
     --records-per-tenant 10000 \
     --output sql
   ```
   El archivo generado estara en `ingest/output/sql/seed_rds.sql` con sintaxis compatible para el patron Single Database, Multiple Schemas (`tenant_alpha`, `tenant_beta`, `tenant_gamma`).

5. **Opcion C: Generacion de Archivos JSON Locales:**
   ```bash
   python main.py \
     --records-per-tenant 10000 \
     --output json
   ```
   Los archivos se almacenaran en `ingest/output/json/` para inspeccion y evaluacion estatica.

### Paso 4: Configuracion y Despliegue del Frontend

#### Ejecucion y Prueba Local

1. Navegue al directorio `front/`:
   ```bash
   cd ../front
   ```

2. Instale dependencias:
   ```bash
   pnpm install
   ```

3. Cree el archivo de variables locales `.env`:
   ```bash
   cp .env.example .env
   ```
   Edite `.env` y reemplace `VITE_API_BASE_URL` con la URL provista por el despliegue de Serverless Framework:
   ```env
   VITE_API_BASE_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev
   VITE_DEFAULT_TENANT=tenant-alpha
   ```

4. Inicie el servidor de desarrollo:
   ```bash
   pnpm dev
   ```

#### Despliegue en AWS Amplify Hosting

1. Cree la compilacion de produccion:
   ```bash
   pnpm build
   ```
2. En la consola de AWS, dirijase a **AWS Amplify Hosting**.
3. Seleccione **Host web app** y vincule su repositorio de Git (GitHub / CodeCommit).
4. Indique la subcarpeta de la aplicacion: `front`.
5. En la seccion de variables de entorno de compilacion (Environment Variables), agregue:
   - `VITE_API_BASE_URL`: `https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev`
   - `VITE_DEFAULT_TENANT`: `tenant-alpha`
6. Configure la especificacion de compilacion (`amplify.yml`):
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
7. Guarde y despliegue. Amplify generara un dominio publico HTTPS para la aplicacion.

---

## 4. Verificacion y Smoke Testing Post-Despliegue

### 4.1 Registro y Autenticacion de Usuario

```bash
# Registro de usuario administrador para tenant-alpha
curl -X POST https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "tenant-alpha",
    "email": "admin@alpha.com",
    "password": "Password123!",
    "name": "Admin Tenant Alpha",
    "role": "admin"
  }'

# Inicio de sesion para obtener el JWT Token
TOKEN=$(curl -s -X POST https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "tenant-alpha",
    "email": "admin@alpha.com",
    "password": "Password123!"
  }' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo "Token JWT obtenido: $TOKEN"
```

### 4.2 Verificacion de Acceso Protegido y Multi-Tenancy

```bash
# Validacion del token mediante el autorizador
curl -X GET https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev/auth/me \
  -H "Authorization: Bearer $TOKEN"

# Consulta de tecnicos del tenant autenticado
curl -X GET https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev/technicians \
  -H "Authorization: Bearer $TOKEN"
```

### 4.3 Verificacion de Eventos SNS y SQS

1. Cree una orden de trabajo mediante el endpoint protegido:
   ```bash
   curl -X POST https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev/workorders \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "title": "Mantenimiento Preventivo Chiller Central",
       "description": "Revision trimestral y cambio de filtros",
       "priority": "HIGH",
       "customer_id": "CUST#tena-000001",
       "assigned_technician_id": "TECH#tena-000001"
     }'
   ```
2. La creacion publica el evento `WorkOrderCreated` en el topico SNS `openfsm-${USER_CODE}-dev-events`.
3. El topico SNS retransmite el evento a la cola SQS `openfsm-${USER_CODE}-dev-visits-queue`.
4. La funcion Lambda `visitsSqsWorker` consume el mensaje desde la cola e inicializa de manera desacoplada la visita de campo correspondiente.

### 4.4 Verificacion de Almacenamiento en S3 con URLs Prefirmadas

```bash
# Solicitar URL prefirmada para carga de evidencia fotografica
curl -X POST https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev/visits/evidence-url \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "visit_id": "VIS#001",
    "filename": "inspeccion_compresor.jpg",
    "content_type": "image/jpeg"
  }'
```
La respuesta entregara la URL prefirmada `upload_url` de tipo PUT hacia el bucket S3 para cargar el archivo directamente desde el cliente sin recargar la funcion Lambda.

---

## 5. Destruccion de Recursos (Teardown)

Para eliminar todos los recursos desplegados en AWS y evitar consumos no deseados de saldo o cuota:

1. Vaciar el bucket S3 (AWS CloudFormation requiere que los buckets esten vacios antes de borrarlos):
   ```bash
   aws s3 rm s3://openfsm-${USER_CODE}-dev-evidence --recursive
   ```

2. Eliminar el stack serverless del backend:
   ```bash
   cd back
   serverless remove --stage dev --param="userCode=${USER_CODE}" --region us-east-1
   ```

3. Eliminar la aplicacion de AWS Amplify Hosting desde la consola web.

