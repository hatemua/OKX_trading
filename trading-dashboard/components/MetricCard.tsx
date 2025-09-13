import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  className = '',
}) => {
  const getTrendColor = () => {
    switch (trend) {
      case 'up':
        return 'profit-positive';
      case 'down':
        return 'profit-negative';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className={`metric-card ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className={`text-2xl font-bold ${getTrendColor()}`}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
        
        {Icon && (
          <div className="ml-4">
            <Icon className={`h-8 w-8 ${getTrendColor()}`} />
          </div>
        )}
      </div>
    </div>
  );
};

export default MetricCard;