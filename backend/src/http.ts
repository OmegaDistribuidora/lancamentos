export class HttpError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: Record<string, string>): never => {
  throw new HttpError(400, message, fields);
};
export const forbidden = (message = 'Você não tem permissão para esta ação.'): never => {
  throw new HttpError(403, message);
};
export const notFound = (message = 'Registro não encontrado.'): never => {
  throw new HttpError(404, message);
};

export function text(value: unknown, field: string, max = 500): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) badRequest(`${field} é obrigatório.`);
  return normalized.slice(0, max);
}

export function optionalText(value: unknown, max = 2000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function positiveId(value: unknown, field: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) badRequest(`${field} inválido.`);
  return id;
}

export function dateOnly(value: unknown, field: string): string {
  const normalized = typeof value === 'string' ? value : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) badRequest(`${field} inválida.`);
  const date = new Date(`${normalized}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) badRequest(`${field} inválida.`);
  return normalized;
}

export function money(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 999999999999.99) badRequest('Valor deve ser maior que zero.');
  return Math.round(parsed * 100) / 100;
}
