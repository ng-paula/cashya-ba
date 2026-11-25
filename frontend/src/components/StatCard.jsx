import Icon from './Icon.jsx';

/** Compact KPI card. variant: 'default' | 'highlight'. Clickable when onClick is given. */
export default function StatCard({ icon, value, label, sub, variant = 'default', onClick }) {
  const Tag = onClick ? 'button' : 'article';
  return (
    <Tag className={`stat-card stat-card--${variant} ${onClick ? 'is-clickable' : ''}`} onClick={onClick}>
      <span className="stat-card__label">
        <Icon name={icon} size={16} />
        {label}
      </span>
      <span className="stat-card__value amount">{value}</span>
      {sub && <span className="stat-card__sub">{sub}</span>}
    </Tag>
  );
}
