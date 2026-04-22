import React from 'react';

type SocialButtonVariant = 'default' | 'primary';

interface SocialButtonProps {
  id: string;
  enabled: boolean;
  serverDomain: string;
  oauthPath: string;
  Icon: React.ComponentType;
  label: string;
  variant?: SocialButtonVariant;
}

const SocialButton = ({
  id,
  enabled,
  serverDomain,
  oauthPath,
  Icon,
  label,
  variant = 'default',
}: SocialButtonProps) => {
  if (!enabled) {
    return null;
  }

  if (variant === 'primary') {
    return (
      <a
        aria-label={label}
        className="flex w-full items-center justify-center rounded-xl bg-[#0055E9] px-6 py-4 text-base font-medium text-white transition-colors duration-200 hover:bg-[#0046C4] focus:outline-none focus:ring-2 focus:ring-[#0055E9] focus:ring-offset-2"
        href={`${serverDomain}/oauth/${oauthPath}`}
        data-testid={id}
      >
        {label}
      </a>
    );
  }

  return (
    <div className="mt-2 flex gap-x-2">
      <a
        aria-label={label}
        className="flex w-full items-center space-x-3 rounded-2xl border border-border-light bg-surface-primary px-5 py-3 text-text-primary transition-colors duration-200 hover:bg-surface-tertiary"
        href={`${serverDomain}/oauth/${oauthPath}`}
        data-testid={id}
      >
        <Icon />
        <p>{label}</p>
      </a>
    </div>
  );
};

export default SocialButton;
