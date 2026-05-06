package com.smartmarketplace.outbox;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public class OutboxDispatchJdbcRepository {

    private static final String CLAIM_SQL = """
            WITH candidates AS (
                SELECT id
                FROM integration_outbox
                WHERE processed_at IS NULL
                  AND next_attempt_at <= now()
                  AND (lease_until IS NULL OR lease_until < now())
                ORDER BY created_at
                FOR UPDATE SKIP LOCKED
                LIMIT ?
            )
            UPDATE integration_outbox AS o
            SET leased_by = ?,
                lease_until = now() + (? * interval '1 millisecond')
            FROM candidates
            WHERE o.id = candidates.id
            RETURNING o.id, o.event_type, o.payload
            """;

    private static final String MARK_PROCESSED_SQL = """
            UPDATE integration_outbox
            SET processed_at = now(),
                lease_until = NULL,
                leased_by = NULL,
                last_error = NULL
            WHERE id = ?
            """;

    private static final String MARK_FAILED_SQL = """
            UPDATE integration_outbox
            SET attempt_count = attempt_count + 1,
                last_error = ?,
                next_attempt_at = now() + (? * interval '1 millisecond'),
                lease_until = NULL,
                leased_by = NULL
            WHERE id = ?
            """;

    private final JdbcTemplate jdbcTemplate;

    public OutboxDispatchJdbcRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<ClaimedOutboxEvent> claimBatch(int batchSize, String dispatcherId, long leaseMs) {
        return jdbcTemplate.query(
                CLAIM_SQL,
                ps -> {
                    ps.setInt(1, batchSize);
                    ps.setString(2, dispatcherId);
                    ps.setLong(3, leaseMs);
                },
                (rs, rowNum) -> new ClaimedOutboxEvent(
                        rs.getObject("id", UUID.class),
                        IntegrationEventType.valueOf(rs.getString("event_type")),
                        rs.getString("payload")
                )
        );
    }

    public void markProcessed(UUID eventId) {
        jdbcTemplate.update(MARK_PROCESSED_SQL, eventId);
    }

    public void markFailed(UUID eventId, String lastError, long retryDelayMs) {
        jdbcTemplate.update(MARK_FAILED_SQL, lastError, retryDelayMs, eventId);
    }
}
