function assert(condition: unknown, message?: string): void {
  if (!condition) {
    throw new Error(message ?? 'Assertion failed')
  }
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const asciiDecoder = new TextDecoder('latin1')

function alignUp(x: number, bytes: 4 | 8): number {
  const mask = bytes - 1

  return (x + mask) & ~mask
}

class Channel {
  private offset = 0
  storageUint8: Uint8Array
  storageUint32: Uint32Array
  storageInt32: Int32Array
  storageFloat32: Float32Array
  storageFloat64: Float64Array

  constructor(buffer: ArrayBuffer, offset = 0, sizeInBytes = buffer.byteLength) {
    assert(offset % 8 === 0)
    assert(sizeInBytes % 8 === 0)
    assert(offset + sizeInBytes <= buffer.byteLength)
    this.storageUint8 = new Uint8Array(buffer, offset, sizeInBytes / Uint8Array.BYTES_PER_ELEMENT)
    this.storageUint32 = new Uint32Array(buffer, offset, sizeInBytes / Uint32Array.BYTES_PER_ELEMENT)
    this.storageInt32 = new Int32Array(buffer, offset, sizeInBytes / Int32Array.BYTES_PER_ELEMENT)
    this.storageFloat32 = new Float32Array(buffer, offset, sizeInBytes / Float32Array.BYTES_PER_ELEMENT)
    this.storageFloat64 = new Float64Array(buffer, offset, sizeInBytes / Float64Array.BYTES_PER_ELEMENT)
  }

  reset(): void {
    this.offset = 0
  }

  offset8(): number {
    return this.offset
  }

  offset32(): number {
    // align to 4 bytes
    this.offset = alignUp(this.offset, 4)

    // divide by 4
    return this.offset >>> 2
  }

  offset64(): number {
    // align to 8 bytes
    this.offset = alignUp(this.offset, 8)

    // divide by 8
    return this.offset >>> 3
  }

  advance8(count: number): void {
    const next = this.offset + count
    if (next > this.storageUint8.length) {
      throw Error('Reached end of channel')
    }
    this.offset = next
  }

  advance32(count: number): void {
    this.advance8(count * 4)
  }

  advance64(count: number): void {
    this.advance8(count * 8)
  }
}

export class Writer extends Channel {
  writeUint8(value: number): void {
    const offset = this.offset8()
    this.advance8(1)
    this.storageUint8[offset] = value
  }

  writeUint32(value: number): void {
    const offset = this.offset32()
    this.advance32(1)
    this.storageUint32[offset] = value
  }

  writeInt32(value: number): void {
    const offset = this.offset32()
    this.advance32(1)
    this.storageInt32[offset] = value
  }

  writeFloat32(value: number): void {
    const offset = this.offset32()
    this.advance32(1)
    this.storageFloat32[offset] = value
  }

  writeFloat64(value: number): void {
    const offset = this.offset64()
    this.advance64(1)
    this.storageFloat64[offset] = value
  }

  initUint8(): (value: number) => void {
    const offset = this.offset8()

    this.advance8(1)

    return value => {
      this.storageUint8[offset] = value
    }
  }

  initUint32(): (value: number) => void {
    const offset = this.offset32()

    this.advance32(1)

    return value => {
      this.storageUint32[offset] = value
    }
  }

  initInt32(): (value: number) => void {
    const offset = this.offset32()

    this.advance32(1)

    return value => {
      this.storageInt32[offset] = value
    }
  }

  initFloat32(): (value: number) => void {
    const offset = this.offset32()

    this.advance32(1)

    return value => {
      this.storageFloat32[offset] = value
    }
  }

  initFloat64(): (value: number) => void {
    const offset = this.offset64()

    this.advance64(1)

    return value => {
      this.storageFloat64[offset] = value
    }
  }

  initUint8Elements(length: number): Uint8Array {
    const start = this.offset8()

    this.advance8(length)

    return this.storageUint8.subarray(start, start + length)
  }

  initUint8Array(length: number): Uint8Array {
    this.writeUint32(length)
    return this.initUint8Elements(length)
  }

  initUint32Elements(length: number): Uint32Array {
    const start = this.offset32()

    this.advance32(length)

    return this.storageUint32.subarray(start, start + length)
  }

  initUint32Array(length: number): Uint32Array {
    this.writeUint32(length)
    return this.initUint32Elements(length)
  }

  initInt32Elements(length: number): Int32Array {
    const start = this.offset32()

    this.advance32(length)

    return this.storageInt32.subarray(start, start + length)
  }

  initInt32Array(length: number): Int32Array {
    this.writeUint32(length)
    return this.initInt32Elements(length)
  }

  initFloat32Elements(length: number): Float32Array {
    const start = this.offset32()

    this.advance32(length)

    return this.storageFloat32.subarray(start, start + length)
  }

  initFloat32Array(length: number): Float32Array {
    this.writeUint32(length)
    return this.initFloat32Elements(length)
  }

  initFloat64Elements(length: number): Float64Array {
    const start = this.offset64()

    this.advance64(length)

    return this.storageFloat64.subarray(start, start + length)
  }

  initFloat64Array(length: number): Float64Array {
    this.writeUint32(length)
    return this.initFloat64Elements(length)
  }

  copyUint8Elements(arr: Uint8Array | number[]): void {
    const start = this.offset8()
    this.advance8(arr.length)
    this.storageUint8.set(arr, start)
  }

  copyUint32Elements(arr: Uint32Array | number[]): void {
    const start = this.offset32()
    this.advance32(arr.length)
    this.storageUint32.set(arr, start)
  }

  copyInt32Elements(arr: Int32Array | number[]): void {
    const start = this.offset32()
    this.advance32(arr.length)
    this.storageInt32.set(arr, start)
  }

  copyFloat32Elements(arr: Float32Array | number[]): void {
    const start = this.offset32()
    this.advance32(arr.length)
    this.storageFloat32.set(arr, start)
  }

  copyFloat64Elements(arr: Float64Array | number[]): void {
    const start = this.offset64()
    this.advance64(arr.length)
    this.storageFloat64.set(arr, start)
  }

  copyUint8Array(arr: Uint8Array | number[]): void {
    this.writeUint32(arr.length)
    this.copyUint8Elements(arr)
  }

  copyUint32Array(arr: Uint32Array | number[]): void {
    this.writeUint32(arr.length)
    this.copyUint32Elements(arr)
  }

  copyInt32Array(arr: Int32Array | number[]): void {
    this.writeUint32(arr.length)
    this.copyInt32Elements(arr)
  }

  copyFloat32Array(arr: Float32Array | number[]): void {
    this.writeUint32(arr.length)
    this.copyFloat32Elements(arr)
  }

  copyFloat64Array(arr: Float64Array | number[]): void {
    this.writeUint32(arr.length)
    this.copyFloat64Elements(arr)
  }

  writeAsciiString(value: string): void {
    const data = this.initUint8Array(value.length)

    for (let i = value.length; i-- > 0; ) {
      data[i] = value.charCodeAt(i)
    }
  }

  writeUtf8String(value: string): void {
    const data = textEncoder.encode(value)

    this.copyUint8Array(data)
  }
}

export class Reader extends Channel {
  readUint8(): number {
    const offset = this.offset8()
    this.advance8(1)
    return this.storageUint8[offset]
  }

  readUint32(): number {
    const offset = this.offset32()
    this.advance32(1)
    return this.storageUint32[offset]
  }

  readInt32(): number {
    const offset = this.offset32()
    this.advance32(1)
    return this.storageInt32[offset]
  }

  readFloat32(): number {
    const offset = this.offset32()
    this.advance32(1)
    return this.storageFloat32[offset]
  }

  readFloat64(): number {
    const offset = this.offset64()
    this.advance64(1)
    return this.storageFloat64[offset]
  }

  readUint8Elements(length: number): Uint8Array {
    const start = this.offset8()
    this.advance8(length)
    return this.storageUint8.subarray(start, start + length)
  }

  readUint32Elements(length: number): Uint32Array {
    const start = this.offset32()
    this.advance32(length)
    return this.storageUint32.subarray(start, start + length)
  }

  readInt32Elements(length: number): Int32Array {
    const start = this.offset32()
    this.advance32(length)
    return this.storageInt32.subarray(start, start + length)
  }

  readFloat32Elements(length: number): Float32Array {
    const start = this.offset32()
    this.advance32(length)
    return this.storageFloat32.subarray(start, start + length)
  }

  readFloat64Elements(length: number): Float64Array {
    const start = this.offset64()
    this.advance64(length)
    return this.storageFloat64.subarray(start, start + length)
  }

  readUint8Array(): Uint8Array {
    const length = this.readUint32()

    return this.readUint8Elements(length)
  }

  readUint32Array(): Uint32Array {
    const length = this.readUint32()

    return this.readUint32Elements(length)
  }

  readInt32Array(): Int32Array {
    const length = this.readUint32()

    return this.readInt32Elements(length)
  }

  readFloat32Array(): Float32Array {
    const length = this.readUint32()

    return this.readFloat32Elements(length)
  }

  readFloat64Array(): Float64Array {
    const length = this.readUint32()

    return this.readFloat64Elements(length)
  }

  readUint8Arrays(count: number): Uint8Array[] {
    const result = new Array<Uint8Array>(count)

    for (let i = 0; i < count; i++) {
      result[i] = this.readUint8Array()
    }

    return result
  }

  readUint32Arrays(count: number): Uint32Array[] {
    const result = new Array<Uint32Array>(count)

    for (let i = 0; i < count; i++) {
      result[i] = this.readUint32Array()
    }

    return result
  }

  readInt32Arrays(count: number): Int32Array[] {
    const result = new Array<Int32Array>(count)

    for (let i = 0; i < count; i++) {
      result[i] = this.readInt32Array()
    }

    return result
  }

  readFloat32Arrays(count: number): Float32Array[] {
    const result = new Array<Float32Array>(count)

    for (let i = 0; i < count; i++) {
      result[i] = this.readFloat32Array()
    }

    return result
  }

  readFloat64Arrays(count: number): Float64Array[] {
    const result = new Array<Float64Array>(count)

    for (let i = 0; i < count; i++) {
      result[i] = this.readFloat64Array()
    }

    return result
  }

  readAsciiString(): string {
    const data = this.readUint8Array()

    return asciiDecoder.decode(data)
  }

  readAsciiStrings(count: number): string[] {
    const results = new Array<string>(count)

    for (let i = 0; i < count; i++) {
      results[i] = this.readAsciiString()
    }

    return results
  }

  readUtf8String(): string {
    const length = this.readUint32()
    const data = this.readUint8Elements(length)

    return textDecoder.decode(data)
  }

  readUtf8Strings(count: number): string[] {
    const results = new Array<string>(count)

    for (let i = 0; i < count; i++) {
      results[i] = this.readUtf8String()
    }

    return results
  }
}
