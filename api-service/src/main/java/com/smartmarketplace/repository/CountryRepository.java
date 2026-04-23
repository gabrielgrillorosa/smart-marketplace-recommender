package com.smartmarketplace.repository;

import com.smartmarketplace.entity.Country;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CountryRepository extends JpaRepository<Country, String> {

    List<Country> findByCodeIn(List<String> codes);
}
