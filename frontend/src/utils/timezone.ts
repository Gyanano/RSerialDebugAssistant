import { TimezoneOption } from '../types';

const STORAGE_KEY = 'serialDebug_timezone';

// List of timezone options (UTC offsets from -12 to +14)
export const TIMEZONE_OPTIONS: { value: TimezoneOption; label: string; labelZh: string }[] = [
  { value: 'System', label: 'System (Auto-detect)', labelZh: '系统 (自动检测)' },
  { value: 'UTC', label: 'UTC', labelZh: 'UTC' },
  { value: 'UTC-12', label: 'UTC-12', labelZh: 'UTC-12' },
  { value: 'UTC-11', label: 'UTC-11', labelZh: 'UTC-11' },
  { value: 'UTC-10', label: 'UTC-10 (Hawaii)', labelZh: 'UTC-10 (夏威夷)' },
  { value: 'UTC-9', label: 'UTC-9 (Alaska)', labelZh: 'UTC-9 (阿拉斯加)' },
  { value: 'UTC-8', label: 'UTC-8 (Pacific)', labelZh: 'UTC-8 (太平洋时间)' },
  { value: 'UTC-7', label: 'UTC-7 (Mountain)', labelZh: 'UTC-7 (山地时间)' },
  { value: 'UTC-6', label: 'UTC-6 (Central)', labelZh: 'UTC-6 (中部时间)' },
  { value: 'UTC-5', label: 'UTC-5 (Eastern)', labelZh: 'UTC-5 (东部时间)' },
  { value: 'UTC-4', label: 'UTC-4 (Atlantic)', labelZh: 'UTC-4 (大西洋时间)' },
  { value: 'UTC-3', label: 'UTC-3 (Brazil)', labelZh: 'UTC-3 (巴西)' },
  { value: 'UTC-2', label: 'UTC-2', labelZh: 'UTC-2' },
  { value: 'UTC-1', label: 'UTC-1', labelZh: 'UTC-1' },
  { value: 'UTC+1', label: 'UTC+1 (CET)', labelZh: 'UTC+1 (中欧时间)' },
  { value: 'UTC+2', label: 'UTC+2 (EET)', labelZh: 'UTC+2 (东欧时间)' },
  { value: 'UTC+3', label: 'UTC+3 (Moscow)', labelZh: 'UTC+3 (莫斯科)' },
  { value: 'UTC+4', label: 'UTC+4 (Dubai)', labelZh: 'UTC+4 (迪拜)' },
  { value: 'UTC+5', label: 'UTC+5 (Pakistan)', labelZh: 'UTC+5 (巴基斯坦)' },
  { value: 'UTC+5:30', label: 'UTC+5:30 (India)', labelZh: 'UTC+5:30 (印度)' },
  { value: 'UTC+6', label: 'UTC+6 (Bangladesh)', labelZh: 'UTC+6 (孟加拉)' },
  { value: 'UTC+7', label: 'UTC+7 (Thailand)', labelZh: 'UTC+7 (泰国)' },
  { value: 'UTC+8', label: 'UTC+8 (China/Singapore)', labelZh: 'UTC+8 (中国/新加坡)' },
  { value: 'UTC+9', label: 'UTC+9 (Japan/Korea)', labelZh: 'UTC+9 (日本/韩国)' },
  { value: 'UTC+10', label: 'UTC+10 (Sydney)', labelZh: 'UTC+10 (悉尼)' },
  { value: 'UTC+11', label: 'UTC+11', labelZh: 'UTC+11' },
  { value: 'UTC+12', label: 'UTC+12 (Auckland)', labelZh: 'UTC+12 (奥克兰)' },
  { value: 'UTC+13', label: 'UTC+13', labelZh: 'UTC+13' },
  { value: 'UTC+14', label: 'UTC+14', labelZh: 'UTC+14' },
];

/**
 * Get the system's timezone offset in hours
 */
export const getSystemTimezoneOffset = (): number => {
  // JavaScript getTimezoneOffset returns the offset in minutes, and is inverted
  // (positive for behind UTC, negative for ahead)
  return -new Date().getTimezoneOffset() / 60;
};

/**
 * Get the IANA timezone name if available
 */
export const getSystemTimezoneName = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
};

/**
 * Get the system timezone as a formatted UTC offset string (e.g., "UTC+8", "UTC-5")
 */
export const getSystemTimezoneAsUtcOffset = (): string => {
  const offsetHours = getSystemTimezoneOffset();
  if (offsetHours === 0) return 'UTC';

  const sign = offsetHours >= 0 ? '+' : '';
  // Handle fractional offsets like UTC+5:30
  if (Number.isInteger(offsetHours)) {
    return `UTC${sign}${offsetHours}`;
  } else {
    const hours = Math.floor(Math.abs(offsetHours));
    const minutes = Math.round((Math.abs(offsetHours) - hours) * 60);
    const signChar = offsetHours >= 0 ? '+' : '-';
    return `UTC${signChar}${hours}:${minutes.toString().padStart(2, '0')}`;
  }
};

/**
 * Parse a UTC offset string (e.g., 'UTC+8', 'UTC-5:30') to hours
 */
export const parseUtcOffset = (offset: string): number => {
  if (offset === 'UTC') return 0;

  const match = offset.match(/^UTC([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return 0;

  const sign = match[1] === '+' ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const minutes = match[3] ? parseInt(match[3], 10) : 0;

  return sign * (hours + minutes / 60);
};

/**
 * Format a timestamp with the specified timezone
 */
export const formatTimestampWithTimezone = (
  timestamp: string,
  timezone: TimezoneOption
): string => {
  const date = new Date(timestamp);

  if (timezone === 'System') {
    // Use the browser's local timezone
    const timeStr = date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${timeStr}.${ms}`;
  }

  // For UTC offsets, manually calculate the time
  const offsetHours = parseUtcOffset(timezone);
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60 * 1000;
  const targetTime = new Date(utcTime + offsetHours * 60 * 60 * 1000);

  const hours = targetTime.getHours().toString().padStart(2, '0');
  const minutes = targetTime.getMinutes().toString().padStart(2, '0');
  const seconds = targetTime.getSeconds().toString().padStart(2, '0');
  const ms = targetTime.getMilliseconds().toString().padStart(3, '0');

  return `${hours}:${minutes}:${seconds}.${ms}`;
};

/**
 * Format a date for filenames with the specified timezone
 */
export const formatDateForFilename = (
  date: Date,
  timezone: TimezoneOption
): string => {
  let targetDate: Date;

  if (timezone === 'System') {
    targetDate = date;
  } else {
    const offsetHours = parseUtcOffset(timezone);
    const utcTime = date.getTime() + date.getTimezoneOffset() * 60 * 1000;
    targetDate = new Date(utcTime + offsetHours * 60 * 60 * 1000);
  }

  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  const hours = String(targetDate.getHours()).padStart(2, '0');
  const minutes = String(targetDate.getMinutes()).padStart(2, '0');
  const seconds = String(targetDate.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
};

/**
 * Load timezone setting from localStorage
 */
export const loadTimezone = (): TimezoneOption => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && (saved === 'System' || saved.startsWith('UTC'))) {
    return saved;
  }
  return 'System';
};

/**
 * Save timezone setting to localStorage
 */
export const saveTimezone = (timezone: TimezoneOption): void => {
  localStorage.setItem(STORAGE_KEY, timezone);
};
