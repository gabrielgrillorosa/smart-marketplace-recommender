import { v5 as uuidv5 } from 'uuid';

/** Namespace for deterministic M16 density SKUs (separate from orders SEED_NAMESPACE). Must be a valid RFC UUID for `uuid` v5. */
const M16_NS = 'd1e2c3f4-a5b6-4d90-8c4d-1234567890ab';

const PEPSICO = 'd4e5f6a7-b8c9-0123-def0-456789abcdef';
const FEMSA = 'e5f6a7b8-c9d0-1234-ef01-567890abcdef';

type SeedCategory = 'beverages' | 'food' | 'personal_care' | 'cleaning' | 'snacks';

interface DensityProduct {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: SeedCategory;
  price: number;
  supplier_id: string;
  available_in: string[];
}

const COUNTRY_ROTATIONS = [
  ['BR', 'MX', 'CO'],
  ['BR', 'NL', 'RO'],
  ['MX', 'CO', 'NL'],
  ['BR', 'MX', 'NL', 'RO'],
];

function desc(prefix: string, detail: string): string {
  const body = `${prefix} — ${detail}`;
  return body.length >= 30 ? body : `${body} Retail listing copy for catalog density and embedding diversity.`;
}

/** One line per index 0..13 — realistic beverage titles (names PT-BR, copy EN for consistency with core seed). */
const M16_BEVERAGE_LINES: ReadonlyArray<{ name: string; lead: string; detail: string }> = [
  { name: 'Água mineral natural sem gás 1,5L', lead: 'Still natural mineral water in a large format bottle', detail: 'for households and food service hydration with neutral taste.' },
  { name: 'Refrigerante cola tradicional 2L', lead: 'Classic cola-flavored carbonated soft drink', detail: 'for retail coolers and wholesale restaurant supply in PET format.' },
  { name: 'Suco de laranja integral 1L', lead: 'Not-from-concentrate orange juice with pulp', detail: 'sold chilled for breakfast retail and school food programs.' },
  { name: 'Chá gelado sabor limão 300ml', lead: 'Ready-to-drink lemon iced tea with balanced sweetness', detail: 'for convenience stores and on-the-go consumption.' },
  { name: 'Bebida energética citrus 250ml', lead: 'Carbonated energy drink with caffeine and citrus notes', detail: 'targeting wholesale impulse channels and late-shift retail.' },
  { name: 'Água mineral com gás 500ml', lead: 'Sparkling mineral water in a portable bottle', detail: 'for bars, hotels, and supermarket sparkling water shelves.' },
  { name: 'Refrigerante guaraná 2L', lead: 'Guaraná-flavored Brazilian-style soda', detail: 'popular in Latin American wholesale and family-size retail packs.' },
  { name: 'Néctar de pêssego 1L', lead: 'Fruit nectar drink with peach aroma', detail: 'for kids’ lunchboxes and retail beverage aisles.' },
  { name: 'Isotônico sabor citrus 500ml', lead: 'Sports hydration drink with electrolytes', detail: 'for gyms, stadium kiosks, and supermarket sports drink sections.' },
  { name: 'Refrigerante limão 310ml', lead: 'Lemon-lime carbonated soft drink in single serve', detail: 'for vending machines and checkout impulse racks.' },
  { name: 'Café pronto latte 240ml', lead: 'Ready-to-drink cold latte coffee beverage', detail: 'for office retail and refrigerated convenience channels.' },
  { name: 'Achocolatado UHT 200ml', lead: 'Chocolate-flavored dairy drink in small carton', detail: 'for school meals and household breakfast segments.' },
  { name: 'Refrigerante laranja 2L', lead: 'Orange soda in family-size bottle', detail: 'for parties and wholesale cash-and-carry buyers.' },
  { name: 'Chá mate natural 1L', lead: 'Unsweetened brewed yerba mate tea ready to drink', detail: 'for health-oriented retail shelves in Southern Cone markets.' },
];

/** One line per index 0..13 — pantry and grocery-style SKUs. */
const M16_FOOD_LINES: ReadonlyArray<{ name: string; lead: string; detail: string }> = [
  { name: 'Arroz branco tipo 1 pacote 5kg', lead: 'Long-grain white rice for daily cooking', detail: 'staple grain for retail pantry aisles and institutional kitchens.' },
  { name: 'Feijão carioca selecionado 1kg', lead: 'Brown carioca beans for traditional stews', detail: 'core ingredient for Brazilian wholesale and supermarket shelves.' },
  { name: 'Macarrão espaguete semola 500g', lead: 'Durum wheat spaghetti pasta', detail: 'for household weeknight meals and food service pasta stations.' },
  { name: 'Açúcar cristal pacote 1kg', lead: 'Crystal sugar for baking and beverages', detail: 'distributed through retail baking aisles and HoReCa supply.' },
  { name: 'Óleo de soja refinado 900ml', lead: 'Refined soybean cooking oil in PET bottle', detail: 'for frying and salad dressings in mass-market retail.' },
  { name: 'Sal refinado iodado 1kg', lead: 'Iodized fine table salt', detail: 'essential pantry item for consumers and small restaurant wholesale.' },
  { name: 'Farinha de trigo com fermento 1kg', lead: 'Self-raising wheat flour for cakes and breads', detail: 'for home baking and bakery micro-business channels.' },
  { name: 'Café torrado e moído a vácuo 500g', lead: 'Roasted ground coffee in vacuum pack', detail: 'for breakfast retail and office pantry replenishment.' },
  { name: 'Leite integral UHT 1L', lead: 'Whole UHT milk in shelf-stable carton', detail: 'for family consumption and school nutrition programs.' },
  { name: 'Extrato de tomate lata 340g', lead: 'Concentrated tomato paste for sauces', detail: 'for pizza kitchens and retail cooking sauce shelves.' },
  { name: 'Bolacha água e sal 400g', lead: 'Plain salted water crackers multipack', detail: 'for snacks and soup pairing in supermarket cracker aisles.' },
  { name: 'Milho verde em conserva 170g', lead: 'Canned sweet corn kernels in brine', detail: 'for salads and side dishes in retail and food service.' },
  { name: 'Aveia em flocos finos 500g', lead: 'Rolled oats for porridge and baking', detail: 'for breakfast cereal sections and health-conscious shoppers.' },
  { name: 'Vinagre de álcool 750ml', lead: 'White alcohol vinegar for cooking and cleaning prep', detail: 'for pickling recipes and institutional kitchen supply.' },
];

/**
 * Twelve density SKUs rotating snacks / cleaning / personal_care (same cycle as before).
 * Each entry is a concrete retail product name aligned with its category — not a category label.
 */
const M16_MIX_LINES: ReadonlyArray<{ name: string; lead: string; detail: string }> = [
  { name: 'Batata palha tradicional 140g', lead: 'Crispy shoestring potato sticks salted snack', detail: 'for snack aisles and bar mix wholesale in Latin America.' },
  { name: 'Vassoura nylon com cabo 1,2m', lead: 'Hard-bristle nylon broom with wooden handle', detail: 'for household floor sweeping and janitorial retail packs.' },
  { name: 'Barbeador descartável tripla lâmina 2un', lead: 'Twin-pack disposable razor with lubricating strip', detail: 'for travel retail and pharmacy grooming shelves.' },
  { name: 'Amendoim torrado salgado 200g', lead: 'Roasted salted peanuts in flexible pouch', detail: 'for beer pairing and convenience store salty snacks.' },
  { name: 'Desinfetante aroma pinho 2L', lead: 'Pine-scented dilutable surface disinfectant', detail: 'for floor mopping in households and small businesses.' },
  { name: 'Salgadinho sabor queijo 55g', lead: 'Cheese-flavored puffed corn snack bag', detail: 'impulse buy at checkout and kids’ lunch snack programs.' },
  { name: 'Esponja dupla face para louça 4un', lead: 'Dual-sided dish sponge multipack', detail: 'for kitchen cleaning bundles in mass retail.' },
  { name: 'Shampoo hidratação intensiva 350ml', lead: 'Moisturizing shampoo for dry hair', detail: 'for supermarket hair care aisles and hotel amenities supply.' },
  { name: 'Biscoito cream cracker 400g', lead: 'Neutral cream cracker biscuit pack', detail: 'for breakfast spreads and institutional snack service.' },
  { name: 'Detergente líquido limão 500ml', lead: 'Lemon dishwashing liquid grease-cutting formula', detail: 'for household sinks and restaurant dish pits.' },
  { name: 'Chocolate ao leite tablete 90g', lead: 'Milk chocolate bar standard tablet', detail: 'for impulse confectionery and vending wholesale.' },
  { name: 'Rodo condutor água com refil 60cm', lead: 'Floor squeegee with foam refill for wet rooms', detail: 'for bathroom and laundry cleaning retail channels.' },
];

const extraCategories: SeedCategory[] = ['snacks', 'cleaning', 'personal_care', 'snacks', 'cleaning'];

/** M16 — expands beverages/food to 20+ each and pushes total catalog toward ~85–125 SKUs (NFD-27..31). */
export const m16DensityProducts: DensityProduct[] = [];

for (let i = 0; i < 14; i++) {
  const line = M16_BEVERAGE_LINES[i]!;
  const id = uuidv5(`m16-density-beverage:${i}`, M16_NS);
  m16DensityProducts.push({
    id,
    sku: `BEV-M16-${String(i + 1).padStart(2, '0')}`,
    name: line.name,
    description: desc(line.lead, line.detail),
    category: 'beverages',
    price: 2.29 + (i % 7) * 0.15,
    supplier_id: i % 2 === 0 ? PEPSICO : FEMSA,
    available_in: COUNTRY_ROTATIONS[i % COUNTRY_ROTATIONS.length],
  });
}

for (let i = 0; i < 14; i++) {
  const line = M16_FOOD_LINES[i]!;
  const id = uuidv5(`m16-density-food:${i}`, M16_NS);
  m16DensityProducts.push({
    id,
    sku: `FOOD-M16-${String(i + 1).padStart(2, '0')}`,
    name: line.name,
    description: desc(line.lead, line.detail),
    category: 'food',
    price: 4.5 + (i % 9) * 0.35,
    supplier_id: i % 2 === 0 ? FEMSA : PEPSICO,
    available_in: COUNTRY_ROTATIONS[(i + 1) % COUNTRY_ROTATIONS.length],
  });
}

for (let i = 0; i < 12; i++) {
  const cat = extraCategories[i % extraCategories.length]!;
  const line = M16_MIX_LINES[i]!;
  const id = uuidv5(`m16-density-mix:${i}`, M16_NS);
  m16DensityProducts.push({
    id,
    sku: `MIX-M16-${String(i + 1).padStart(2, '0')}`,
    name: line.name,
    description: desc(line.lead, line.detail),
    category: cat,
    price: 3.1 + (i % 11) * 0.42,
    supplier_id: i % 2 === 0 ? PEPSICO : FEMSA,
    available_in: COUNTRY_ROTATIONS[i % COUNTRY_ROTATIONS.length],
  });
}
