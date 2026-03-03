# Transfer Flow - CocoCash Wallet MS

Documentación del flujo de transferencias event-driven.

## Diagrama de Secuencia

```mermaid
sequenceDiagram
    participant User
    participant API as API Gateway
    participant WalletMS as Wallet MS
    participant RDS as PostgreSQL
    participant SNS as SNS Topic
    participant SQS as SQS Queue
    participant Consumer as SQS Consumer

    User->>API: POST /transfers
    API->>WalletMS: initiateTransfer()
    
    Note over WalletMS: RF-08: Validate request
    WalletMS->>RDS: Check accounts exist
    WalletMS->>RDS: Check source balance
    
    WalletMS->>RDS: INSERT transfer (PENDING)
    WalletMS->>SNS: Publish transfer.initiated
    WalletMS-->>API: 202 Accepted
    API-->>User: transferId + PENDING
    
    Note over SNS,SQS: Async event delivery
    SNS->>SQS: Route event to queue
    
    Consumer->>SQS: Poll messages
    SQS-->>Consumer: transfer.initiated event
    
    Note over Consumer,RDS: RF-10: Row-level locking
    Consumer->>RDS: BEGIN TRANSACTION
    Consumer->>RDS: SELECT ... FOR UPDATE (ordered)
    
    alt Balance sufficient
        Consumer->>RDS: Debit source account
        Consumer->>RDS: Credit destination account
        Consumer->>RDS: UPDATE transfer (COMPLETED)
        Consumer->>RDS: COMMIT
        Consumer->>SNS: Publish transfer.completed
    else Insufficient balance
        Consumer->>RDS: UPDATE transfer (FAILED)
        Consumer->>RDS: COMMIT
        Consumer->>SNS: Publish transfer.failed
    end
    
    Consumer->>SQS: Delete message
```

## Flujo Paso a Paso

### 1. Iniciación (Síncrono)
- Usuario envía POST /transfers
- **RF-08**: Validación de request (cuentas existen, balance suficiente)
- Crear registro de transfer con status `PENDING`
- **RF-14**: Publicar `transfer.initiated` a SNS
- Retornar 202 Accepted inmediatamente

### 2. Procesamiento (Asíncrono)
- SQS recibe evento de SNS
- Consumer poll con long-polling (20s)
- **RF-10**: Concurrencia y consistencia:
  - `BEGIN TRANSACTION`
  - `SELECT ... FOR UPDATE` (ordenado por ID para evitar deadlocks)
  - Validar balance nuevamente (con lock)
  
### 3. Actualización de Balances
- **RF-11**: 
  - Debitar cuenta origen
  - Acreditar cuenta destino
  - Actualizar status a `COMPLETED`
- `COMMIT TRANSACTION`
- Publicar `transfer.completed`

### 4. Manejo de Errores
- Si balance insuficiente → status `FAILED`
- Si error de sistema → mensaje vuelve a SQS (visibility timeout)
- Después de 3 reintentos → mensaje va a DLQ

## RFs Cubiertos

| RF | Descripción | Componente |
|----|-------------|------------|
| RF-07 | Iniciar transferencia | transfer.controller |
| RF-08 | Validar request | transfer.service |
| RF-09 | Procesamiento async | SQS consumer |
| RF-10 | Concurrencia | SELECT FOR UPDATE |
| RF-11 | Actualizar balances | transfer.service |
| RF-14 | Eventos de dominio | SNS publisher |
