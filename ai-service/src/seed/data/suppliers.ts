export interface Supplier {
  id: string;
  name: string;
  country_code: string;
}

export const suppliers: Supplier[] = [
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    name: 'Ambev Distribution',
    country_code: 'BR',
  },
  {
    id: 'b2c3d4e5-f6a7-8901-bcde-f01234567891',
    name: 'Nestlé Iberoamérica',
    country_code: 'MX',
  },
  {
    id: 'c3d4e5f6-a7b8-9012-cdef-012345678912',
    name: 'Unilever Europe',
    country_code: 'NL',
  },
  {
    id: 'd4e5f6a7-b8c9-0123-def0-456789abcdef',
    name: 'PepsiCo Americas Wholesale',
    country_code: 'BR',
  },
  {
    id: 'e5f6a7b8-c9d0-1234-ef01-567890abcdef',
    name: 'Coca-Cola FEMSA Logistics',
    country_code: 'MX',
  },
];
