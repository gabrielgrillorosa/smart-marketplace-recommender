# Stack — API Service
**Serviço:** api-service (Java 21 / Spring Boot 3.3)
**Analisado:** 2026-04-26

---

## Core

- **Framework:** Spring Boot 3.3.0
- **Language:** Java 21
- **Build:** Maven (spring-boot-starter-parent 3.3.0)
- **Runtime:** JVM com Virtual Threads (Project Loom — habilitado por padrão no Spring Boot 3.3 com Tomcat)

## Spring Boot Starters

| Starter | Propósito |
|---|---|
| `spring-boot-starter-web` | Servlet stack (Spring MVC + Tomcat) |
| `spring-boot-starter-data-jpa` | Hibernate + Spring Data JPA |
| `spring-boot-starter-validation` | Bean Validation (Jakarta Validation) |
| `spring-boot-starter-webflux` | WebClient para chamada ao AI Service (Netty no classpath como dependência transitiva) |
| `spring-boot-starter-cache` | `@Cacheable` / `@CacheEvict` |
| `spring-boot-starter-actuator` | `/actuator/health`, `/actuator/metrics`, `/actuator/info` |
| `spring-boot-starter-aop` | Resilience4j AOP |

## Dependências externas

| Dependência | Versão | Propósito |
|---|---|---|
| `caffeine` | BOM | Cache in-memory (TTL 5min para catálogo) |
| `resilience4j-spring-boot3` | 2.2.0 | Circuit breaker na chamada ao AI Service |
| `springdoc-openapi-starter-webmvc-ui` | 2.5.0 | Swagger UI em `/swagger-ui.html` |
| `logstash-logback-encoder` | 7.4 | Logs JSON estruturados |
| `micrometer-registry-prometheus` | BOM | Métricas Prometheus |
| `postgresql` | BOM | Driver PostgreSQL |

## Testing

| Dependência | Propósito |
|---|---|
| `spring-boot-starter-test` | JUnit 5 + Mockito + AssertJ |
| `spring-boot-testcontainers` | Integração Spring Boot + Testcontainers |
| `testcontainers:junit-jupiter` | Junit 5 extension para Testcontainers |
| `testcontainers:postgresql` | Container PostgreSQL para IT tests |

## Build plugins

| Plugin | Versão | Propósito |
|---|---|---|
| `spring-boot-maven-plugin` | BOM | Build + Docker image |
| `maven-failsafe-plugin` | BOM | IT tests (`*IT.java`) |
| `jacoco-maven-plugin` | 0.8.12 | Coverage — mínimo 60% line em `com.smartmarketplace.service.*` |
| `maven-checkstyle-plugin` | 3.4.0 | Estilo de código (checkstyle.xml) |

## Comandos principais

```
./mvnw test             → unit tests apenas
./mvnw verify           → unit + IT tests + jacoco + checkstyle
./mvnw spring-boot:run  → dev local
```
