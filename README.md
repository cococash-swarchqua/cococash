# CocoCash 🥥💸

CocoCash es una billetera digital nativa de la nube diseñada para simular transferencias monetarias y generación de extractos bancarios en un entorno seguro, altamente disponible y escalable.

## 🏗 Arquitectura General

El sistema está diseñado bajo una arquitectura de microservicios orientada a eventos, desplegada completamente en AWS:
- **Frontend**: Next.js (ECS Fargate)
- **API Gateway**: Amazon API Gateway (REST) centralizando el enrutamiento.
- **Autenticación**: AWS Cognito (JWT / User Pools)
- **Core Bancario (Wallet MS)**: Node.js + TypeScript (ECS Fargate + Amazon RDS PostgreSQL Multi-AZ)
- **Auditoría e Historial (Transaction MS)**: Go (ECS Fargate + Amazon DynamoDB)
- **Generación de Reportes PDF**: Serverless (EventBridge + SQS + AWS Lambda + S3)

> Para ver el diseño completo de Componentes y Conectores, flujos de red y estructura de Microservicios, revisa el [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## 🚀 Despliegue (Terraform)

Toda la infraestructura se define y aprovisiona usando Terraform. 

### Prerrequisitos
- AWS CLI configurado con los permisos necesarios.
- Terraform >= 1.5.0
- Docker (para el empaquetado de contenedores en ECS y Lambdas)

### Instrucciones

1. **Inicializar Terraform**
   ```bash
   terraform init
   ```
2. **Validar y Planificar**
   ```bash
   terraform validate
   terraform plan
   ```
3. **Aplicar Despliegue**
   ```bash
   terraform apply -auto-approve
   ```

*Nota: Durante el despliegue, Terraform se encargará automáticamente de construir las imágenes Docker de los microservicios y subirlas a Amazon ECR.*

## 🔒 Seguridad y Configuración

- **No hay credenciales en texto plano**: Las contraseñas de bases de datos se inyectan en tiempo de despliegue mediante variables de entorno en Terraform y se pasan a los contenedores ECS de manera segura.
- **Autenticación en el API**: Todos los endpoints del `wallet-ms` exigen un token JWT válido expedido por Cognito.
- **Bases de datos aisladas**: La instancia RDS reside en una subred privada y no es accesible desde internet.

## 🧹 Limpieza de Recursos

Para evitar cobros indeseados en AWS al finalizar pruebas:
```bash
terraform destroy
```
