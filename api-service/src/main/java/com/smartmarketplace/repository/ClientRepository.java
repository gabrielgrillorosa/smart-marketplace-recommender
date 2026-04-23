package com.smartmarketplace.repository;

import com.smartmarketplace.entity.Client;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface ClientRepository extends JpaRepository<Client, UUID> {

    @Query("SELECT c FROM Client c JOIN FETCH c.country WHERE c.id = :id")
    Optional<Client> findByIdWithCountry(@Param("id") UUID id);
}
