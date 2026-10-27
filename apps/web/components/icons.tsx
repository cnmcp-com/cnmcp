type IconProps = { className?: string };

export function IconGitHub({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.7 7.7 0 0 1 8 3.87c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

export function IconStar({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 1.2 9.9 5.6l4.8.5-3.6 3.2.9 4.7L8 11.8 3.9 14l.9-4.7L1.3 6.1l4.8-.5L8 1.2Z"
      />
    </svg>
  );
}

export function IconCode({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.2 4.2 2.4 8l2.8 3.8M10.8 4.2 13.6 8l-2.8 3.8M9 2.8 7 13.2"
      />
    </svg>
  );
}

export function IconLike({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.2 14H3.4A1.4 1.4 0 0 1 2 12.6V7.8c0-.8.6-1.4 1.4-1.4h1.7l2.2-3.7c.3-.5.9-.8 1.5-.6.6.2 1 .8 1 1.4v2.1h2.6c.9 0 1.6.8 1.5 1.7l-.6 4.2a1.6 1.6 0 0 1-1.6 1.4H6.2Zm0-1.4h5.4l.6-4.2H8.4V3.6L6.2 7.2v5.4Z"
      />
    </svg>
  );
}

export function IconBookmark({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M4 1.8h8A1.2 1.2 0 0 1 13.2 3v11.2L8 11.1l-5.2 3.1V3A1.2 1.2 0 0 1 4 1.8Z" />
    </svg>
  );
}

export function IconShare({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.2 6.4 10 4.6M6.2 9.6 10 11.4M4.6 9.6a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6ZM11.4 6.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6ZM11.4 13.4a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z"
      />
    </svg>
  );
}

export function IconShield({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        d="M8 1.6 13 3.4v4.2c0 3.1-2.1 5.2-5 6.8-2.9-1.6-5-3.7-5-6.8V3.4L8 1.6Z"
      />
      <path fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" d="M5.6 8.1 7.2 9.7 10.5 6.4" />
    </svg>
  );
}
