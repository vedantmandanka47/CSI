import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatEventDateTime(startsAtStr: string, endsAtStr: string): string {
  const start = new Date(startsAtStr);
  const end = new Date(endsAtStr);

  const dateFormatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const timeFormatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `${dateFormatter.format(start)} • ${timeFormatter.format(start)} – ${timeFormatter.format(end)} IST`;
}

export function formatEventDateShort(dateStr: string): { month: string; day: string } {
  const date = new Date(dateStr);
  const monthFormatter = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'short' });
  const dayFormatter = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric' });

  return {
    month: monthFormatter.format(date).toUpperCase(),
    day: dayFormatter.format(date),
  };
}


