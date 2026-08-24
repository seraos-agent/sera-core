import './PartnerMarquee.css';

const row1Base = [
  { name: 'Ethereum', src: '/ethereum.png' },
  { name: 'Base', src: '/base.svg' },
  { name: 'Hyperliquid', src: '/hyperliquid.png' },
  { name: 'Polygon', src: '/polygon.png' }
];
const row1 = [...row1Base, ...row1Base, ...row1Base];

const row2Base = [
  { name: 'WalletConnect', src: 'https://raw.githubusercontent.com/WalletConnect/walletconnect-assets/master/Logo/Blue%20(Default)/Logo.svg' },
  { name: 'Thirdweb', src: 'https://thirdweb.com/favicon.ico' },
  { name: 'Meta', src: 'https://cdn.simpleicons.org/meta/0668E1' },
  { name: 'Cloudflare', src: 'https://cdn.simpleicons.org/cloudflare/F38020' },
  { name: 'Telegram', src: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg' },
];
const row2 = [...row2Base, ...row2Base, ...row2Base, ...row2Base];

/*
const row3Base = [
  { name: 'Threads', src: '/threads.svg' },
  { name: 'Telegram', src: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg' },
  { name: 'Instagram', src: 'https://upload.wikimedia.org/wikipedia/commons/e/e7/Instagram_logo_2016.svg' },
  { name: 'Twitter', src: '/x.svg' },
];
const row3 = [...row3Base, ...row3Base, ...row3Base];
*/

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

  /*
  const content3 = row3.map((p, i) => (
    <div key={`r3-${i}`} className="partner-item">
      <div className="partner-img-frame">
        <img src={p.src} alt={p.name} />
      </div>
      <span className="partner-name">{p.name}</span>
    </div>
  ));
  */

  return (
    <div className="partner-marquee-wrapper">
      {/* Row 1: Web3 Networks */}
      <div className="partner-marquee-container">
        <div className="partner-marquee-content">
          {content1}
        </div>
        <div className="partner-marquee-content" aria-hidden="true">
          {content1}
        </div>
      </div>

      {/* Row 2: Infrastructure */}
      <div className="partner-marquee-container">
        <div className="partner-marquee-content reverse">
          {content2}
        </div>
        <div className="partner-marquee-content reverse" aria-hidden="true">
          {content2}
        </div>
      </div>

      {/* Row 3: Web2 Socials (Temporarily Hidden)
      <div className="partner-marquee-container">
        <div className="partner-marquee-content">
          {content3}
        </div>
        <div className="partner-marquee-content" aria-hidden="true">
          {content3}
        </div>
      </div>
      */}
    </div>
  );
}
