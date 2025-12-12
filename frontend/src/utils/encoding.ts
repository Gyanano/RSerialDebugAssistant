import { invoke } from '@tauri-apps/api/core';
import { TextEncoding } from '../types';

const STORAGE_KEY_TEXT_ENCODING = 'serialDebug_textEncoding';

/**
 * Get the current text encoding setting from localStorage
 */
export function getTextEncoding(): TextEncoding {
  const saved = localStorage.getItem(STORAGE_KEY_TEXT_ENCODING);
  if (saved === 'utf-8' || saved === 'gbk') {
    return saved;
  }
  return 'utf-8';
}

/**
 * Encode text to bytes using the specified encoding
 * Uses backend Tauri command for GBK encoding support
 */
export async function textToBytes(text: string, encoding: TextEncoding): Promise<Uint8Array> {
  if (encoding === 'utf-8') {
    // Use native TextEncoder for UTF-8 (synchronous and fast)
    return new TextEncoder().encode(text);
  }
  // Use backend for GBK encoding
  const bytes = await invoke<number[]>('encode_text', { text, encoding });
  return new Uint8Array(bytes);
}

/**
 * Decode bytes to text using the specified encoding
 * Uses backend Tauri command for GBK decoding support
 */
export async function bytesToText(bytes: Uint8Array, encoding: TextEncoding): Promise<string> {
  if (encoding === 'utf-8') {
    // Use native TextDecoder for UTF-8 (synchronous and fast)
    try {
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch {
      return '';
    }
  }
  // Use backend for GBK decoding
  const text = await invoke<string>('decode_bytes', { bytes: Array.from(bytes), encoding });
  return text;
}

/**
 * Convert text to hex string using the specified encoding
 * Returns hex bytes separated by spaces (e.g., "C4 E3 BA C3")
 */
export async function textToHex(text: string, encoding: TextEncoding): Promise<string> {
  if (!text) return '';
  const bytes = await textToBytes(text, encoding);
  const hexPairs: string[] = [];
  for (const byte of bytes) {
    hexPairs.push(byte.toString(16).toUpperCase().padStart(2, '0'));
  }
  return hexPairs.join(' ');
}

/**
 * Convert hex string to text using the specified encoding
 * Accepts hex bytes separated by spaces or continuous hex string
 */
export async function hexToText(hex: string, encoding: TextEncoding): Promise<string> {
  if (!hex) return '';
  // Remove all spaces and validate
  const cleanHex = hex.replace(/\s/g, '');
  if (cleanHex.length === 0) return '';

  // Ensure even number of characters
  const paddedHex = cleanHex.length % 2 === 0 ? cleanHex : cleanHex + '0';

  const bytes: number[] = [];
  for (let i = 0; i < paddedHex.length; i += 2) {
    const byte = parseInt(paddedHex.substring(i, i + 2), 16);
    if (!isNaN(byte)) {
      bytes.push(byte);
    }
  }

  return bytesToText(new Uint8Array(bytes), encoding);
}
