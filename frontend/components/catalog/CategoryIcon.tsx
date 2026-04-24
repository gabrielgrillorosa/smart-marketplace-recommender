const CATEGORY_ICONS: Record<string, string> = {
  beverages: '🥤',
  food: '🍎',
  personal_care: '🧴',
  cleaning: '🧹',
  snacks: '🍿',
};

interface CategoryIconProps {
  category: string;
  className?: string;
}

export function CategoryIcon({ category, className }: CategoryIconProps) {
  const icon = CATEGORY_ICONS[category.toLowerCase()] ?? '📦';
  return (
    <span className={className} role="img" aria-label={category}>
      {icon}
    </span>
  );
}
