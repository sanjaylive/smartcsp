import { ImageResponse } from 'next/og';

export const alt = 'Smart Outlet — Records, cashbook & dues for your CSP counter';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// ASCII-only text and explicit flex on every multi-child node: Satori's embedded font covers it,
// so the image renders with no external font fetch (self-contained, CSP-safe, reliable in CI).
export default function OgImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '80px',
        background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 55%, #7c3aed 100%)',
        color: '#ffffff',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div
          style={{
            display: 'flex',
            width: 64,
            height: 64,
            borderRadius: 18,
            background: 'rgba(255,255,255,0.18)',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            fontWeight: 800,
          }}
        >
          SO
        </div>
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>Smart Outlet</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 68, fontWeight: 800 }}>
          <div style={{ lineHeight: 1.1, letterSpacing: -2 }}>Run your service counter</div>
          <div style={{ lineHeight: 1.1, letterSpacing: -2 }}>without the paper diary</div>
        </div>
        <div style={{ display: 'flex', fontSize: 30, color: 'rgba(255,255,255,0.85)' }}>
          AEPS, DMT, PAN and recharge. A tallied cashbook. Every due. Even offline.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 24, fontSize: 24, color: 'rgba(255,255,255,0.9)' }}>
        <div style={{ display: 'flex' }}>Works offline</div>
        <div style={{ display: 'flex' }}>/</div>
        <div style={{ display: 'flex' }}>Hindi + English</div>
        <div style={{ display: 'flex' }}>/</div>
        <div style={{ display: 'flex' }}>smart-outlet.in</div>
      </div>
    </div>,
    size,
  );
}
