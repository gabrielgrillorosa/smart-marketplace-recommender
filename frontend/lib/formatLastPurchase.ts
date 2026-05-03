/** Formata instante ISO para cópia de UI em pt-BR (fuso local do browser). */
export function formatLastPurchasePtBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}
