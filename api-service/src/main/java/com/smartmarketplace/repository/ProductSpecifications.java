package com.smartmarketplace.repository;

import com.smartmarketplace.entity.Country;
import com.smartmarketplace.entity.Product;
import com.smartmarketplace.entity.Supplier;
import jakarta.persistence.criteria.Join;
import org.springframework.data.jpa.domain.Specification;

public final class ProductSpecifications {

    private ProductSpecifications() {}

    public static Specification<Product> hasCategory(String category) {
        return (root, query, cb) -> cb.equal(root.get("category"), category);
    }

    public static Specification<Product> availableInCountry(String countryCode) {
        return (root, query, cb) -> {
            Join<Product, Country> countries = root.join("countries");
            return cb.equal(countries.get("code"), countryCode);
        };
    }

    public static Specification<Product> hasSupplier(String supplierName) {
        return (root, query, cb) -> {
            Join<Product, Supplier> supplier = root.join("supplier");
            return cb.equal(supplier.get("name"), supplierName);
        };
    }

    public static Specification<Product> nameContains(String search) {
        return (root, query, cb) ->
                cb.like(cb.lower(root.get("name")), "%" + search.toLowerCase() + "%");
    }
}
