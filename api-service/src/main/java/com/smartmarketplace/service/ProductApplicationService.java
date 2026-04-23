package com.smartmarketplace.service;

import com.smartmarketplace.config.CacheNames;
import com.smartmarketplace.dto.*;
import com.smartmarketplace.entity.Country;
import com.smartmarketplace.entity.Product;
import com.smartmarketplace.entity.Supplier;
import com.smartmarketplace.exception.BusinessRuleException;
import com.smartmarketplace.exception.ResourceNotFoundException;
import com.smartmarketplace.repository.*;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class ProductApplicationService {

    private static final Set<String> VALID_CATEGORIES =
            Set.of("beverages", "food", "personal_care", "cleaning", "snacks");

    private final ProductRepository productRepository;
    private final SupplierRepository supplierRepository;
    private final CountryRepository countryRepository;

    public ProductApplicationService(ProductRepository productRepository,
                                     SupplierRepository supplierRepository,
                                     CountryRepository countryRepository) {
        this.productRepository = productRepository;
        this.supplierRepository = supplierRepository;
        this.countryRepository = countryRepository;
    }

    @Cacheable(value = CacheNames.CATALOG_LIST,
            key = "#page + '-' + #size + '-' + #category + '-' + #country + '-' + #supplier + '-' + #search")
    @Transactional(readOnly = true)
    public PagedResponse<ProductSummaryDTO> listProducts(int page, int size,
                                                          String category, String country,
                                                          String supplier, String search) {
        Specification<Product> spec = Specification.where(null);
        if (category != null) spec = spec.and(ProductSpecifications.hasCategory(category));
        if (country != null) spec = spec.and(ProductSpecifications.availableInCountry(country));
        if (supplier != null) spec = spec.and(ProductSpecifications.hasSupplier(supplier));
        if (search != null) spec = spec.and(ProductSpecifications.nameContains(search));

        Page<Product> result = productRepository.findAll(spec, PageRequest.of(page, size));

        List<ProductSummaryDTO> items = result.getContent().stream()
                .map(this::toSummary)
                .toList();

        return new PagedResponse<>(items, result.getNumber(), result.getSize(),
                result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true)
    public ProductDetailDTO getProduct(UUID id) {
        Product product = productRepository.findByIdWithDetails(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product", id));
        return toDetail(product);
    }

    @CacheEvict(value = CacheNames.CATALOG_LIST, allEntries = true)
    @Transactional
    public ProductDetailDTO createProduct(CreateProductRequest request) {
        validateCreateRequest(request);

        Supplier supplier = supplierRepository.findById(request.supplierId())
                .orElseThrow(() -> new BusinessRuleException("Supplier not found: " + request.supplierId()));

        List<Country> countries = countryRepository.findByCodeIn(request.countryCodes());
        if (countries.size() != request.countryCodes().size()) {
            Set<String> found = countries.stream().map(Country::getCode).map(String::trim).collect(Collectors.toSet());
            List<String> unknown = request.countryCodes().stream()
                    .filter(c -> !found.contains(c))
                    .toList();
            throw new BusinessRuleException("Unknown country codes: " + unknown);
        }

        Product product = new Product();
        product.setSku(request.sku());
        product.setName(request.name());
        product.setDescription(request.description());
        product.setCategory(request.category());
        product.setPrice(request.price());
        product.setSupplier(supplier);
        product.setCountries(new HashSet<>(countries));

        product = productRepository.save(product);
        return toDetail(product);
    }

    private void validateCreateRequest(CreateProductRequest request) {
        if (!VALID_CATEGORIES.contains(request.category())) {
            throw new BusinessRuleException("Invalid category: " + request.category()
                    + ". Valid: " + VALID_CATEGORIES);
        }
        long distinctCount = request.countryCodes().stream().distinct().count();
        if (distinctCount != request.countryCodes().size()) {
            throw new BusinessRuleException("Duplicate country codes in request");
        }
    }

    private ProductSummaryDTO toSummary(Product p) {
        return new ProductSummaryDTO(
                p.getId(), p.getSku(), p.getName(), p.getCategory(), p.getPrice(),
                p.getSupplier().getName(),
                p.getCountries().stream().map(c -> c.getCode().trim()).sorted().toList()
        );
    }

    private ProductDetailDTO toDetail(Product p) {
        return new ProductDetailDTO(
                p.getId(), p.getSku(), p.getName(), p.getCategory(), p.getPrice(),
                p.getSupplier().getName(),
                p.getCountries().stream().map(c -> c.getCode().trim()).sorted().toList(),
                p.getDescription(), p.getSupplier().getId(), p.getCreatedAt()
        );
    }
}
