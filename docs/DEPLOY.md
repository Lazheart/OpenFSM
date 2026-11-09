# Guía de despliegue de OpenFSM (AWS Academy Learner Lab)

Orden: **1) backend con Serverless Framework → 2) ingesta de datos → 3) frontend en Amplify → 4) smoke test.**

---

## 0. Prerrequisitos

| Herramienta | Versión | Nota |
| :--- | :--- | :--- |
| Node.js | 18+ | Para Serverless Framework y el frontend |
| Serverless Framework | **3.x recomendado** | `npm i -g serverless@3`. La v4 también funciona, pero exige `serverless login` |
| Python | 3.11+ | Ingesta y tests |
| AWS CLI | 2.x | Verificar credenciales |
| pnpm | 9+ | `corepack enable` (lo usa `amplify.yml`) |

> En el Learner Lab no se pueden crear roles IAM. `serverless.yml` asigna `LabRole` a **todas** las funciones; no agregues `iamRoleStatements` ni plugins que creen roles.

---

## Ruta rápida en Windows / PowerShell 5.1 (probada de punta a punta)

PowerShell 5.1 no acepta `&&`: se usa `;`. Los `$env:...` solo duran mientras la ventana esté abierta.

```powershell
# 0) Herramientas (sin admin: pnpm por npm, porque corepack falla con EPERM en Program Files)
npm i -g serverless@3 pnpm

# 1) Repo: verificar la rama ANTES de desplegar
git clone https://github.com/Lazheart/OpenFSM.git; cd OpenFSM; git branch --show-current
Select-String -Path back\serverless.yml -Pattern '^service:'   # debe decir openfsm-${env:USER_CODE, ...}

# 2) Credenciales del Learner Lab -> pegar en $HOME\.aws\credentials (incluye aws_session_token)
aws configure set region us-east-1; aws sts get-caller-identity

# 3) Backend. Guarda JWT_SECRET y USER_CODE fuera del repo para poder redesplegar
cd back
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
$env:JWT_SECRET = -join ($b | % { $_.ToString('x2') }); $env:USER_CODE = "micodigo"   # minúsculas, siempre el mismo
"JWT_SECRET=$env:JWT_SECRET`nUSER_CODE=$env:USER_CODE" | Out-File "$HOME\openfsm-secrets.txt"
serverless deploy --stage dev --region us-east-1          # copia la URL base (.../dev)

# Redeploy otro día: recuperar las variables antes del deploy
$env:JWT_SECRET = ((Get-Content "$HOME\openfsm-secrets.txt") -match '^JWT_SECRET=')[0].Split('=')[1]
$env:USER_CODE  = ((Get-Content "$HOME\openfsm-secrets.txt") -match '^USER_CODE=')[0].Split('=')[1]

# 4) Datos (~15 min para 210k registros)
cd ..\ingest; python -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt
python main.py --records-per-tenant 10000 --output dynamodb --user-code $env:USER_CODE --stage dev --region us-east-1

# 5) Frontend -> zip para Amplify "Deploy without Git"
cd ..\front; pnpm install
# OJO: Set-Content -Encoding ascii (Out-File escribe UTF-16 y Vite no lo lee)
Set-Content -Path .env.production -Encoding ascii -Value "VITE_API_BASE_URL=https://XXXX.execute-api.us-east-1.amazonaws.com/dev"
pnpm build
# OJO: usar tar.exe, NO Compress-Archive (en PS 5.1 guarda "assets\x.js" con barra invertida
# y Amplify devuelve 404 en /assets -> página en blanco)
Remove-Item openfsm-front.zip -ErrorAction SilentlyContinue
tar.exe -a -cf openfsm-front.zip -C dist (Get-ChildItem dist -Name); tar.exe -tf openfsm-front.zip
# Amplify -> Create new app -> Deploy without Git -> arrastrar el zip (actualizar: "Deploy updates")
```

---

## 1. Credenciales de AWS Academy

En el Learner Lab: **Start Lab → AWS Details → AWS CLI → Show**, y copia el bloque en `~/.aws/credentials` (perfil `default`) o expórtalo:

```bash
export AWS_ACCESS_KEY_ID="ASIA..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_SESSION_TOKEN="..."
export AWS_DEFAULT_REGION="us-east-1"
aws sts get-caller-identity
```

Las credenciales **vencen con la sesión del lab (unas 4 h)**: si un comando devuelve `ExpiredToken`, vuelve a copiarlas.

---

## 2. Backend (Serverless Framework)

### 2.1 Variables

| Variable / parámetro | Obligatoria | Descripción | Ejemplo |
| :--- | :--- | :--- | :--- |
| `JWT_SECRET` (env) | **Sí** | Secreto para firmar JWT (≥ 16 caracteres). Sin él, el deploy falla a propósito | `openssl rand -hex 32` |
| `USER_CODE` (env) | Sí | Prefijo de todos los recursos. Usar **minúsculas** (lo exige el nombre del bucket) y siempre el mismo valor | `u202112345` |
| `--stage` | No | Entorno | `dev` |
| `--region` | No | Región | `us-east-1` |
| `DEMO_USERS_ENABLED` (env) | No | `true` habilita `admin/admin123`, `dispatcher/disp123` y `tech1/tech123` en los 3 tenants aunque la tabla de usuarios esté vacía. Usa `false` fuera de la demo | `true` |

Guarda el `JWT_SECRET`: si lo cambias en un redeploy, los tokens emitidos dejan de ser válidos (basta con volver a iniciar sesión).

### 2.2 Deploy

```bash
cd back
export JWT_SECRET="$(openssl rand -hex 32)"     # guárdalo
export USER_CODE="u202112345"                  # PowerShell: $env:USER_CODE = "u202112345"
serverless deploy --stage dev --region us-east-1
```

Se crea el stack `openfsm-<userCode>-dev` con:

- 31 funciones Lambda: el authorizer, 26 endpoints HTTP, 3 workers SQS y el procesador del evento S3.
- API Gateway REST con authorizer JWT y `GatewayResponses` con CORS.
- 7 tablas DynamoDB: `customers`, `technicians`, `workorders`, `visits`, `inventory`, `notifications` (con TTL) y `users`.
- El tópico SNS `openfsm-<userCode>-dev-events`.
- 3 colas SQS con sus DLQ (`visits`, `workorders` y `notifications`) y las suscripciones con `FilterPolicy`.
- El bucket S3 privado `openfsm-<userCode>-dev-evidence-<accountId>`, con CORS y la notificación `ObjectCreated` hacia `evidenceProcessor`.

Copia el **endpoint** que imprime el deploy (`https://xxxx.execute-api.us-east-1.amazonaws.com/dev`).

### 2.3 Tests locales (opcional, sin AWS)

```bash
cd back
python -m venv .venv && source .venv/bin/activate   # en Windows: .venv\Scripts\activate
pip install boto3 pytest
python -m pytest -q
```

---

## 3. Ingesta de datos (30 000 registros por microservicio en 3 tenants)

```bash
cd ingest
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py --records-per-tenant 10000 --output dynamodb \
  --user-code "${USER_CODE}" --stage dev --region us-east-1
```

- Carga 10 000 registros por tenant en **cada una de las 7 tablas** (30 000 por tabla, 210 000 en total) con `batch_writer`. Tarda varios minutos: si el lab expira a mitad de la carga, renueva las credenciales y vuelve a ejecutar el comando (los IDs son determinísticos, así que no se duplica nada).
- Las fechas del seed terminan en el día de la ingesta, para que el panel y el tablero de despacho muestren actividad en la demo.
- Los usuarios sembrados incluyen `admin`, `dispatcher` y `tech1` con las mismas contraseñas demo.
- Prueba rápida sin AWS: `python main.py --sample --output json` genera JSON en `ingest/output/json/`.

---

## 4. Frontend (AWS Amplify Hosting)

### 4.1 Local

```bash
cd front
pnpm install
cp .env.example .env    # pon en VITE_API_BASE_URL la URL del paso 2.2
pnpm dev
```

La pantalla de login también permite pegar la URL de la API ("Configurar endpoint") y tiene un **modo demo** que funciona sin backend.

### 4.2 Amplify con repositorio Git

1. En la consola de AWS ve a **AWS Amplify → Create new app → GitHub** y elige el repositorio y la rama.
2. Marca **monorepo** con carpeta raíz `front`. Amplify detecta el `amplify.yml` de la raíz del repo, que ya está configurado.
3. En **Environment variables** agrega `VITE_API_BASE_URL` (la URL del paso 2.2) y, si quieres, `VITE_DEFAULT_TENANT=tenant-alpha`.
4. Despliega. La app usa rutas con `#`, así que no hacen falta reglas de rewrite.

### 4.3 Alternativa sin Git (si el lab no permite conectar GitHub)

```bash
cd front
echo "VITE_API_BASE_URL=https://xxxx.execute-api.us-east-1.amazonaws.com/dev" > .env.production
pnpm build
cd dist && zip -r ../openfsm-front.zip . && cd ..
```

En Amplify: **Create new app → Deploy without Git** y sube `openfsm-front.zip`.

---

## 5. Smoke test

```bash
API="https://xxxx.execute-api.us-east-1.amazonaws.com/dev"

TOKEN=$(curl -s -X POST "$API/auth/login" -H "Content-Type: application/json" \
  -d '{"tenant_id":"tenant-alpha","username":"dispatcher","password":"disp123"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")

curl -s "$API/technicians?limit=3" -H "Authorization: Bearer $TOKEN"

# EDA: orden con técnico -> visitsWorker crea la visita -> workordersWorker la pasa a SCHEDULED
curl -s -X POST "$API/workorders" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Chiller sin enfriar","customer_id":"CUST#alph-000001","assigned_technician_id":"TECH#alph-000001","priority":"EMERGENCY"}'
sleep 8
curl -s "$API/notifications?limit=5" -H "Authorization: Bearer $TOKEN"
```

Qué revisar en la consola:

- **CloudWatch Logs:** `visitsWorker`, `workordersWorker` y `notificationsWorker` deben mostrar `Processed N/N messages`.
- **SQS:** las DLQ deben estar vacías. Si una tiene mensajes, el log del worker muestra el error.
- **Aislamiento:** inicia sesión en `tenant-beta`; no debe ver nada de `tenant-alpha`.

Para la demo con 2 tenants, abre dos navegadores (o uno normal y uno en incógnito), uno con `tenant-alpha` y otro con `tenant-beta`.

---

## 6. Eliminar recursos

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
aws s3 rm "s3://openfsm-${USER_CODE}-dev-evidence-${ACCOUNT}" --recursive   # el bucket debe estar vacío
cd back && serverless remove --stage dev --region us-east-1   # con USER_CODE y JWT_SECRET exportados
```

Después elimina la app de Amplify desde la consola.
