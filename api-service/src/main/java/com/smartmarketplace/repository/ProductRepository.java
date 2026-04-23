package com.smartmarketplace.repository;

import com.smartmarketplace.entity.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProductRepository extends JpaRepository<Product, UUID>, JpaSpecificationExecutor<Product> {

    @Query("SELECT p FROM Product p JOIN FETCH p.supplier LEFT JOIN FETCH p.countries WHERE p.id = :id")
    Optional<Product> findByIdWithDetails(@Param("id") UUID id);

    @Query("SELECT p FROM Product p JOIN FETCH p.supplier LEFT JOIN FETCH p.countries WHERE p.id IN :ids")
    List<Product> findAllByIdWithCountries(@Param("ids") List<UUID> ids);
}
