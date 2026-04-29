package com.smartmarketplace.controller;

import com.smartmarketplace.dto.PagedResponse;
import com.smartmarketplace.dto.ProductSummaryDTO;
import com.smartmarketplace.service.ProductApplicationService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;

/**
 * Unit-level coverage for {@link ProductController}'s mapping of the HTTP
 * {@code Cache-Control} request header to the service-layer {@code noCache} flag.
 *
 * <p>We don't spin up Spring or MockMvc here — the goal is to pin down the small,
 * decision-heavy piece (header parsing + flag forwarding) without paying for a full
 * web context. Behavior of the {@code @Cacheable} annotation itself is validated by
 * end-to-end docker-compose runs since it requires a live cache manager.
 */
@ExtendWith(MockitoExtension.class)
class ProductControllerCacheBypassTest {

    @Mock
    private ProductApplicationService productService;

    @InjectMocks
    private ProductController controller;

    private static final PagedResponse<ProductSummaryDTO> EMPTY_RESPONSE =
            new PagedResponse<>(List.of(), 0, 20, 0L, 0);

    @Test
    void listProducts_forwardsNoCacheFalse_whenHeaderAbsent() {
        when(productService.listProducts(anyInt(), anyInt(), isNull(), isNull(), isNull(), isNull(), anyBoolean()))
                .thenReturn(EMPTY_RESPONSE);

        controller.listProducts(0, 20, null, null, null, null, null);

        assertNoCacheFlagWas(false);
    }

    @Test
    void listProducts_forwardsNoCacheTrue_whenHeaderIsNoCache() {
        when(productService.listProducts(anyInt(), anyInt(), isNull(), isNull(), isNull(), isNull(), anyBoolean()))
                .thenReturn(EMPTY_RESPONSE);

        controller.listProducts(0, 20, null, null, null, null, "no-cache");

        assertNoCacheFlagWas(true);
    }

    @Test
    void listProducts_forwardsNoCacheTrue_whenHeaderIsNoStore() {
        when(productService.listProducts(anyInt(), anyInt(), isNull(), isNull(), isNull(), isNull(), anyBoolean()))
                .thenReturn(EMPTY_RESPONSE);

        controller.listProducts(0, 20, null, null, null, null, "no-store");

        assertNoCacheFlagWas(true);
    }

    @Test
    void listProducts_isCaseInsensitive_andHandlesMultipleDirectives() {
        when(productService.listProducts(anyInt(), anyInt(), isNull(), isNull(), isNull(), isNull(), anyBoolean()))
                .thenReturn(EMPTY_RESPONSE);

        controller.listProducts(0, 20, null, null, null, null, "max-age=0, NO-CACHE");

        assertNoCacheFlagWas(true);
    }

    @Test
    void listProducts_ignoresUnrelatedDirectives() {
        when(productService.listProducts(anyInt(), anyInt(), isNull(), isNull(), isNull(), isNull(), anyBoolean()))
                .thenReturn(EMPTY_RESPONSE);

        controller.listProducts(0, 20, null, null, null, null, "max-age=0");

        assertNoCacheFlagWas(false);
    }

    @Test
    void listProducts_treatsBlankHeaderAsCacheable() {
        when(productService.listProducts(anyInt(), anyInt(), isNull(), isNull(), isNull(), isNull(), anyBoolean()))
                .thenReturn(EMPTY_RESPONSE);

        controller.listProducts(0, 20, null, null, null, null, "   ");

        assertNoCacheFlagWas(false);
    }

    private void assertNoCacheFlagWas(boolean expected) {
        ArgumentCaptor<Boolean> captor = ArgumentCaptor.forClass(Boolean.class);
        org.mockito.Mockito.verify(productService).listProducts(
                anyInt(), anyInt(), isNull(), isNull(), isNull(), isNull(), captor.capture());
        assertThat(captor.getValue()).isEqualTo(expected);
    }
}
