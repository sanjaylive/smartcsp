/*
 * Flat, hand-built illustrations for the marketing page. Inline SVG so they follow the brand
 * colour token (`var(--brand)`) set from super-admin Branding, and animate with CSS only.
 */

const INK = '#2b2620';
const SKIN_A = '#c68642';
const SKIN_B = '#8d5524';
const PAPER = '#fffaf2';

/** Hero scene: a CSP / Seva Kendra counter with an operator serving a customer. */
export function HeroIllustration({ className = '' }: { className?: string }) {
  const stripes = Array.from({ length: 10 }, (_, i) => i);
  return (
    <svg
      viewBox="0 0 560 470"
      className={className}
      role="img"
      aria-label="A shop counter operator serving a customer, with a fingerprint scanner, cash and a screen showing the day's records"
    >
      {/* backdrop */}
      <circle cx="290" cy="250" r="215" fill="var(--brand-bg)" />
      <circle cx="96" cy="96" r="10" fill="var(--brand)" opacity=".25" />
      <circle cx="510" cy="120" r="6" fill="var(--brand)" opacity=".35" />
      <ellipse cx="280" cy="438" rx="255" ry="14" fill={INK} opacity=".08" />

      {/* building */}
      <rect
        x="70"
        y="120"
        width="420"
        height="310"
        rx="6"
        fill={PAPER}
        stroke={INK}
        strokeOpacity=".12"
      />

      {/* sign board */}
      <rect x="150" y="96" width="6" height="26" fill={INK} />
      <rect x="404" y="96" width="6" height="26" fill={INK} />
      <rect x="110" y="38" width="340" height="60" rx="12" fill={INK} />
      <text
        x="280"
        y="76"
        textAnchor="middle"
        fill="#fff"
        fontWeight={800}
        fontSize="22"
        letterSpacing="4"
        fontFamily="var(--font-display)"
      >
        SEVA KENDRA
      </text>
      <circle cx="136" cy="68" r="6" fill="var(--brand)" className="art-blink" />

      {/* awning */}
      <g>
        {stripes.map((i) => (
          <rect
            key={`s${i}`}
            x={70 + i * 42}
            y="118"
            width="42"
            height="34"
            fill={i % 2 ? '#ffffff' : 'var(--brand)'}
          />
        ))}
        {stripes.map((i) => (
          <circle
            key={`c${i}`}
            cx={91 + i * 42}
            cy="152"
            r="21"
            fill={i % 2 ? '#ffffff' : 'var(--brand)'}
            stroke={INK}
            strokeOpacity=".08"
          />
        ))}
      </g>

      {/* back wall: shelves */}
      <g opacity=".95">
        <rect x="96" y="214" width="96" height="5" rx="2" fill={INK} opacity=".25" />
        <rect x="96" y="256" width="96" height="5" rx="2" fill={INK} opacity=".25" />
        <rect x="102" y="190" width="16" height="24" rx="2" fill="#e0a548" />
        <rect x="121" y="196" width="14" height="18" rx="2" fill="var(--brand)" opacity=".7" />
        <rect x="138" y="186" width="20" height="28" rx="2" fill="#5fa37e" />
        <rect x="162" y="194" width="24" height="20" rx="2" fill="#d9c7ad" />
        <rect x="104" y="234" width="30" height="22" rx="2" fill="#d9c7ad" />
        <rect x="138" y="230" width="14" height="26" rx="2" fill="#e0a548" />
        <rect x="156" y="236" width="30" height="20" rx="2" fill="var(--brand)" opacity=".55" />
      </g>

      {/* wall poster + clock */}
      <g className="art-sway">
        <rect
          x="372"
          y="178"
          width="78"
          height="60"
          rx="6"
          fill="#fff"
          stroke={INK}
          strokeOpacity=".15"
        />
        <rect x="380" y="186" width="30" height="8" rx="2" fill="var(--brand)" />
        <rect x="380" y="200" width="60" height="5" rx="2" fill={INK} opacity=".2" />
        <rect x="380" y="210" width="50" height="5" rx="2" fill={INK} opacity=".2" />
        <rect x="380" y="220" width="40" height="5" rx="2" fill={INK} opacity=".2" />
      </g>
      <circle cx="318" cy="196" r="18" fill="#fff" stroke={INK} strokeWidth="3" />
      <path d="M318 184v12l8 6" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />

      {/* operator */}
      <g>
        <rect x="180" y="262" width="104" height="60" rx="30" fill="#3d4a5c" />
        <path d="M222 262l10 16 10-16z" fill="#fff" />
        <rect x="222" y="238" width="20" height="26" rx="6" fill={SKIN_A} />
        <circle cx="232" cy="220" r="29" fill={SKIN_A} />
        <path d="M203 216a29 29 0 0 1 58 0q-12-12-29-10q-17-2-29 10z" fill={INK} />
        <circle cx="222" cy="222" r="2.6" fill={INK} />
        <circle cx="242" cy="222" r="2.6" fill={INK} />
        <path
          d="M224 233q8 6 16 0"
          stroke={INK}
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="216" cy="230" r="4" fill="var(--brand)" opacity=".18" />
        <circle cx="248" cy="230" r="4" fill="var(--brand)" opacity=".18" />
      </g>

      {/* monitor on the counter */}
      <g>
        <rect x="294" y="226" width="104" height="72" rx="7" fill={INK} />
        <rect x="300" y="232" width="92" height="58" rx="3" fill="#fff" />
        <rect x="306" y="238" width="38" height="6" rx="2" fill="var(--brand)" />
        <rect
          x="310"
          y="254"
          width="10"
          height="30"
          rx="2"
          fill="var(--brand)"
          opacity=".85"
          className="art-bar"
        />
        <rect
          x="326"
          y="254"
          width="10"
          height="30"
          rx="2"
          fill="#e0a548"
          className="art-bar"
          style={{ animationDelay: '.4s' }}
        />
        <rect
          x="342"
          y="254"
          width="10"
          height="30"
          rx="2"
          fill="#5fa37e"
          className="art-bar"
          style={{ animationDelay: '.8s' }}
        />
        <rect
          x="358"
          y="254"
          width="10"
          height="30"
          rx="2"
          fill="var(--brand)"
          opacity=".6"
          className="art-bar"
          style={{ animationDelay: '1.2s' }}
        />
        <rect
          x="374"
          y="254"
          width="10"
          height="30"
          rx="2"
          fill="#e0a548"
          opacity=".8"
          className="art-bar"
          style={{ animationDelay: '1.6s' }}
        />
        <rect x="338" y="298" width="16" height="8" fill={INK} />
      </g>

      {/* counter */}
      <rect x="100" y="308" width="360" height="122" rx="4" fill="var(--brand)" />
      <rect x="88" y="300" width="384" height="14" rx="5" fill={INK} />
      <rect x="132" y="340" width="296" height="58" rx="10" fill="#fff" opacity=".16" />
      <text
        x="280"
        y="375"
        textAnchor="middle"
        fill="#fff"
        fontWeight={700}
        fontSize="15"
        letterSpacing="2"
        fontFamily="var(--font-display)"
      >
        AEPS · DMT · PAN · BILLS
      </text>

      {/* operator hands */}
      <rect x="190" y="282" width="18" height="24" rx="9" fill="#3d4a5c" />
      <rect x="256" y="282" width="18" height="24" rx="9" fill="#3d4a5c" />
      <circle cx="199" cy="303" r="8" fill={SKIN_A} />
      <circle cx="265" cy="303" r="8" fill={SKIN_A} />

      {/* fingerprint scanner */}
      <rect x="134" y="284" width="46" height="18" rx="5" fill="#3d4a5c" />
      <ellipse cx="152" cy="292" rx="10" ry="5" fill="#9fb3c8" />
      <circle cx="172" cy="292" r="3" fill="#22c55e" className="art-blink" />

      {/* cash + rising coins */}
      <g>
        <rect x="404" y="290" width="44" height="10" rx="2" fill="#5fa37e" />
        <rect x="408" y="282" width="44" height="10" rx="2" fill="#78b996" />
        <circle cx="430" cy="276" r="6" fill="#e0a548" className="art-coin" />
        <circle
          cx="444"
          cy="276"
          r="5"
          fill="#e0a548"
          className="art-coin"
          style={{ animationDelay: '1.4s' }}
        />
      </g>

      {/* customer (front, right) */}
      <g>
        <path d="M444 300q26-30 52 0l14 130h-80z" fill="#e0a548" />
        <path d="M454 296q16 14 32 0l8 30q-24 14-48 0z" fill="var(--brand-alt)" opacity=".85" />
        <rect x="462" y="262" width="18" height="22" rx="6" fill={SKIN_B} />
        <circle cx="471" cy="244" r="25" fill={SKIN_B} />
        <path
          d="M446 244a25 25 0 0 1 50-2q-6 30 4 48q-14-6-14-30q-14-4-26-22q-4 2-14 6z"
          fill={INK}
        />
        <circle cx="461" cy="246" r="2.4" fill={INK} />
        <path
          d="M458 256q6 4 12 0"
          stroke={INK}
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />
        {/* arm + phone */}
        <path
          d="M452 312q-18 6-22 -10"
          stroke={SKIN_B}
          strokeWidth="11"
          strokeLinecap="round"
          fill="none"
        />
        <rect x="418" y="278" width="18" height="30" rx="4" fill={INK} />
        <rect x="421" y="282" width="12" height="20" rx="2" fill="#5fa37e" />
      </g>
    </svg>
  );
}

/** Bank-correspondent kiosk: bank building with a fingerprint badge. */
export function BankArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 140" className={className} aria-hidden>
      <circle cx="120" cy="74" r="62" fill="var(--brand-bg)" />
      <path d="M70 58l50-26 50 26z" fill="var(--brand)" />
      <rect x="70" y="58" width="100" height="8" fill={INK} />
      {[80, 100, 120, 140, 160].map((x) => (
        <rect
          key={x}
          x={x - 4}
          y="68"
          width="8"
          height="40"
          rx="2"
          fill="#fff"
          stroke={INK}
          strokeOpacity=".2"
        />
      ))}
      <rect x="64" y="108" width="112" height="10" rx="2" fill={INK} />
      <circle cx="120" cy="48" r="5" fill="#fff" />
      <g className="animate-float">
        <circle cx="182" cy="40" r="18" fill="#fff" stroke="var(--brand)" strokeWidth="3" />
        <path
          d="M175 44q0-10 7-10t7 10M178 46q0-7 4-7t4 7M182 40v10"
          stroke="var(--brand)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </svg>
  );
}

/** CSC / Digital Seva: documents, an ID card and a stamp. */
export function CscArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 140" className={className} aria-hidden>
      <circle cx="120" cy="74" r="62" fill="var(--brand-bg)" />
      <rect
        x="78"
        y="26"
        width="76"
        height="98"
        rx="6"
        fill="#fff"
        stroke={INK}
        strokeOpacity=".15"
        transform="rotate(-6 116 75)"
      />
      <rect
        x="88"
        y="22"
        width="76"
        height="98"
        rx="6"
        fill="#fff"
        stroke={INK}
        strokeOpacity=".2"
      />
      <rect x="98" y="34" width="34" height="7" rx="2" fill="var(--brand)" />
      {[50, 60, 70, 80].map((y, i) => (
        <rect key={y} x="98" y={y} width={56 - i * 8} height="5" rx="2" fill={INK} opacity=".18" />
      ))}
      <g className="animate-float" style={{ animationDelay: '.8s' }}>
        <rect x="132" y="82" width="70" height="44" rx="6" fill={INK} />
        <circle cx="150" cy="100" r="9" fill="#d9c7ad" />
        <rect x="164" y="94" width="30" height="5" rx="2" fill="#fff" opacity=".7" />
        <rect x="164" y="104" width="22" height="5" rx="2" fill="#fff" opacity=".4" />
        <rect x="142" y="114" width="52" height="4" rx="2" fill="var(--brand)" />
      </g>
      <circle
        cx="74"
        cy="104"
        r="16"
        fill="none"
        stroke="var(--brand)"
        strokeWidth="3"
        strokeDasharray="4 3"
      />
      <path
        d="M66 104l6 6 10-12"
        stroke="var(--brand)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** Retail / recharge shop: phone with recharge, bill bulb and rupee coins. */
export function ShopArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 140" className={className} aria-hidden>
      <circle cx="120" cy="74" r="62" fill="var(--brand-bg)" />
      <rect x="92" y="16" width="56" height="112" rx="10" fill={INK} />
      <rect x="97" y="26" width="46" height="88" rx="4" fill="#fff" />
      <rect x="103" y="34" width="34" height="8" rx="2" fill="var(--brand)" />
      <text
        x="120"
        y="70"
        textAnchor="middle"
        fontWeight={800}
        fontSize="17"
        fill={INK}
        fontFamily="var(--font-display)"
      >
        ₹299
      </text>
      <rect x="103" y="84" width="34" height="12" rx="6" fill="#5fa37e" />
      <g className="animate-float">
        <circle cx="60" cy="56" r="18" fill="#fff" stroke="#e0a548" strokeWidth="3" />
        <path
          d="M54 52a6 6 0 1 1 12 0c0 4-3 5-3 8h-6c0-3-3-4-3-8zM57 64h6"
          stroke="#e0a548"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
      </g>
      <g className="animate-float" style={{ animationDelay: '1.2s' }}>
        <circle cx="182" cy="92" r="16" fill="#e0a548" />
        <text x="182" y="98" textAnchor="middle" fontWeight={800} fontSize="15" fill="#fff">
          ₹
        </text>
      </g>
      <circle cx="176" cy="40" r="6" fill="var(--brand)" className="art-blink" />
    </svg>
  );
}
