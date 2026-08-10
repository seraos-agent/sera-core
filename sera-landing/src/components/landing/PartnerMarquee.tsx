import './PartnerMarquee.css';

const row1Base = [
  { name: 'Ethereum', src: '/ethereum.png' },
  { name: 'Base', src: '/base.svg' },
  { name: 'Polygon', src: '/polygon.png' },
  { name: 'Hyperliquid', src: '/hyperliquid.png' },
];
const row1 = [...row1Base, ...row1Base, ...row1Base];

// Repeat to ensure the row is wide enough for the marquee loop
const row2Base = [
  { name: 'WalletConnect', src: 'https://raw.githubusercontent.com/WalletConnect/walletconnect-assets/master/Logo/Blue%20(Default)/Logo.svg' },
  { name: 'Thirdweb', src: 'https://thirdweb.com/favicon.ico' },
  { name: 'Cloudflare', src: 'https://cdn.simpleicons.org/cloudflare/F38020' },
];
const row2 = [...row2Base, ...row2Base, ...row2Base];

export function PartnerMarquee() {
  const content1 = row1.map((p, i) => (
    <div key={`r1-${i}`} className="partner-item">
      <div className="partner-img-frame">
        <img src={p.src} alt={p.name} />
      </div>
      <span className="partner-name">{p.name}</span>
    </div>
  ));

  const content2 = row2.map((p, i) => (
    <div key={`r2-${i}`} className="partner-item">
      <div className="partner-img-frame">
        <img src={p.src} alt={p.name} />
      </div>
      <span className="partner-name">{p.name}</span>
    </div>
  ));

  return (
    <div className="partner-marquee-wrapper">
      {/* Row 1 */}
      <div className="partner-marquee-container">
        <div className="partner-marquee-content">
          {content1}
        </div>
        <div className="partner-marquee-content" aria-hidden="true">
          {content1}
        </div>
      </div>
      
      {/* Row 2 */}
      <div className="partner-marquee-container">
        <div className="partner-marquee-content reverse">
          {content2}
        </div>
        <div className="partner-marquee-content reverse" aria-hidden="true">
          {content2}
        </div>
      </div>
    </div>
  );
}
