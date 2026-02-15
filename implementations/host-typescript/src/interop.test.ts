import { describe, test, expect, vi, expectTypeOf } from 'vitest'
import { createInstance, type ExportBase, type InstanceOptions } from './interop'
import { Reader, Writer } from './conduit'
import { MAX_ERROR_SIZE, MAX_LOG_SIZE } from './constants'
import type { ZawReturn } from './types'

const createOptions = (overrides?: Partial<InstanceOptions>): InstanceOptions => {
  return {
    inputChannelSize: 64,
    outputChannelSize: 64,
    initialMemoryPages: 1,
    log: vi.fn(),
    ...overrides,
  }
}

const writeNullTerminated = (buffer: ArrayBuffer, offset: number, size: number, text: string): void => {
  const view = new Uint8Array(buffer, offset, size)
  view.fill(0)
  const data = Buffer.from(text, 'utf8')
  const length = Math.min(data.length, size - 1)
  view.set(data.subarray(0, length), 0)
  view[length] = 0
}

const writeNullTerminatedUtf8 = (buffer: ArrayBuffer, offset: number, size: number, text: string): void => {
  const view = new Uint8Array(buffer, offset, size)
  view.fill(0)
  const data = new TextEncoder().encode(text)
  const length = Math.min(data.length, size - 1)
  view.set(data.subarray(0, length), 0)
  view[length] = 0
}

const writeFilled = (buffer: ArrayBuffer, offset: number, size: number, byte: number): void => {
  const view = new Uint8Array(buffer, offset, size)
  view.fill(byte)
}

const createExports = (pointers: { logPtr: number; errorPtr: number; inputPtr: number; outputPtr: number }): ExportBase => {
  return {
    getLogPtr: vi.fn(() => pointers.logPtr),
    getErrorPtr: vi.fn(() => pointers.errorPtr),
    allocateInputChannel: vi.fn(() => pointers.inputPtr),
    allocateOutputChannel: vi.fn(() => pointers.outputPtr),
  }
}

const createInstantiateMock = (exports: ExportBase, onImports?: (imports: WebAssembly.Imports) => void) => {
  return (vi.spyOn(WebAssembly, 'instantiate') as unknown as {
    mockImplementation: (
      fn: (buffer: BufferSource | WebAssembly.Module, imports?: WebAssembly.Imports) => Promise<WebAssembly.WebAssemblyInstantiatedSource>,
    ) => ReturnType<typeof vi.spyOn>
  }).mockImplementation(async (_buffer, imports) => {
    const safeImports = imports ?? {}
    onImports?.(safeImports)
    return {
      instance: { exports } as WebAssembly.Instance,
      module: {} as WebAssembly.Module,
    }
  })
}

describe('interop.createInstance', () => {
  test('Given有效options与导出函数 When创建实例 Then返回完整实例并可写入日志', async () => {
    const givenLog = vi.fn()
    const givenOptions = createOptions({ log: givenLog })
    const givenPointers = { logPtr: 0, errorPtr: 256, inputPtr: 512, outputPtr: 1024 }
    const givenExports = createExports(givenPointers)
    let capturedImports: WebAssembly.Imports | undefined
    const instantiateMock = createInstantiateMock(givenExports, imports => {
      capturedImports = imports
    })
    const givenWasmBuffer = Buffer.from([0, 97, 115, 109])

    const whenInstance = await createInstance(givenWasmBuffer, givenOptions)

    expectTypeOf(whenInstance.getMemory()).toEqualTypeOf<ArrayBuffer>()
    expectTypeOf(whenInstance.getBytes()).toEqualTypeOf<Uint8ClampedArray>()
    expectTypeOf(whenInstance.getInput()).toEqualTypeOf<Writer>()
    expectTypeOf(whenInstance.getOutput()).toEqualTypeOf<Reader>()
    expectTypeOf(whenInstance.bind).toBeFunction()
    expect(whenInstance.getSize()).toBe(whenInstance.getMemory().byteLength)
    expect(whenInstance.exports).toBe(givenExports)
    expect(givenExports.getLogPtr).toHaveBeenCalledTimes(1)
    expect(givenExports.getErrorPtr).toHaveBeenCalledTimes(1)
    expect(givenExports.allocateInputChannel).toHaveBeenCalledWith(givenOptions.inputChannelSize)
    expect(givenExports.allocateOutputChannel).toHaveBeenCalledWith(givenOptions.outputChannelSize)

    const whenMemoryBuffer = whenInstance.getMemory()
    writeNullTerminated(whenMemoryBuffer, givenPointers.logPtr, MAX_LOG_SIZE, 'log-message')
    if (capturedImports?.env && typeof capturedImports.env === 'object') {
      const hostLog = (capturedImports.env as { hostLog?: () => void }).hostLog
      hostLog?.()
    }
    expect(givenLog).toHaveBeenCalledWith('log-message')

    instantiateMock.mockRestore()
  })

  test('Given日志缓冲无终止符 When触发日志 Then读取全部缓冲内容', async () => {
    const givenLog = vi.fn()
    const givenOptions = createOptions({ log: givenLog })
    const givenPointers = { logPtr: 0, errorPtr: 256, inputPtr: 512, outputPtr: 1024 }
    const givenExports = createExports(givenPointers)
    let capturedImports: WebAssembly.Imports | undefined
    const instantiateMock = createInstantiateMock(givenExports, imports => {
      capturedImports = imports
    })
    const givenWasmBuffer = Buffer.from([0, 97, 115, 109])

    const whenInstance = await createInstance(givenWasmBuffer, givenOptions)
    writeFilled(whenInstance.getMemory(), givenPointers.logPtr, MAX_LOG_SIZE, 97)
    if (capturedImports?.env && typeof capturedImports.env === 'object') {
      const hostLog = (capturedImports.env as { hostLog?: () => void }).hostLog
      hostLog?.()
    }

    const thenMessage = givenLog.mock.calls[0]?.[0] as string
    expect(thenMessage.length).toBe(MAX_LOG_SIZE)

    instantiateMock.mockRestore()
  })

  test('Given相同buffer When多次createView Then缓存实例并在buffer变化时刷新', async () => {
    const givenOptions = createOptions()
    const givenPointers = { logPtr: 0, errorPtr: 256, inputPtr: 512, outputPtr: 1024 }
    const givenExports = createExports(givenPointers)
    let capturedMemory: WebAssembly.Memory | undefined
    const instantiateMock = createInstantiateMock(givenExports, imports => {
      const env = imports.env as { memory?: WebAssembly.Memory }
      capturedMemory = env.memory
    })
    const givenWasmBuffer = Buffer.from([0, 97, 115, 109])

    const whenInstance = await createInstance(givenWasmBuffer, givenOptions)
    const whenGetView = whenInstance.createView(buffer => ({ buffer }))
    const thenFirst = whenGetView()
    const thenSecond = whenGetView()
    expect(thenFirst).toBe(thenSecond)

    expect(capturedMemory).toBeDefined()
    capturedMemory!.grow(1)
    const thenThird = whenGetView()
    expect(thenThird).not.toBe(thenFirst)

    instantiateMock.mockRestore()
  })

  test('Given正常返回码 WhenhandleError执行 Then不抛出异常', async () => {
    const givenOptions = createOptions()
    const givenPointers = { logPtr: 0, errorPtr: 256, inputPtr: 512, outputPtr: 1024 }
    const givenExports = createExports(givenPointers)
    const instantiateMock = createInstantiateMock(givenExports)
    const givenWasmBuffer = Buffer.from([0, 97, 115, 109])
    const whenInstance = await createInstance(givenWasmBuffer, givenOptions)

    expect(() => whenInstance.handleError(() => 0)).not.toThrow()

    instantiateMock.mockRestore()
  })

  test('Given错误消息与非零返回码 WhenhandleError执行 Then抛出错误消息', async () => {
    const givenOptions = createOptions()
    const givenPointers = { logPtr: 0, errorPtr: 256, inputPtr: 512, outputPtr: 1024 }
    const givenExports = createExports(givenPointers)
    const instantiateMock = createInstantiateMock(givenExports)
    const givenWasmBuffer = Buffer.from([0, 97, 115, 109])
    const whenInstance = await createInstance(givenWasmBuffer, givenOptions)
    writeNullTerminated(whenInstance.getMemory(), givenPointers.errorPtr, MAX_ERROR_SIZE, 'bad')

    expect(() => whenInstance.handleError(() => 1)).toThrowError('bad')

    instantiateMock.mockRestore()
  })

  test('Given空错误缓冲且函数抛出异常 WhenhandleError执行 Then抛出原始异常', async () => {
    const givenOptions = createOptions()
    const givenPointers = { logPtr: 0, errorPtr: 256, inputPtr: 512, outputPtr: 1024 }
    const givenExports = createExports(givenPointers)
    const instantiateMock = createInstantiateMock(givenExports)
    const givenWasmBuffer = Buffer.from([0, 97, 115, 109])
    const whenInstance = await createInstance(givenWasmBuffer, givenOptions)
    writeNullTerminated(whenInstance.getMemory(), givenPointers.errorPtr, MAX_ERROR_SIZE, '')
    const givenError = new Error('boom')

    expect(() => whenInstance.handleError(() => {
      throw givenError
    })).toThrowError(givenError)

    instantiateMock.mockRestore()
  })

  test('Given空错误缓冲且非零返回码 WhenhandleError执行 Then抛出未知错误', async () => {
    const givenOptions = createOptions()
    const givenPointers = { logPtr: 0, errorPtr: 256, inputPtr: 512, outputPtr: 1024 }
    const givenExports = createExports(givenPointers)
    const instantiateMock = createInstantiateMock(givenExports)
    const givenWasmBuffer = Buffer.from([0, 97, 115, 109])
    const whenInstance = await createInstance(givenWasmBuffer, givenOptions)
    writeNullTerminated(whenInstance.getMemory(), givenPointers.errorPtr, MAX_ERROR_SIZE, '')

    expect(() => whenInstance.handleError(() => 1)).toThrowError('Unknown error')

    instantiateMock.mockRestore()
  })

  test('Given错误缓冲无终止符 WhenhandleError执行 Then抛出完整错误信息', async () => {
    const givenOptions = createOptions()
    const givenPointers = { logPtr: 0, errorPtr: 256, inputPtr: 512, outputPtr: 1024 }
    const givenExports = createExports(givenPointers)
    const instantiateMock = createInstantiateMock(givenExports)
    const givenWasmBuffer = Buffer.from([0, 97, 115, 109])
    const whenInstance = await createInstance(givenWasmBuffer, givenOptions)
    writeFilled(whenInstance.getMemory(), givenPointers.errorPtr, MAX_ERROR_SIZE, 98)

    let thrown: Error | undefined
    try {
      whenInstance.handleError(() => 1)
    } catch (error) {
      thrown = error as Error
    }
    expect(thrown?.message.length).toBe(MAX_ERROR_SIZE)

    instantiateMock.mockRestore()
  })

  test('Given超大通道大小 When获取通道 Then返回可用通道', async () => {
    const givenOptions = createOptions({ inputChannelSize: 128 * 1024, outputChannelSize: 128 * 1024 })
    const givenPointers = { logPtr: 0, errorPtr: 256, inputPtr: 512, outputPtr: 1024 }
    const givenExports = createExports(givenPointers)
    const instantiateMock = createInstantiateMock(givenExports)
    const givenWasmBuffer = Buffer.from([0, 97, 115, 109])

    const whenInstance = await createInstance(givenWasmBuffer, givenOptions)
    expect(whenInstance.getInput()).toBeInstanceOf(Writer)

    instantiateMock.mockRestore()
  })

  test('Given大数组输入 When执行导出函数 Then完成端到端通道读写', async () => {
    const inputChannelSize = 1024
    const outputChannelSize = 1024
    const givenOptions = createOptions({ inputChannelSize, outputChannelSize })
    const givenPointers = { logPtr: 0, errorPtr: 256, inputPtr: 512, outputPtr: 2048 }
    const givenExports = createExports(givenPointers) as ExportBase & { doWork: () => ZawReturn }
    const instantiateMock = createInstantiateMock(givenExports)
    const givenWasmBuffer = Buffer.from([0, 97, 115, 109])
    const whenInstance = await createInstance(givenWasmBuffer, givenOptions)

    givenExports.doWork = () => {
      const input = new Reader(whenInstance.getMemory(), givenPointers.inputPtr, inputChannelSize)
      const output = new Writer(whenInstance.getMemory(), givenPointers.outputPtr, outputChannelSize)
      const value = input.readUint8Array()
      output.copyUint8Array(value)
      return 0 as ZawReturn
    }

    const input = whenInstance.getInput()
    const payload = new Uint8Array(Array.from({ length: 512 }, (_, i) => i % 256))
    input.copyUint8Array(payload)
    whenInstance.handleError(givenExports.doWork)

    const output = whenInstance.getOutput()
    const whenValue = output.readUint8Array()
    expect(Array.from(whenValue)).toEqual(Array.from(payload))

    instantiateMock.mockRestore()
  })

  test('Given输入通道写入 When重复获取输入通道 Then偏移重置并覆盖写入', async () => {
    const givenOptions = createOptions()
    const givenPointers = { logPtr: 0, errorPtr: 256, inputPtr: 512, outputPtr: 1024 }
    const givenExports = createExports(givenPointers)
    const instantiateMock = createInstantiateMock(givenExports)
    const givenWasmBuffer = Buffer.from([0, 97, 115, 109])
    const whenInstance = await createInstance(givenWasmBuffer, givenOptions)

    const whenInput1 = whenInstance.getInput()
    whenInput1.writeUint8(7)
    const whenInput2 = whenInstance.getInput()
    whenInput2.writeUint8(9)
    const thenBytes = whenInstance.getBytes()
    expect(thenBytes[givenPointers.inputPtr]).toBe(9)

    instantiateMock.mockRestore()
  })

  test('Given绑定函数 When执行绑定 Then完成读写与错误处理流程', async () => {
    const givenOptions = createOptions()
    const givenPointers = { logPtr: 0, errorPtr: 256, inputPtr: 512, outputPtr: 1024 }
    const givenExports = createExports(givenPointers) as ExportBase & { doWork: () => ZawReturn }
    const instantiateMock = createInstantiateMock(givenExports)
    const givenWasmBuffer = Buffer.from([0, 97, 115, 109])
    const whenInstance = await createInstance(givenWasmBuffer, givenOptions)

    const func = vi.fn(() => {
      const writer = new Writer(whenInstance.getMemory(), givenPointers.outputPtr, givenOptions.outputChannelSize)
      writer.writeUint32(11)
      return 0 as ZawReturn
    })
    const write = vi.fn((input: Writer, value: number) => {
      input.writeUint32(value)
    })
    const read = vi.fn((output: Reader, value: number) => {
      return output.readUint32() + value
    })
    const whenBound = whenInstance.bind(func, write, read)
    const thenResult = whenBound(5)

    expect(thenResult).toBe(16)
    expect(func).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledTimes(1)

    instantiateMock.mockRestore()
  })

  test('Given自定义imports When创建实例 Then透传wasi并合并env', async () => {
    const givenOptions = createOptions({
      imports: {
        wasi_snapshot_preview1: { fd_write: vi.fn() },
        env: { foo: 1 },
      },
    })
    const givenPointers = { logPtr: 0, errorPtr: 256, inputPtr: 512, outputPtr: 1024 }
    const givenExports = createExports(givenPointers)
    let capturedImports: WebAssembly.Imports | undefined
    const instantiateMock = createInstantiateMock(givenExports, imports => {
      capturedImports = imports
    })
    const givenWasmBuffer = new Uint8Array([0, 97, 115, 109])

    await createInstance(givenWasmBuffer, givenOptions)

    expect(capturedImports?.wasi_snapshot_preview1).toBe(givenOptions.imports?.wasi_snapshot_preview1)
    expect((capturedImports?.env as { foo?: number }).foo).toBe(1)
    expect((capturedImports?.env as { memory?: WebAssembly.Memory }).memory).toBeInstanceOf(WebAssembly.Memory)

    instantiateMock.mockRestore()
  })

  test('Given通道指针超出内存 When创建实例 Then扩容内存', async () => {
    const memory = new WebAssembly.Memory({ initial: 1 })
    const growSpy = vi.spyOn(memory, 'grow')
    const givenOptions = createOptions({ memory })
    const givenPointers = { logPtr: 0, errorPtr: 256, inputPtr: 70000, outputPtr: 120000 }
    const givenExports = createExports(givenPointers)
    const instantiateMock = createInstantiateMock(givenExports)
    const givenWasmBuffer = new Uint8Array([0, 97, 115, 109])

    await createInstance(givenWasmBuffer, givenOptions)

    expect(growSpy).toHaveBeenCalled()
    instantiateMock.mockRestore()
  })

  test.sequential('Given浏览器环境 When触发日志与错误 Then不依赖Buffer', async () => {
    const originalBuffer = (globalThis as { Buffer?: typeof Buffer }).Buffer
    ;(globalThis as { Buffer?: typeof Buffer }).Buffer = undefined
    const givenLog = vi.fn()
    const givenOptions = createOptions({ log: givenLog })
    const givenPointers = { logPtr: 0, errorPtr: 256, inputPtr: 512, outputPtr: 1024 }
    const givenExports = createExports(givenPointers)
    let capturedImports: WebAssembly.Imports | undefined
    const instantiateMock = createInstantiateMock(givenExports, imports => {
      capturedImports = imports
    })
    const givenWasmBuffer = new Uint8Array([0, 97, 115, 109])

    try {
      const whenInstance = await createInstance(givenWasmBuffer, givenOptions)
      writeNullTerminatedUtf8(whenInstance.getMemory(), givenPointers.logPtr, MAX_LOG_SIZE, 'log-message')
      if (capturedImports?.env && typeof capturedImports.env === 'object') {
        const hostLog = (capturedImports.env as { hostLog?: () => void }).hostLog
        hostLog?.()
      }
      expect(givenLog).toHaveBeenCalledWith('log-message')
      writeNullTerminatedUtf8(whenInstance.getMemory(), givenPointers.errorPtr, MAX_ERROR_SIZE, 'boom')
      expect(() => whenInstance.handleError(() => 1)).toThrowError('boom')
    } finally {
      ;(globalThis as { Buffer?: typeof Buffer }).Buffer = originalBuffer
    }

    instantiateMock.mockRestore()
  })
})
