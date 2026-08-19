export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac OS/.test(navigator.userAgent);
}

export function isModifierPressed(event: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return event.metaKey || event.ctrlKey;
}
