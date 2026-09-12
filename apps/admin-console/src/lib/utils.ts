export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatDate(iso: string | null): string {
  if (!iso) return '---';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function truncate(str: string | null | undefined, max: number): string {
  if (!str) return '---';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

export function shortId(id: string | null | undefined): string {
  if (!id) return '---';
  return id.length > 12 ? id.slice(0, 12) : id;
}
