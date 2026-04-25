package com.smartmarketplace.service;

import com.smartmarketplace.dto.CreateProductRequest;
import com.smartmarketplace.dto.PagedResponse;
import com.smartmarketplace.dto.ProductDetailDTO;
import com.smartmarketplace.dto.ProductSummaryDTO;
import com.smartmarketplace.entity.Country;
import com.smartmarketplace.entity.Product;
import com.smartmarketplace.entity.Supplier;
import com.smartmarketplace.exception.BusinessRuleException;
import com.smartmarketplace.exception.ResourceNotFoundException;
import com.smartmarketplace.repository.CountryRepository;
import com.smartmarketplace.repository.ProductRepository;
import com.smartmarketplace.repository.SupplierRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProductApplicationServiceTest {

    @Mock
    private ProductRepository productRepository;

    @Mock
    private SupplierRepository supplierRepository;

    @Mock
    private CountryRepository countryRepository;

    @Mock
    private AiSyncClient aiSyncClient;

    @InjectMocks
    private ProductApplicationService service;

    @Test
    void listProducts_returnsPagedResponse() {
        Country country = new Country();
        country.setCode("BR");
        country.setName("Brazil");

        Supplier supplier = new Supplier();
        supplier.setId(UUID.randomUUID());
        supplier.setName("Acme");
        supplier.setCountry(country);

        Product product = new Product();
        product.setId(UUID.randomUUID());
        product.setSku("SKU-1");
        product.setName("Test Product");
        product.setDescription("A description with more than thirty characters here.");
        product.setCategory("food");
        product.setPrice(new BigDecimal("10.50"));
        product.setSupplier(supplier);
        Set<Country> countries = new HashSet<>();
        countries.add(country);
        product.setCountries(countries);

        Page<Product> page = new PageImpl<>(List.of(product), PageRequest.of(0, 20), 1);
        when(productRepository.findAll(any(Specification.class), any(PageRequest.class)))
                .thenReturn(page);

        PagedResponse<ProductSummaryDTO> response =
                service.listProducts(0, 20, null, null, null, null);

        assertThat(response.items()).hasSize(1);
        assertThat(response.totalItems()).isEqualTo(1);
        assertThat(response.items().get(0).name()).isEqualTo("Test Product");
    }

    @Test
    void getProduct_throwsResourceNotFoundException_whenNotFound() {
        UUID id = UUID.randomUUID();
        when(productRepository.findByIdWithDetails(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getProduct(id))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining("Product")
                .hasMessageContaining(id.toString());
    }

    @Test
    void createProduct_throwsBusinessRuleException_forInvalidCategory() {
        CreateProductRequest request = new CreateProductRequest(
                "SKU-INVALID",
                "Invalid Product",
                "A description that is at least thirty characters long.",
                "invalid",
                new BigDecimal("9.99"),
                UUID.randomUUID(),
                List.of("BR")
        );

        assertThatThrownBy(() -> service.createProduct(request))
                .isInstanceOf(BusinessRuleException.class)
                .hasMessageContaining("Invalid category");
    }

    @Test
    void createProduct_throwsBusinessRuleException_forSupplierNotFound() {
        UUID supplierId = UUID.randomUUID();
        CreateProductRequest request = new CreateProductRequest(
                "SKU-VALID",
                "Valid Product",
                "A description that is at least thirty characters long.",
                "food",
                new BigDecimal("9.99"),
                supplierId,
                List.of("BR")
        );

        when(supplierRepository.findById(supplierId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.createProduct(request))
                .isInstanceOf(BusinessRuleException.class)
                .hasMessageContaining("Supplier not found");
    }

    @Test
    void createProduct_notifiesAiSyncClient_afterSuccessfulSave() {
        UUID supplierId = UUID.randomUUID();
        CreateProductRequest request = new CreateProductRequest(
                "SKU-SYNC",
                "Sync Product",
                "A description that is at least thirty characters long.",
                "food",
                new BigDecimal("9.99"),
                supplierId,
                List.of("BR")
        );

        Country country = new Country();
        country.setCode("BR");
        country.setName("Brazil");

        Supplier supplier = new Supplier();
        supplier.setId(supplierId);
        supplier.setName("Acme");
        supplier.setCountry(country);

        Product product = new Product();
        product.setId(UUID.randomUUID());
        product.setSku("SKU-SYNC");
        product.setName("Sync Product");
        product.setDescription("A description that is at least thirty characters long.");
        product.setCategory("food");
        product.setPrice(new BigDecimal("9.99"));
        product.setSupplier(supplier);
        Set<Country> countries = new HashSet<>();
        countries.add(country);
        product.setCountries(countries);

        when(supplierRepository.findById(supplierId)).thenReturn(Optional.of(supplier));
        when(countryRepository.findByCodeIn(List.of("BR"))).thenReturn(List.of(country));
        when(productRepository.save(any(Product.class))).thenReturn(product);

        service.createProduct(request);

        verify(aiSyncClient).notifyProductCreated(any(ProductDetailDTO.class));
    }
}
