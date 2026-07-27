/**
 * FNV-1a, 64 bit, implemented on two 32 bit halves.
 *
 * This is the fingerprint used by the determinism test (section 19.3): the same
 * seed plus the same command log has to produce the same digest after 1_000,
 * 10_000 and 50_000 ticks, in the same process and after a save/load round
 * trip. BigInt would be simpler but is far too slow once whole tile and vehicle
 * arrays are hashed, so the 64 bit multiply is done by hand.
 *
 * FNV-1a per byte:  hash ^= byte;  hash *= 0x100000001b3
 */

const OFFSET_BASIS_HI = 0xcbf29ce4 | 0;
const OFFSET_BASIS_LO = 0x84222325 | 0;
const PRIME_HI = 0x00000100;
const PRIME_LO = 0x000001b3;

/** 2^32, used where `>>>` cannot be applied because the value exceeds 32 bits. */
const TWO_POW_32 = 4294967296;

export class Fnv1a64 {
  private hi = OFFSET_BASIS_HI;
  private lo = OFFSET_BASIS_LO;

  /** Reset to the offset basis so one instance can be reused between ticks. */
  reset(): this {
    this.hi = OFFSET_BASIS_HI;
    this.lo = OFFSET_BASIS_LO;
    return this;
  }

  /** Multiply the running hash by the 64 bit FNV prime, modulo 2^64. */
  private multiplyByPrime(): void {
    const aLo = this.lo >>> 0;
    const aHi = this.hi >>> 0;

    const a0 = aLo & 0xffff;
    const a1 = aLo >>> 16;
    const b0 = PRIME_LO & 0xffff;
    const b1 = PRIME_LO >>> 16;

    const p00 = a0 * b0; // < 2^32
    let mid = (p00 >>> 16) + a1 * b0; // < 2^32 + 2^16
    let carry = (mid / 65536) | 0;
    mid = (mid % 65536) + a0 * b1;
    carry += (mid / 65536) | 0;

    const lo = (((mid & 0xffff) << 16) | (p00 & 0xffff)) >>> 0;
    const hi = (carry + a1 * b1 + Math.imul(aLo, PRIME_HI) + Math.imul(aHi, PRIME_LO)) >>> 0;

    this.lo = lo | 0;
    this.hi = hi | 0;
  }

  /** Absorb one byte. */
  byte(value: number): this {
    this.lo = this.lo ^ (value & 0xff);
    this.multiplyByPrime();
    return this;
  }

  /** Absorb a 32 bit integer, little endian. */
  u32(value: number): this {
    const v = value | 0;
    this.byte(v & 0xff);
    this.byte((v >>> 8) & 0xff);
    this.byte((v >>> 16) & 0xff);
    this.byte((v >>> 24) & 0xff);
    return this;
  }

  /**
   * Absorb an exact integer that may exceed 32 bits - money is stored in cents
   * and legitimately reaches 10^15. Split is done by division rather than by
   * shifting, because bit operators would silently truncate to 32 bits.
   */
  int(value: number): this {
    const hi = Math.floor(value / TWO_POW_32);
    const lo = value - hi * TWO_POW_32;
    this.u32(lo | 0);
    this.u32(hi | 0);
    return this;
  }

  /** Absorb a float by hashing its exact IEEE-754 bit pattern. */
  f64(value: number): this {
    scratchF64[0] = value;
    for (let i = 0; i < 8; i++) {
      this.byte(scratchBytes[i]!);
    }
    return this;
  }

  /**
   * Absorb a string as UTF-8. Encoded by hand instead of via TextEncoder so the
   * simulation core stays free of host globals and allocations. No length
   * prefix, so the result matches the canonical FNV-1a test vectors; callers
   * that need framing hash the length themselves.
   */
  str(value: string): this {
    for (let i = 0; i < value.length; i++) {
      let code = value.charCodeAt(i);
      // Combine surrogate pairs into a single code point.
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
        const low = value.charCodeAt(i + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
          i++;
        }
      }
      if (code < 0x80) {
        this.byte(code);
      } else if (code < 0x800) {
        this.byte(0xc0 | (code >> 6));
        this.byte(0x80 | (code & 0x3f));
      } else if (code < 0x10000) {
        this.byte(0xe0 | (code >> 12));
        this.byte(0x80 | ((code >> 6) & 0x3f));
        this.byte(0x80 | (code & 0x3f));
      } else {
        this.byte(0xf0 | (code >> 18));
        this.byte(0x80 | ((code >> 12) & 0x3f));
        this.byte(0x80 | ((code >> 6) & 0x3f));
        this.byte(0x80 | (code & 0x3f));
      }
    }
    return this;
  }

  /** Absorb a raw byte range. */
  bytes(data: Uint8Array): this {
    for (let i = 0; i < data.length; i++) {
      this.byte(data[i]!);
    }
    return this;
  }

  /** Absorb every element of an Int32/Uint32/Uint8/Uint16 backed array. */
  intArray(data: ArrayLike<number>): this {
    this.u32(data.length);
    for (let i = 0; i < data.length; i++) {
      this.u32(data[i]! | 0);
    }
    return this;
  }

  /** 16 character lower case hex digest. */
  digest(): string {
    return (
      (this.hi >>> 0).toString(16).padStart(8, '0') + (this.lo >>> 0).toString(16).padStart(8, '0')
    );
  }
}

// Module level scratch space: hashing must not allocate, it is called from the
// determinism harness in tight loops over the whole world state.
const scratchF64 = new Float64Array(1);
const scratchBytes = new Uint8Array(scratchF64.buffer);

/** Convenience wrapper for one-shot hashing of a byte range. */
export function hashBytes(data: Uint8Array): string {
  return new Fnv1a64().bytes(data).digest();
}

/** Convenience wrapper for one-shot hashing of a string. */
export function hashString(value: string): string {
  return new Fnv1a64().str(value).digest();
}
