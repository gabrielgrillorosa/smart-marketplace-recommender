export interface Client {
  id: string;
  name: string;
  segment: 'retail' | 'food_service' | 'wholesale';
  country_code: string;
  created_at: string;
}

export const clients: Client[] = [
  // Brazil (5)
  {
    id: 'cccccccc-0001-4000-8000-000000000001',
    name: 'Supermercado Família BR',
    segment: 'retail',
    country_code: 'BR',
    created_at: '2024-01-15T08:00:00Z',
  },
  {
    id: 'cccccccc-0002-4000-8000-000000000002',
    name: 'Distribuidora Central São Paulo',
    segment: 'wholesale',
    country_code: 'BR',
    created_at: '2024-02-01T08:00:00Z',
  },
  {
    id: 'cccccccc-0003-4000-8000-000000000003',
    name: 'Restaurante Bom Sabor',
    segment: 'food_service',
    country_code: 'BR',
    created_at: '2024-02-20T08:00:00Z',
  },
  {
    id: 'cccccccc-0004-4000-8000-000000000004',
    name: 'Mercearia do Bairro Rio',
    segment: 'retail',
    country_code: 'BR',
    created_at: '2024-03-05T08:00:00Z',
  },
  {
    id: 'cccccccc-0005-4000-8000-000000000005',
    name: 'Atacado Nordeste Ltda',
    segment: 'wholesale',
    country_code: 'BR',
    created_at: '2024-03-20T08:00:00Z',
  },

  // Mexico (4)
  {
    id: 'cccccccc-0006-4000-8000-000000000006',
    name: 'Tienda La Esperanza MX',
    segment: 'retail',
    country_code: 'MX',
    created_at: '2024-01-20T08:00:00Z',
  },
  {
    id: 'cccccccc-0007-4000-8000-000000000007',
    name: 'Distribuidora Azteca SA',
    segment: 'wholesale',
    country_code: 'MX',
    created_at: '2024-02-10T08:00:00Z',
  },
  {
    id: 'cccccccc-0008-4000-8000-000000000008',
    name: 'Restaurante El Sabor MX',
    segment: 'food_service',
    country_code: 'MX',
    created_at: '2024-02-28T08:00:00Z',
  },
  {
    id: 'cccccccc-0009-4000-8000-000000000009',
    name: 'Supermercado Ciudad de México',
    segment: 'retail',
    country_code: 'MX',
    created_at: '2024-03-15T08:00:00Z',
  },

  // Colombia (4)
  {
    id: 'cccccccc-0010-4000-8000-000000000010',
    name: 'Almacén Bogotá CO',
    segment: 'retail',
    country_code: 'CO',
    created_at: '2024-01-25T08:00:00Z',
  },
  {
    id: 'cccccccc-0011-4000-8000-000000000011',
    name: 'Distribuidora Andina SAS',
    segment: 'wholesale',
    country_code: 'CO',
    created_at: '2024-02-15T08:00:00Z',
  },
  {
    id: 'cccccccc-0012-4000-8000-000000000012',
    name: 'Cafetería Universitaria Medellín',
    segment: 'food_service',
    country_code: 'CO',
    created_at: '2024-03-01T08:00:00Z',
  },
  {
    id: 'cccccccc-0013-4000-8000-000000000013',
    name: 'Minimarket Cali Norte',
    segment: 'retail',
    country_code: 'CO',
    created_at: '2024-03-25T08:00:00Z',
  },

  // Netherlands (4)
  {
    id: 'cccccccc-0014-4000-8000-000000000014',
    name: 'Albert Heijn Wholesale NL',
    segment: 'wholesale',
    country_code: 'NL',
    created_at: '2024-01-30T08:00:00Z',
  },
  {
    id: 'cccccccc-0015-4000-8000-000000000015',
    name: 'Hotel Amsterdam Catering',
    segment: 'food_service',
    country_code: 'NL',
    created_at: '2024-02-12T08:00:00Z',
  },
  {
    id: 'cccccccc-0016-4000-8000-000000000016',
    name: 'Supermarkt Rotterdam',
    segment: 'retail',
    country_code: 'NL',
    created_at: '2024-03-08T08:00:00Z',
  },
  {
    id: 'cccccccc-0017-4000-8000-000000000017',
    name: 'Groothandel Utrecht BV',
    segment: 'wholesale',
    country_code: 'NL',
    created_at: '2024-04-01T08:00:00Z',
  },

  // Romania (3)
  {
    id: 'cccccccc-0018-4000-8000-000000000018',
    name: 'Supermarket Bucharest RO',
    segment: 'retail',
    country_code: 'RO',
    created_at: '2024-01-18T08:00:00Z',
  },
  {
    id: 'cccccccc-0019-4000-8000-000000000019',
    name: 'Restaurant Cluj-Napoca',
    segment: 'food_service',
    country_code: 'RO',
    created_at: '2024-02-22T08:00:00Z',
  },
  {
    id: 'cccccccc-0020-4000-8000-000000000020',
    name: 'Distribuitor Timisoara SA',
    segment: 'wholesale',
    country_code: 'RO',
    created_at: '2024-03-18T08:00:00Z',
  },
];
