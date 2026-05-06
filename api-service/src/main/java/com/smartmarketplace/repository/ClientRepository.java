package com.smartmarketplace.repository;

import com.smartmarketplace.entity.Client;
import com.smartmarketplace.dto.ClientSummaryDTO;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface ClientRepository extends JpaRepository<Client, UUID> {

    @Query(
            value = """
                    SELECT new com.smartmarketplace.dto.ClientSummaryDTO(
                        c.id, c.name, c.segment, country.code
                    )
                    FROM Client c
                    JOIN c.country country
                    """,
            countQuery = "SELECT COUNT(c) FROM Client c"
    )
    Page<ClientSummaryDTO> findAllSummaries(Pageable pageable);

    @Query("SELECT c FROM Client c JOIN FETCH c.country WHERE c.id = :id")
    Optional<Client> findByIdWithCountry(@Param("id") UUID id);
}
