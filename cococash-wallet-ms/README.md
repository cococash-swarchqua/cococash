# Cococash Wallet Microservice

A Node.js microservice for managing wallets and transfers in the Cococash system.

## Setup
1. `npm install`
2. `npm start`

## Observability

### CloudWatch Logs
The application sends logs to AWS CloudWatch.
- **Log Group**: `/aws/ec2/cococash-wallet`
- **Stream Name**: Instance ID (e.g., `i-0xxxxxx`)
- **View Logs**:
  - **Console**: AWS Console -> CloudWatch -> Log groups -> `/aws/ec2/cococash-wallet`
  - **CLI**: `aws logs tail /aws/ec2/cococash-wallet --follow`

## Infrastructure Notes

### Elastic IP (EIP) Behavior
- The Elastic IP (`52.3.131.223`) is managed by Terraform.
- **Updates (`terraform apply`)**: The IP is preserved and re-associated if the instance is replaced.
- **Destruction (`terraform destroy`)**: The IP reservation is **lost**. A new random IP will be assigned on the next deploy.
- **Recommendation**: For production, manage the EIP outside of this Terraform stack (or use `terraform import`) to prevent accidental loss.

## 🏗️ Arquitectura (AWS EC2)

```
┌─────────────────────────────────────────────────────────────┐
│                    cococash-wallet-ms                       │
│                          (EC2)                              │
│                   http://IP:3000                            │
└─────────────────┬───────────────────┬───────────────────────┘
                  │                   │
          ┌───────▼─────┐     ┌───────▼─────────┐
          │   RDS       │     │      SNS        │
          │ PostgreSQL  │     │ Transfer Topic  │
          │ :5432       │     │ Account Topic   │
          └─────────────┘     └───────┬─────────┘
                                      │
                              ┌───────▼─────────┐
                              │      SQS        │
                              │ Transfer Queue  │
                              └─────────────────┘
```

## 📁 Estructura del Proyecto

```
cococash-wallet-ms/
├── infra/                  # Terraform (EC2, RDS, SNS, SQS)
│   ├── main.tf             # Definición de recursos base
│   ├── ec2.tf              # Instancia de aplicación + Elastic IP
│   ├── rds.tf              # Base de datos PostgreSQL
│   ├── messaging.tf        # SNS/SQS para async processing
│   └── user-data.sh        # Script de aprovisionamiento EC2
├── src/                    # Código fuente aplicación
│   ├── controllers/        # API endpoints
│   ├── services/           # Lógica de negocio
│   ├── repositories/       # Acceso a datos
│   ├── db/schema.sql       # Schema de base de datos
│   └── scripts/migrate.ts  # Script de migración automática
├── deploy_remote.sh        # Script de deployment en EC2
├── curl-commands.sh        # Smoke tests end-to-end
└── package.json            # Dependencias Node.js
```

## 🚀 Deployment Completo (Desde Cero)

### Paso 1: Crear Infraestructura con Terraform

```bash
# Desde la raíz del proyecto cococash
cd cococash
terraform init
terraform apply
```

**¿Qué crea Terraform?**
- ✅ VPC con subnets públicas y privadas
- ✅ EC2 (t3.micro) con **Elastic IP estática**
- ✅ RDS PostgreSQL (privada, solo accesible desde EC2)
- ✅ SNS Topics para eventos
- ✅ SQS Queue para procesamiento asíncrono
- ✅ IAM Roles y Security Groups
- ✅ SSH Key (`cococash.pem`) generada automáticamente

**Outputs importantes:**
```
ec2_public_ip = "100.28.6.31"  # ← IP ESTÁTICA (no cambia)
rds_endpoint = "cococash-wallet-db.xxx.rds.amazonaws.com:5432"
```

> **Nota:** El `user-data.sh` solo prepara el ambiente (instala Node.js, PostgreSQL client, crea `.env`). **NO despliega el código de la aplicación**.

### Paso 2: Desplegar Código de la Aplicación

**¿Por qué no está en Terraform?**
- El código cambia frecuentemente, la infraestructura no
- Terraform solo se ejecuta cuando cambia la infra
- Separar infra de código es una buena práctica de DevOps

**Deployment manual (primera vez y cada actualización de código):**

```bash
# 1. Copiar la clave SSH a WSL (solo primera vez)
cp cococash.pem ~/.ssh/
chmod 400 ~/.ssh/cococash.pem

# 2. Subir código a EC2
scp -i ~/.ssh/cococash.pem -r cococash-wallet-ms/src \
    cococash-wallet-ms/package.json \
    cococash-wallet-ms/tsconfig.json \
    ec2-user@<EC2_PUBLIC_IP>:/home/ec2-user/

# 3. Subir script de deployment
scp -i ~/.ssh/cococash.pem deploy_remote.sh ec2-user@<EC2_PUBLIC_IP>:/home/ec2-user/

# 4. Ejecutar deployment (instala deps, compila, migra DB, inicia app)
ssh -i ~/.ssh/cococash.pem ec2-user@<EC2_PUBLIC_IP> 'chmod +x deploy_remote.sh && ./deploy_remote.sh'
```

**¿Qué hace `deploy_remote.sh`?**
1. Instala dependencias (`npm install`)
2. Compila TypeScript (`npm run build`)
3. **Ejecuta migraciones automáticamente** (`npm run migrate`)
4. Inicia la aplicación en background

### Paso 3: Verificar Deployment

```bash
# Health check
curl http://<EC2_PUBLIC_IP>:3000/health

# Smoke tests completos (crea cuentas, hace transfers, verifica async processing)
cd cococash
./cococash-wallet-ms/curl-commands.sh
```

## 🧪 Smoke Tests End-to-End

El script `curl-commands.sh` ejecuta un flujo completo que verifica:

1. ✅ **Health Check** - API funcionando
2. ✅ **Account Creation** - Crear cuenta con balance inicial
3. ✅ **Balance Query** - Consultar saldo
4. ✅ **Async Transfer Flow**:
   - Crear 2 cuentas (source, destination)
   - Iniciar transfer → Publica a SNS
   - SQS consume mensaje
   - Transfer procesado asíncronamente
   - Verificar status = COMPLETED
   - Verificar balances actualizados correctamente

**Ejemplo de salida exitosa:**
```
=== Health Check ===
{"status":"healthy","service":"cococash-wallet-ms"}

=== Create Account (RF-04) ===
{"success":true,"data":{"id":"...","balance":1000}}

=== COMPLETE TRANSFER FLOW DEMO ===
Source: df088e0c-5a6b-4cc0-89e9-9d329110642e
Destination: dc63c40b-0ee8-4544-8a46-d5ce0d2e8432
Transfer status: COMPLETED
Source balance: 4750  (5000 - 250)
Destination balance: 350  (100 + 250)
```

## 📦 Base de Datos

### Migraciones Automáticas

Las migraciones se ejecutan **automáticamente** al correr `deploy_remote.sh`:

```bash
npm run migrate  # Ejecuta src/scripts/migrate.ts
```

El script:
1. Lee `src/db/schema.sql`
2. Ejecuta DDL con `IF NOT EXISTS` (idempotente)
3. Crea tablas: `accounts`, `transfers`
4. Inserta cuenta seed con balance inicial

### Acceso Manual a RDS

La base de datos está en subnet **privada**. Acceso solo vía EC2:

```bash
# 1. SSH a EC2
ssh -i ~/.ssh/cococash.pem ec2-user@<EC2_PUBLIC_IP>

# 2. Conectar a PostgreSQL
psql -h <RDS_ENDPOINT> -U cococash_admin -d cococash_wallet
# Password: (definido en terraform.tfvars)

# 3. Verificar datos
SELECT * FROM accounts;
SELECT * FROM transfers WHERE status = 'COMPLETED';
```

## 🔧 Elastic IP (IP Estática)

La instancia EC2 tiene una **Elastic IP** que **nunca cambia**, incluso si destruyes y recreas la infraestructura:

```bash
terraform destroy  # Destruye todo
terraform apply    # Recrea todo
# → La IP pública será LA MISMA
```

**Beneficios:**
- No necesitas actualizar URLs cada vez
- Gratis mientras la instancia esté corriendo
- Ideal para desarrollo y testing

**IP actual:** `100.28.6.31` (configurada en `curl-commands.sh`)

## 📊 Verificación de Integración AWS

Todos los servicios AWS están correctamente integrados:

| Servicio | Función | Verificación |
|----------|---------|--------------|
| **EC2** | Ejecuta la aplicación Node.js | `curl http://IP:3000/health` |
| **RDS** | Almacena cuentas y transfers | `psql` queries muestran datos |
| **SNS** | Publica eventos de transfers | Transfers se procesan async |
| **SQS** | Cola de procesamiento | Transfers pasan de PENDING → COMPLETED |
| **IAM** | Permisos EC2 → SNS/SQS | Aplicación puede publicar/consumir |

## 🔮 Future Improvements

**Persistent Infrastructure:**
- Extract `aws_eip` to a separate Terraform module or manage manually to avoid IP loss during full destroy/apply cycles.
- Use a dedicated `terraform_remote_state` for critical resources.
- Implement CI/CD pipelines to automate deployment.

**Enhanced Observability:**
- Create CloudWatch Dashboards for key metrics (latency, error rates).
- Set up CloudWatch Alarms for 5xx errors.

