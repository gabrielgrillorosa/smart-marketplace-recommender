'use client';

import type { Product } from '@/lib/types';

export interface FilterState {
  category: string;
  country: string;
  supplier: string;
}

interface ProductFiltersProps {
  products: Product[];
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

export function ProductFilters({ products, filters, onChange }: ProductFiltersProps) {
  const categories = unique(products.map((p) => p.category));
  const suppliers = unique(products.map((p) => p.supplier));
  const countries = unique(products.flatMap((p) => p.countries));

  function set(key: keyof FilterState, value: string) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="flex flex-wrap gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">Categoria</label>
        <select
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={filters.category}
          onChange={(e) => set('category', e.target.value)}
        >
          <option value="">Todas</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">País</label>
        <select
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={filters.country}
          onChange={(e) => set('country', e.target.value)}
        >
          <option value="">Todos</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">Fornecedor</label>
        <select
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={filters.supplier}
          onChange={(e) => set('supplier', e.target.value)}
        >
          <option value="">Todos</option>
          {suppliers.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
