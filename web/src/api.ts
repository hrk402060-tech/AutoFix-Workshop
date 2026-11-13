export type User = { id: string; username: string; name: string; role: string; isActive: boolean };
export type Vehicle = { id: string; plateNumber: string; vin?: string; brand?: string; model?: string; customerName?: string; customerPhone?: string };
export type Order = { id: string; orderNo: string; vehicleId: string; status: string; customerRequest: string; vehicle?: Vehicle; createdAt: string; participants: { userId: string; user: User }[]; items: { id: string; title: string }[] };
export type Photo = { id: string; stage: string; size: number; createdAt: string; authorId: string };
export type Detail = Order & { acceptanceNote?: string; records: { id: string; authorId: string; authorName: string; note: string; createdAt: string }[]; photos: Photo[]; logs: { id: string; action: string; actorId: string; actorName: string; createdAt: string; metadata?: { note?: string } }[] };
export type Part = { id: string; code: string; name: string; specification: string; unit: string; quantity: number; isActive: boolean; canDelete?: boolean; deleteBlockedReason?: string; hasPendingRequests?: boolean };
export type Material = { id: string; partId: string; partName?: string; partCode?: string; partActive?: boolean; workOrderId: string; workOrderStatus: string; applicantId: string; type: string; quantity: number; status: string; note: string; createdAt: string };
export type Inventory = { parts: Part[]; requests: Material[]; transactions: { id: string; partId: string; partName?: string; partCode?: string; actorName: string; type: string; quantity: number; note: string; createdAt: string }[] };
export const API = import.meta.env.VITE_API_BASE_URL || '/api';
export const statusNames: Record<string, string> = { PENDING: '待处理', REPAIRING: '维修中', WAITING_ACCEPTANCE: '待验收', COMPLETED: '已完成', REWORKING: '返工中', CANCELLED: '已作废' };
export const roleNames: Record<string, string> = { OWNER: '老板', MANAGER: '主管', EMPLOYEE: '员工', WAREHOUSE: '仓管' };
export const stageNames: Record<string, string> = { VEHICLE: '接车照片', BEFORE: '维修前', DURING: '维修中', AFTER: '维修后' };
export const date = (value: string) => new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`).toLocaleString('zh-CN', { hour12: false });
export function authHeaders() { return { Authorization: `Bearer ${localStorage.getItem('autofix_token') || ''}` }; }
export async function api<T>(path: string, body?: unknown, method = 'GET'): Promise<T> {
  const token = localStorage.getItem('autofix_token');
  const response = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', ...authHeaders() }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login' && localStorage.getItem('autofix_token') === token) window.dispatchEvent(new Event('autofix-logout'));
    const data = await response.json().catch(() => ({}));
    throw new Error(Array.isArray(data.message) ? data.message.join('；') : data.message || `请求失败 (${response.status})`);
  }
  return response.json();
}
export const post = <T,>(path: string, body: unknown) => api<T>(path, body, 'POST');
export const patch = <T,>(path: string, body: unknown) => api<T>(path, body, 'PATCH');
export function newOperationId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function compressPhoto(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 ** 2) throw new Error('请选择不超过 15 MB 的 JPEG、PNG 或 WebP 图片');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('图片无法读取，请选择有效的 JPEG、PNG 或 WebP 图片'); }
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('图片压缩失败')), 'image/jpeg', .78));
    if (blob.size > 2 * 1024 ** 2) throw new Error('压缩后仍超过 2 MB，请缩小图片后重试');
    return blob;
  } finally { bitmap.close(); }
}
