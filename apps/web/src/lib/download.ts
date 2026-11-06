import { api } from './api';
import type { SignedUrl } from './types';

/**
 * Fetches a short-lived signed URL (issued only after the API's permission check) and starts the
 * download. The file is served with `Content-Disposition: attachment`, so the page stays put.
 */
export async function openSignedUrl(path: string): Promise<void> {
  const s = await api<SignedUrl>(path);
  window.location.assign(s.url);
}
