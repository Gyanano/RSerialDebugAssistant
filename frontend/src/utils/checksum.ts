import { ChecksumType, ChecksumConfig } from '../types';

/**
 * Calculate XOR checksum (all bytes XORed together)
 */
export function calculateXOR(data: Uint8Array): number[] {
  let result = 0;
  for (let i = 0; i < data.length; i++) {
    result ^= data[i];
  }
  return [result & 0xFF];
}

/**
 * Calculate ADD8 checksum (sum of all bytes, modulo 256)
 */
export function calculateADD8(data: Uint8Array): number[] {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
  }
  return [sum & 0xFF];
}

/**
 * Calculate CRC8 checksum (polynomial 0x07, init 0x00)
 */
export function calculateCRC8(data: Uint8Array): number[] {
  const polynomial = 0x07;
  let crc = 0x00;

  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 0x80) {
        crc = ((crc << 1) ^ polynomial) & 0xFF;
      } else {
        crc = (crc << 1) & 0xFF;
      }
    }
  }

  return [crc];
}

/**
 * Calculate CRC16 checksum (CRC-16-IBM/ANSI, polynomial 0x8005, init 0xFFFF)
 * Returns 2 bytes in little-endian order (low byte first)
 */
export function calculateCRC16(data: Uint8Array): number[] {
  const polynomial = 0x8005;
  let crc = 0xFFFF;

  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 0x0001) {
        crc = ((crc >> 1) ^ 0xA001) & 0xFFFF; // Reflected polynomial
      } else {
        crc = (crc >> 1) & 0xFFFF;
      }
    }
  }

  // Return low byte first, then high byte (little-endian)
  return [crc & 0xFF, (crc >> 8) & 0xFF];
}

/**
 * Calculate CCITT-CRC16 checksum (CRC-16-CCITT, polynomial 0x1021, init 0xFFFF)
 * Returns 2 bytes in big-endian order (high byte first)
 */
export function calculateCCITTCRC16(data: Uint8Array): number[] {
  const polynomial = 0x1021;
  let crc = 0xFFFF;

  for (let i = 0; i < data.length; i++) {
    crc ^= (data[i] << 8);
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ polynomial) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }

  // Return high byte first, then low byte (big-endian)
  return [(crc >> 8) & 0xFF, crc & 0xFF];
}

/**
 * Get the slice of data based on checksum range configuration
 * @param data - The full data array
 * @param startIndex - 0-indexed start position (0 = first byte)
 * @param endIndex - 0-indexed end position, supports negative (-1 = last byte, -2 = second to last)
 */
export function getChecksumRange(data: Uint8Array, startIndex: number, endIndex: number): Uint8Array {
  const length = data.length;

  // Handle start index (0-indexed)
  const start = Math.max(0, startIndex);

  // Handle end index (supports negative indexing like Python)
  let end: number;
  if (endIndex < 0) {
    // Negative index: -1 = last byte, -2 = second to last, etc.
    // Convert to 0-indexed position and add 1 for slice (exclusive end)
    end = length + endIndex + 1;
  } else {
    // Positive index: add 1 for slice (exclusive end)
    end = Math.min(endIndex + 1, length);
  }

  // Ensure valid range
  if (start >= length || end <= start) {
    return new Uint8Array(0);
  }

  return data.slice(start, end);
}

/**
 * Calculate checksum based on configuration
 */
export function calculateChecksum(data: Uint8Array, config: ChecksumConfig): number[] {
  if (config.type === 'None') {
    return [];
  }

  // Get the range of data to calculate checksum for
  const rangeData = getChecksumRange(data, config.startIndex, config.endIndex);

  if (rangeData.length === 0) {
    return [];
  }

  switch (config.type) {
    case 'XOR':
      return calculateXOR(rangeData);
    case 'ADD8':
      return calculateADD8(rangeData);
    case 'CRC8':
      return calculateCRC8(rangeData);
    case 'CRC16':
      return calculateCRC16(rangeData);
    case 'CCITT-CRC16':
      return calculateCCITTCRC16(rangeData);
    default:
      return [];
  }
}

/**
 * Get the byte length of the checksum for a given type
 */
export function getChecksumLength(type: ChecksumType): number {
  switch (type) {
    case 'None':
      return 0;
    case 'XOR':
    case 'ADD8':
    case 'CRC8':
      return 1;
    case 'CRC16':
    case 'CCITT-CRC16':
      return 2;
    default:
      return 0;
  }
}

/**
 * Append checksum to data
 */
export function appendChecksum(data: Uint8Array, config: ChecksumConfig): Uint8Array {
  const checksum = calculateChecksum(data, config);

  if (checksum.length === 0) {
    return data;
  }

  const result = new Uint8Array(data.length + checksum.length);
  result.set(data, 0);
  result.set(checksum, data.length);

  return result;
}
