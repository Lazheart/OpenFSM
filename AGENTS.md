# Proyecto Final 
**Tipo de SaaS:** FSM (Field Service Management)

## 1. Objetivo
Implementar una Solución Tecnológica **Software as a Service (SaaS)** en AWS, de tipo **FSM**: coordina técnicos, visitas, órdenes de trabajo y servicios en campo.
Referencias: Salesforce Field Service, ServiceTitan, Jobber.

**Competencia 4.1 (nivel 3):** crear, seleccionar, adaptar y aplicar técnicas, recursos y herramientas modernas para la práctica de la computación y comprender sus limitaciones.

## 3. Requisitos de arquitectura
- [ ] **Multi-tenancy**
- [ ] **Serverless**
- [ ] **Basada en eventos (EDA)**
- [ ] Todo desplegado en **AWS**
- [ ] Funcionalidades basadas en el dominio FSM (técnicos, visitas, órdenes de trabajo, servicios en campo)

## 4. Requisitos de BackEnd
- [ ] Mínimo **5 microservicios serverless protegidos** (API Gateway + Lambda).
- [ ] Cada microservicio con **su propia base de datos**:
  - **SQL:** un único **RDS** con el patrón *BD Multi-tenancy – Patrón 2: Single Database, Multiple Schemas*. Presentar **Diagrama Entidad-Relación** por microservicio.
  - **NoSQL:** **DynamoDB**. Presentar **estructura JSON** por microservicio.
- [ ] Mínimo **30,000 registros ficticios por microservicio**, divididos en **3 tenants**.
- [ ] Usar adicionalmente **S3, SNS y SQS**.
- [ ] **Automatizar todo el despliegue** con **Serverless Framework**.

## 5. Requisitos de FrontEnd
- [ ] Cualquier framework.
- [ ] Desplegado en **AWS Amplify**.

## 6. Diagrama
- [ ] **Diagrama de Arquitectura de Solución**.

## 7. Demo
- [ ] Demo con **2 tenants**.




## 11. Checklist de aceptación
- [ ] ≥ 5 microservicios con API Gateway + Lambda protegidos
- [ ] BD propia por microservicio (RDS schema-per-tenant o DynamoDB)
- [ ] ≥ 30,000 registros por microservicio, en 3 tenants
- [ ] S3, SNS y SQS integrados en flujos de eventos
- [ ] Despliegue 100% con Serverless Framework
- [ ] Frontend en Amplify
- [ ] Diagrama de arquitectura
- [ ] ER / JSON por microservicio
- [ ] Repos públicos
- [ ] Informe + PPT
- [ ] Demo con 2 tenants
