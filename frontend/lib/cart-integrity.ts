import type { Cart, Client, Product } from '@/lib/types';

export type CartActionAvailability =
  | { kind: 'enabled' }
  | { kind: 'no-client'; message: string }
  | { kind: 'country-incompatible'; message: string; availableCountries: string[] };

export interface CartIntegrityIssue {
  productId: string;
  productName: string;
  message: string;
}

const NO_CLIENT_MESSAGE = 'Selecione um cliente para usar o carrinho';

function buildCountryIncompatibleMessage(country: string, availableCountries: string[]): string {
  if (availableCountries.length === 0) {
    return `Indisponível para clientes ${country}`;
  }

  return `Indisponível para clientes ${country} (disponível em: ${availableCountries.join(', ')})`;
}

export function resolveCartActionAvailability(
  selectedClient: Client | null | undefined,
  product: Product
): CartActionAvailability {
  if (!selectedClient) {
    return { kind: 'no-client', message: NO_CLIENT_MESSAGE };
  }

  const availableCountries = product.countries ?? [];
  if (availableCountries.includes(selectedClient.country)) {
    return { kind: 'enabled' };
  }

  return {
    kind: 'country-incompatible',
    message: buildCountryIncompatibleMessage(selectedClient.country, availableCountries),
    availableCountries,
  };
}

export function collectCartIntegrityIssues(
  cart: Cart | null | undefined,
  productsById: Record<string, Product>,
  clientCountry: string
): CartIntegrityIssue[] {
  if (!cart) {
    return [];
  }

  const issues: CartIntegrityIssue[] = [];
  for (const item of cart.items) {
    const product = productsById[item.productId];
    if (!product) {
      continue;
    }

    const availableCountries = product.countries ?? [];
    if (availableCountries.includes(clientCountry)) {
      continue;
    }

    issues.push({
      productId: product.id,
      productName: product.name,
      message: buildCountryIncompatibleMessage(clientCountry, availableCountries),
    });
  }

  return issues;
}
