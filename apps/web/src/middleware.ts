import { NextResponse, type NextRequest } from 'next/server';

/**
 * Cheap edge check: signed-in areas need the session cookie. The API remains the authority —
 * an invalid or expired cookie still gets a 401 there and the client redirects to /login.
 */
export function middleware(req: NextRequest) {
  if (!req.cookies.get('csp2all_sid')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/app/:path*', '/onboarding', '/select-shop'] };
