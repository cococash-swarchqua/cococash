## Análisis completo — CocoCash Vista C&C (P2)

---

## Sistema general

### `cococash-wfe` (frontend web)

Provee la interfaz gráfica del sistema. Está desplegado como contenedor y se comunica con el resto del sistema exclusivamente a través del API Gateway mediante HTTP/REST(JSON). No tiene comunicación directa con ningún microservicio interno. En términos de despliegue en AWS, al ser un contenedor en ECS Fargate su configuración de red debe estar en una subred pública o detrás de un Application Load Balancer, con un security group que permita tráfico entrante en el puerto HTTP/HTTPS desde internet. El frontend no debería tener rol IAM con permisos sobre recursos internos de AWS; toda interacción con el backend pasa por el gateway.

Una observación del diagrama que vale documentar: se muestra una conexión directa entre `cococash-wfe` y `cococash-auth-ms`. Si esta conexión existe para el flujo de login, donde el frontend obtiene el token JWT directamente del servicio de autenticación sin pasar por el gateway, es una decisión aceptable dado que Cognito tiene su propio endpoint público, pero implica que ese flujo no pasa por las políticas de throttling y control del API Gateway. Si se decide centralizar todo por el gateway, la integración de Cognito con API Gateway se hace mediante un autorizador de tipo `COGNITO_USER_POOLS`, lo cual en Terraform se configura sobre el recurso `aws_api_gateway_authorizer`.

---

### `cococash-ag` (API Gateway)

Punto de entrada único para todas las peticiones del sistema. Realiza validación preliminar de tokens JWT, throttling de peticiones por usuario y enrutamiento hacia los microservicios internos. En AWS, Amazon API Gateway REST actúa como fachada: valida el token JWT contra el User Pool de Cognito antes de pasar la petición al microservicio destino, lo que evita que tráfico no autenticado llegue a los servicios internos.

El throttling configurable por stage y por método es un beneficio nativo relevante para un sistema financiero: protege los microservicios internos de picos de demanda o de uso abusivo sin que los microservicios tengan que implementar esa lógica ellos mismos. En Terraform, los límites de tasa se configuran en `aws_api_gateway_stage` con los atributos `throttling_burst_limit` y `throttling_rate_limit`, y se pueden refinar por método en `aws_api_gateway_method_settings`.

El API Gateway es el punto de entrada tanto para el flujo de transferencias y consulta de historial como para el flujo de descarga de PDFs. Cualquier Lambda o microservicio invocado desde el gateway solo debe aceptar tráfico originado en él, lo que se implementa con políticas de recursos en los Lambdas y con security groups que solo permitan tráfico interno desde el gateway en el caso de los contenedores ECS.

---

### `cococash-auth-ms` (servicio de autenticación) y `cococash-auth-db`

Gestiona registro, autenticación y generación de tokens JWT. La implementación real de la lógica de identidad recae en AWS Cognito, lo que significa que `cococash-auth-ms` actúa principalmente como una capa de adaptación entre la interfaz HTTP del sistema y los SDKs de Cognito. `cococash-auth-db` no es una base de datos independiente sino el User Pool de Cognito, que maneja internamente el almacenamiento de credenciales con hashing, la validación de contraseñas y la emisión de tokens.

En Terraform, el User Pool se define con `aws_cognito_user_pool` y el cliente de aplicación con `aws_cognito_user_pool_client`. El microservicio en sí, desplegado como contenedor en ECS Fargate, necesita acceso al SDK de Cognito vía credenciales IAM del rol de la tarea ECS. La integración con API Gateway para validar tokens se logra referenciando el ARN del User Pool en el autorizador del gateway; esto hace que el gateway valide el JWT automáticamente sin que el tráfico llegue al microservicio de autenticación para esas validaciones intermedias.

---

### `cococash-wallet-ms` (servicio de billetera) y `cococash-wallet-db`

Es el núcleo transaccional del sistema. Gestiona creación de billeteras, validación de saldos y ejecución de transferencias con consistencia ACID. Se conecta a `cococash-wallet-db`, que es una instancia PostgreSQL en Amazon RDS, vía PostgreSQL Wire Protocol en el puerto 5432. Publica eventos de dominio al bus de eventos principal cuando completa una transferencia.

La configuración Multi-AZ de RDS es fundamental aquí: garantiza conmutación automática ante fallos de la instancia primaria sin pérdida de datos, con tiempos de recuperación generalmente inferiores a 35 segundos. Esto es crítico para un sistema financiero donde una transferencia en vuelo no puede quedar en estado indeterminado. El cifrado en reposo debe estar habilitado sobre el volumen, las réplicas y los snapshots. En Terraform, `aws_db_instance` con `multi_az = true` y `storage_encrypted = true`. El microservicio corre en ECS Fargate con un rol de tarea que accede a las credenciales de la base de datos a través de Secrets Manager, nunca en variables de entorno en texto plano. El security group de RDS solo debe aceptar tráfico en el puerto 5432 desde el security group del contenedor de `wallet-ms`.

---

### `cococash-event-bus` (bus de eventos principal)

Desacopla al productor (`wallet-ms`) del consumidor (`transaction-ms`) en el flujo de transferencias. Compuesto por un tópico SNS y una cola SQS suscrita a ese tópico. `wallet-ms` publica eventos de transferencia completada en SNS, y `transaction-ms` los consume desde SQS a su propio ritmo sin que ambos componentes necesiten estar disponibles simultáneamente.

Debe tener DLQ configurada para eventos que fallen repetidamente en el consumo, lo que en Terraform se implementa con el atributo `redrive_policy` en `aws_sqs_queue` apuntando a una cola adicional configurada como DLQ, con un `maxReceiveCount` que define cuántos reintentos se permiten antes de mover el mensaje a la DLQ. La suscripción entre SNS y SQS se define con `aws_sns_topic_subscription` usando protocolo `sqs`, y la política de la cola SQS debe permitir que SNS escriba en ella mediante `aws_sqs_queue_policy` con la condición sobre el ARN del tópico fuente.

---

### `cococash-transaction-ms` (servicio de historial) y `cococash-transaction-db`

Consume eventos de transferencia del bus principal y registra entradas inmutables en DynamoDB. También expone endpoints REST para consulta de historial por usuario, accesibles a través del API Gateway. DynamoDB con `user_id` como partition key y `timestamp` como sort key permite consultas eficientes de historial por usuario en un rango de fechas, lo que es fundamental tanto para el flujo de consulta desde el frontend como para el flujo de generación de reportes.

La capacidad on-demand de DynamoDB es adecuada para este caso: las escrituras son impulsadas por eventos de transferencia cuyo volumen es impredecible, y las lecturas responden a la demanda del usuario. No requiere aprovisionamiento previo de capacidad, lo que alinea el costo con el uso real. En Terraform, `aws_dynamodb_table` con `billing_mode = "PAY_PER_REQUEST"`. El rol de la tarea ECS de `transaction-ms` necesita permisos `dynamodb:PutItem` para escritura y `dynamodb:Query` para las consultas de historial.

---

## Subsistema de reportes (análisis detallado)

### Paso 1 — `cococash-trigger`

Es el punto de arranque del proceso batch mensual. Implementado con Amazon EventBridge Scheduled Rules, se dispara mediante una expresión cron el primer día de cada mes. No mantiene estado ni lógica propia: su única responsabilidad es invocar al Lambda `cococash-get-accounts`. En AWS, EventBridge es un servicio completamente administrado que no requiere infraestructura de soporte; el costo de una invocación mensual es prácticamente insignificante.

En Terraform se define como `aws_cloudwatch_event_rule` con la expresión cron correspondiente y un `aws_cloudwatch_event_target` apuntando al ARN del Lambda. Se debe configurar el bloque `retry_policy` en el target para que EventBridge reintente la invocación automáticamente ante fallos transitorios del Lambda, con un número máximo de reintentos y una ventana de tiempo de reintento definidos explícitamente. Dado que es un proceso mensual, un fallo silencioso sin reintento implicaría que todos los usuarios del sistema se quedan sin reporte ese mes, lo que hace que la configuración del `retry_policy` sea una decisión de confiabilidad crítica y no un detalle opcional.

---

### Paso 2 — `cococash-get-accounts`: obtención de usuarios y publicación en el bus

Este es el paso más complejo del subsistema y merece un análisis en tres dimensiones: la fuente de datos, el mecanismo de publicación y el problema del timeout.

**Fuente de datos: obtención de usuarios vía `cococash-transaction-ms` y DynamoDB**

`cococash-get-accounts` no consulta directamente una base de datos sino que hace una petición HTTP al API Gateway, que enruta hacia `cococash-transaction-ms`. Este microservicio expone un endpoint que permite derivar el conjunto de usuarios únicos que tienen registros en `cococash-transaction-db` (DynamoDB), usando `user_id` como partition key.

La elección de esta fuente tiene una implicación de cobertura importante: solo se generarán reportes para usuarios que hayan tenido al menos una transacción en el sistema, no necesariamente en el mes en curso. Esto significa que un usuario con billetera activa pero sin movimientos históricos no aparecerá en la lista y por tanto no recibirá reporte. Esta limitación es aceptable si se acompaña de una medida en el frontend: cuando el usuario navega a la sección de reportes y no existe un PDF para el mes solicitado, el sistema puede mostrar un aviso indicando que el reporte se genera únicamente cuando existen movimientos registrados en la cuenta. Esto traslada la limitación técnica a una experiencia de usuario informada, sin necesidad de generar reportes vacíos ni de ampliar la fuente de datos.

La ventaja de usar DynamoDB como fuente indirecta para esta lista es que DynamoDB escala elásticamente y una consulta de `user_id` únicos no compite con las operaciones transaccionales ACID de `cococash-wallet-db` (RDS). Esto mantiene el proceso batch mensual completamente aislado del núcleo financiero del sistema. Desde el punto de vista de Terraform, el Lambda necesita permisos para invocar el endpoint del API Gateway (`execute-api:Invoke`), y `transaction-ms` necesita capacidad de responder a ese endpoint con una consulta eficiente sobre DynamoDB. Si el volumen de usuarios es muy grande, esta consulta debe estar paginada en la respuesta del microservicio para evitar respuestas HTTP de tamaño excesivo.

**Mecanismo de publicación y el problema del timeout de Lambda**

El Lambda `cococash-get-accounts` tiene un límite máximo de ejecución de 15 minutos en AWS. Si el sistema tiene N usuarios y el Lambda publica un mensaje SNS por usuario de forma secuencial, el tiempo total de publicación escala linealmente con N. Para sistemas con miles de usuarios, esto puede convertirse en un problema real donde el Lambda se corta antes de publicar todos los mensajes, dejando a algunos usuarios sin reporte sin que haya ningún error explícito registrado en el flujo principal.

La estrategia adecuada para este problema es la publicación en lotes. En lugar de publicar un mensaje por usuario, `cococash-get-accounts` agrupa los usuarios en lotes de aproximadamente 100 y publica un mensaje SNS por lote. Esto reduce el número de llamadas a SNS a N/100, lo que disminuye drásticamente el tiempo de ejecución del Lambda y lo mantiene muy por debajo del límite de 15 minutos incluso para volúmenes grandes de usuarios.

La cola SQS que recibe estos mensajes los mantiene de forma durable hasta que `cococash-transaction-ms` los consume. Cada mensaje de lote llega a `transaction-ms` como una unidad de trabajo que contiene los identificadores de 100 usuarios, y `transaction-ms` los procesa internamente de forma iterativa. Dado que `transaction-ms` es un contenedor ECS Fargate y no un Lambda, no tiene límite de timeout, lo que hace que sea el lugar correcto para absorber la lógica de procesamiento por usuario sin preocupaciones de tiempo de ejecución.

El segundo nivel de timeout aparece si en algún punto del diseño se considera mover parte del procesamiento de lotes a funciones Lambda adicionales. En ese caso, el `batch_size` configurado en el `aws_lambda_event_source_mapping` de Terraform determina cuántos mensajes procesa el Lambda por invocación, y ese número debe estar dimensionado para que el tiempo de procesamiento total por lote no supere el límite de ejecución. Para el diseño actual, donde `transaction-ms` es el consumidor de los lotes y es un contenedor sin timeout, esta consideración es una advertencia de diseño para decisiones futuras más que un problema inmediato.

---

### Paso 3 — `cococash-transaction-ms` como consumidor y productor en `cococash-event-bus-2`

En este flujo, `cococash-transaction-ms` cumple un doble rol sobre el mismo bus de eventos de reportes: actúa como consumidor del primer par SNS+SQS (recibe los lotes de usuarios publicados por `get-accounts`) y como productor del segundo par SNS+SQS (publica los eventos de transacciones consolidadas por usuario para que `pdf-maker` los procese).

Este doble rol es válido arquitectónicamente porque los dos tópicos son completamente independientes y el microservicio los trata como canales separados: uno de entrada y uno de salida. Sin embargo, en el diagrama conviene representarlo con dos puertos diferenciados, uno de entrada y uno de salida sobre `cococash-event-bus-2`, para evitar ambigüedad en la lectura de la vista C&C.

Por cada lote recibido, `transaction-ms` itera sobre los `user_id` del lote, consulta en DynamoDB las transacciones del mes en curso para cada usuario usando la partition key `user_id` y el sort key `timestamp` en el rango del mes, y publica un evento consolidado por usuario al segundo tópico SNS con la información de transacciones lista para generar el PDF. Este procesamiento en ECS Fargate se beneficia de no tener límite de tiempo, lo que lo convierte en el componente adecuado para la lógica más intensiva del flujo batch.

En Terraform, el rol de la tarea ECS debe incluir `sqs:ReceiveMessage`, `sqs:DeleteMessage` y `sqs:GetQueueAttributes` sobre la primera cola del bus de reportes, `dynamodb:Query` sobre `cococash-transaction-db`, y `sns:Publish` sobre el segundo tópico del bus de reportes.

---

### `cococash-event-bus-2` (bus de eventos de reportes)

Componente lógico compuesto por dos pares SNS+SQS independientes que gestionan las dos etapas del flujo de generación de reportes. La separación en dos pares responde a que los productores y consumidores de cada etapa son distintos y tienen características de procesamiento diferentes.

La decisión de mantener este bus como un componente conceptualmente separado del bus principal de transferencias (`cococash-event-bus`) es una decisión de diseño sólida. Aunque en la implementación AWS ambos buses son conjuntos de recursos SNS y SQS dentro de la misma cuenta y región, la separación conceptual hace explícito en la arquitectura que los eventos de reportes tienen un dominio, un ciclo de vida y unos SLAs distintos a los eventos transaccionales. Esto facilita decisiones futuras como mover el procesamiento de reportes a una cuenta AWS separada, aplicar políticas de retención de mensajes distintas, o escalar independientemente sin afectar el flujo principal de transferencias.

La estructura interna del bus de reportes es:

```
Par 1 — eventos de lotes de usuarios:
  SNS topic: cococash-report-users-topic
     → SQS queue: cococash-report-users-queue  [con DLQ]
        → consumidor: transaction-ms (ECS Fargate)

Par 2 — eventos de transacciones consolidadas:
  SNS topic: cococash-report-txns-topic
     → SQS queue: cococash-report-txns-queue  [con DLQ]
        → consumidor: pdf-maker (Lambda)
```

Ambas colas deben tener Dead Letter Queue configurada. Para un proceso que ocurre una sola vez al mes, un mensaje que falla repetidamente no tiene una segunda oportunidad natural de reintento dentro del ciclo mensual. Sin DLQ, ese mensaje se pierde silenciosamente y el usuario afectado simplemente no recibe su reporte sin que el equipo de operaciones tenga visibilidad del problema. Con DLQ, los mensajes fallidos quedan disponibles para inspección y reprocesamiento manual. En Terraform, esto se implementa con el atributo `redrive_policy` en `aws_sqs_queue` y una `aws_sqs_queue` adicional configurada como destino de mensajes muertos.

---

### Paso 4 — `cococash-pdf-maker` y `cococash-pdf-odb`

**`cococash-pdf-maker`**

Lambda que consume mensajes de la segunda cola del bus de reportes. Por cada mensaje, que contiene la información consolidada de transacciones de un usuario para el mes en curso, genera el documento PDF del estado de cuenta usando una librería de generación de PDF incluida en el paquete del Lambda o en un Lambda Layer compartido. Una vez generado, escribe el archivo directamente en S3 usando la convención de key `reportes/{user_id}/{año}/{mes}/reporte.pdf`.

El `aws_lambda_event_source_mapping` en Terraform conecta este Lambda con la cola SQS. El atributo `batch_size` determina cuántos mensajes procesa por invocación, y `maximum_batching_window_in_seconds` permite agrupar mensajes cuando hay múltiples disponibles simultáneamente. Ambos deben dimensionarse teniendo en cuenta el tiempo que toma generar un PDF: si generar un PDF toma en promedio X segundos y el timeout del Lambda es de 15 minutos, el `batch_size` debe ser lo suficientemente pequeño para que el procesamiento del lote completo quepa dentro del timeout.

El atributo `reserved_concurrent_executions` en `aws_lambda_function` es importante aquí: cuando `get-accounts` publica lotes para miles de usuarios y eventualmente todos esos eventos llegan a la cola de `pdf-maker`, se pueden disparar muchas invocaciones concurrentes del Lambda. Sin un límite de concurrencia reservada, estas invocaciones pueden consumir la cuota de concurrencia regional de la cuenta AWS y afectar a otros componentes del sistema que también usan Lambda, como `cococash-link-generator` o `cococash-get-accounts` en futuras ejecuciones. Establecer un límite explícito de concurrencia reservada protege al resto del sistema de este pico predecible y mensual.

El rol IAM del Lambda necesita `s3:PutObject` sobre el bucket `cococash-pdf-odb` restringido al prefijo `reportes/*`, y `sqs:ReceiveMessage`, `sqs:DeleteMessage` y `sqs:GetQueueAttributes` sobre la cola del bus de reportes.

**`cococash-pdf-odb`**

Bucket S3 que almacena todos los PDFs generados. La convención de key estructurada por `user_id`, año y mes permite aplicar políticas de ciclo de vida granulares y facilita la generación de URLs prefirmadas con alcance acotado al usuario correcto.

La política de ciclo de vida debe tener varias fases. Durante los primeros meses (por ejemplo, los primeros 90 días desde la creación del objeto), el reporte permanece en S3 Standard, que ofrece acceso inmediato con baja latencia, adecuado para usuarios que consultan reportes recientes. Después de 90 días, los objetos transicionan automáticamente a S3 Standard-IA (acceso infrecuente), que reduce el costo de almacenamiento manteniendo acceso en milisegundos para los casos en que un usuario consulte un reporte de meses anteriores. Después de un período más largo, por ejemplo 180 días o un año, los objetos transicionan a S3 Glacier Instant Retrieval, que ofrece el costo de almacenamiento más bajo mientras mantiene recuperación en milisegundos, o a S3 Glacier Flexible Retrieval si el acceso a reportes muy antiguos es prácticamente nulo y se puede tolerar latencia de minutos u horas en la recuperación.

Para un sistema de billetera digital con posible relevancia regulatoria, es preferible no configurar expiración de objetos sino únicamente transiciones entre clases de almacenamiento, de modo que los reportes se conserven indefinidamente a un costo decreciente con el tiempo. Si en el futuro se usa Glacier Flexible Retrieval y un usuario solicita un reporte muy antiguo, el flujo de `link-generator` deberá primero iniciar una restauración del objeto de Glacier (que puede tomar horas) antes de poder generar la URL prefirmada. Esta complejidad adicional vale la pena documentarla como una decisión de diseño pendiente que depende del requerimiento de acceso a reportes históricos.

En cuanto a seguridad, el bucket debe tener Block Public Access habilitado en todas sus formas: ningún objeto debe ser accesible públicamente bajo ninguna circunstancia. El cifrado en reposo se implementa con SSE-S3 como mínimo, o con SSE-KMS si el nivel de sensibilidad del sistema lo requiere; en ese caso, el rol de `link-generator` también necesita permisos sobre la llave KMS para poder firmar URLs de objetos cifrados con esa llave. La bucket policy debe restringir el acceso a los únicos dos roles que necesitan interactuar con el bucket: el rol de `pdf-maker` con permiso de escritura y el rol de `link-generator` con permiso de lectura.

En Terraform: `aws_s3_bucket`, `aws_s3_bucket_public_access_block`, `aws_s3_bucket_lifecycle_configuration` con múltiples bloques `transition`, `aws_s3_bucket_server_side_encryption_configuration`, y `aws_s3_bucket_policy` con las restricciones de acceso por rol.

---

### Paso 5 — `cococash-link-generator`: acceso al PDF bajo demanda

Lambda invocado por el API Gateway cuando el usuario solicita ver o descargar su reporte mensual. El gateway ya ha validado el token JWT del usuario antes de que la petición llegue al Lambda, por lo que el contexto del autorizador contiene el `user_id` sin que el Lambda necesite validarlo nuevamente. Con ese `user_id` y el mes solicitado por el usuario, el Lambda construye la key S3 correspondiente (`reportes/{user_id}/{año}/{mes}/reporte.pdf`) y genera una URL prefirmada con tiempo de expiración corto, típicamente 15 minutos. Esa URL se retorna al frontend, y el usuario descarga el PDF directamente desde S3 usando esa URL sin que ningún componente del sistema actúe como intermediario en la transferencia de datos.

La URL prefirmada está firmada criptográficamente con SigV4 usando las credenciales del rol IAM asumido por el Lambda en tiempo de ejecución. Esto significa que no se necesita ninguna clave explícita en el código del Lambda: el SDK de AWS genera la firma automáticamente a partir del rol de la función. La URL tiene alcance limitado al objeto específico solicitado, solo permisos de lectura, y expira automáticamente sin que ningún componente tenga que invalidarla activamente.

Esta elección se justifica sobre cuatro atributos de calidad. En rendimiento, el usuario descarga directamente desde la infraestructura de S3 optimizada para transferencia de objetos, sin intermediarios que añadan latencia o que conviertan su ancho de banda en cuello de botella ante múltiples descargas simultáneas. En seguridad, el bucket permanece con Block Public Access habilitado en todo momento, el acceso está controlado por la firma criptográfica y expira sin intervención manual, y cada URL generada solo sirve para el objeto del usuario que hizo la petición. En mantenibilidad, no se requiere ningún componente intermediario adicional que operar, monitorear, escalar o mantener; el acceso seguro a S3 se resuelve únicamente con la política IAM del Lambda y la configuración del bucket. En costo, no se incurre en doble transferencia de datos (del objeto al proxy y del proxy al cliente), lo que reduce los costos de red de forma directa y proporcional al volumen de descargas.

El rol IAM de este Lambda necesita `s3:GetObject` sobre el bucket `cococash-pdf-odb`. Idealmente, esta política debe estar restringida al prefijo `reportes/{user_id}/*` de forma dinámica basada en el `user_id` del token, lo que en la política IAM se implementa usando `s3:prefix` como condition key. Esto evita que un error en la lógica del Lambda permita generar URLs prefirmadas para objetos pertenecientes a otros usuarios.

---

## Flujo completo con relaciones y configuraciones clave

```
EventBridge (cron: 1ro de cada mes)
   ↓ invocación directa con retry_policy configurado
cococash-get-accounts (Lambda)
   ↓ HTTP/REST → API Gateway → cococash-transaction-ms
   (obtiene lista de user_id únicos con historial en DynamoDB)
   ↓ publica lotes de ~100 user_id por mensaje
cococash-report-users-topic (SNS)
   ↓ suscripción SQS
cococash-report-users-queue (SQS) [DLQ configurada, maxReceiveCount definido]
   ↓ polling por ECS Fargate
cococash-transaction-ms (ECS Fargate, sin límite de timeout)
   ↓ query por user_id + rango de fechas del mes en curso
cococash-transaction-db (DynamoDB, on-demand)
   ↓ publica evento consolidado por usuario (user_id + transacciones del mes)
cococash-report-txns-topic (SNS)
   ↓ suscripción SQS
cococash-report-txns-queue (SQS) [DLQ configurada, maxReceiveCount definido]
   ↓ event source mapping (batch_size y timeout dimensionados)
cococash-pdf-maker (Lambda) [reserved_concurrent_executions definido]
   ↓ PutObject — key: reportes/{user_id}/{año}/{mes}/reporte.pdf
cococash-pdf-odb (S3)
   [Block Public Access, cifrado SSE, lifecycle: Standard → Standard-IA → Glacier]

--- flujo de descarga bajo demanda (independiente del batch) ---

Usuario → cococash-wfe
   ↓ HTTP/REST
API Gateway (valida JWT, extrae user_id del contexto)
   ↓ invoca
cococash-link-generator (Lambda)
   ↓ construye key S3 con user_id + mes solicitado
   ↓ genera presigned URL (s3:GetObject, expiración ~15 min, firmada con SigV4)
   ↓ retorna URL al frontend
Usuario descarga directamente desde S3
   (sin intermediario, bucket permanece privado)
```

---

## Políticas IAM por componente

```
EventBridge rule
   → lambda:InvokeFunction        sobre cococash-get-accounts

cococash-get-accounts (Lambda)
   → execute-api:Invoke           sobre el endpoint del API Gateway que expone la lista de users
   → sns:Publish                  sobre cococash-report-users-topic

cococash-transaction-ms (ECS task role)
   → sqs:ReceiveMessage
     sqs:DeleteMessage
     sqs:GetQueueAttributes       sobre cococash-report-users-queue
   → dynamodb:Query               sobre cococash-transaction-db
                                  (por user_id + rango de timestamp del mes)
   → sns:Publish                  sobre cococash-report-txns-topic

cococash-pdf-maker (Lambda)
   → sqs:ReceiveMessage
     sqs:DeleteMessage
     sqs:GetQueueAttributes       sobre cococash-report-txns-queue
   → s3:PutObject                 sobre cococash-pdf-odb
                                  restringido al prefijo reportes/*

cococash-link-generator (Lambda)
   → s3:GetObject                 sobre cococash-pdf-odb
                                  restringido dinámicamente al prefijo
                                  reportes/{user_id del token}/*
```