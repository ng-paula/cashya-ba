/* Cashya Ba? wordmark — "Cash" is emphasized to show the pun (cash + kasya) */
export default function Logo({ size = 'md', light = false }) {
  return (
    <span className={`logo logo-${size} ${light ? 'logo-light' : ''}`}>
      <span className="logo-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="10" />
          <path d="M11.5 16.5l3 3 6-6.5" />
        </svg>
      </span>
      <span className="logo-text">
        <strong>Cash</strong>ya Ba?
      </span>
    </span>
  );
}
