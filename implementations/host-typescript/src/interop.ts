import { Reader, Writer } from './conduit'
import { DEFAULT_INITIAL_PAGES, MAX_ERROR_SIZE, MAX_LOG_SIZE, PAGE_SIZE } from './constants'
import { generateBinding } from './binding'
import type { ZawReturn } from './types'

export type InstanceOptions = {
  inputChannelSize: number
  outputChannelSize: number
  initialMemoryPages?: number
  imports?: WebAssembly.Imports
  memory?: WebAssembly.Memory
  log?: (message: string) => void
}

export type ExportBase = Record<string, () => number> & {
  getLogPtr: () => number
  getErrorPtr: () => number
  allocateInputChannel: (sizeInBytes: number) => number
  allocateOutputChannel: (sizeInBytes: number) => number
}

export type BindingFactory = <Args extends unknown[], Result>(
  func: () => ZawReturn,
  write: (input: Writer, ...args: Args) => void,
  read: (output: Reader, ...args: Args) => Result,
) => (...args: Args) => Result

export type Instance<T extends Record<string, unknown>> = {
  getMemory: () => ArrayBuffer
  getBytes: () => Uint8ClampedArray
  exports: ExportBase & T
  createView: <T>(init: (buffer: ArrayBuffer) => T) => () => T
  getInput: () => Writer
  getOutput: () => Reader
  handleError: (func: () => number) => void
  getSize: () => number
  bind: BindingFactory
}

export async function createInstance<T extends Record<string, unknown>>(
  wasmBuffer: BufferSource,
  options: InstanceOptions,
): Promise<Instance<T>> {
  const {
    inputChannelSize,
    outputChannelSize,
    initialMemoryPages = DEFAULT_INITIAL_PAGES,
    log = console.log.bind(console),
    imports,
    memory: providedMemory,
  } = options
  let memory = providedMemory ?? new WebAssembly.Memory({ initial: initialMemoryPages })
  const baseImports = imports ?? {}
  const env = {
    ...(baseImports.env ?? {}),
    memory,
    hostLog: () => {
      hostLog() // has to be hoisted
    },
  }
  const finalImports = { ...baseImports, env }

  const { instance } = await WebAssembly.instantiate(wasmBuffer, finalImports)

  const exports = instance.exports as ExportBase & T
  const exportedMemory = (instance.exports as any).memory as WebAssembly.Memory | undefined
  if (exportedMemory && exportedMemory !== memory) {
    memory = exportedMemory
  }

  const createView = <T>(createFunc: (buffer: ArrayBuffer) => T): (() => T) => {
    let buffer: ArrayBuffer
    let instance: T

    return () => {
      if (instance === undefined || memory.buffer !== buffer) {
        buffer = memory.buffer
        instance = createFunc(buffer)
      }

      return instance
    }
  }

  const logPtr = exports.getLogPtr()
  const errPtr = exports.getErrorPtr()
  const inputPtr = exports.allocateInputChannel(inputChannelSize)
  const outputPtr = exports.allocateOutputChannel(outputChannelSize)
  const requiredBytes = Math.max(
    inputPtr + inputChannelSize,
    outputPtr + outputChannelSize,
    logPtr + MAX_LOG_SIZE,
    errPtr + MAX_ERROR_SIZE,
  )
  if (memory.buffer.byteLength < requiredBytes) {
    const delta = requiredBytes - memory.buffer.byteLength
    const additionalPages = Math.ceil(delta / PAGE_SIZE)
    if (additionalPages > 0) {
      memory.grow(additionalPages)
    }
  }

  const getBytes = createView(buffer => new Uint8ClampedArray(buffer))
  const getLogData = createView(buffer => new Uint8ClampedArray(buffer, logPtr, MAX_LOG_SIZE))
  const getErrorData = createView(buffer => new Uint8ClampedArray(buffer, errPtr, MAX_ERROR_SIZE))
  const getInputChannel = createView(buffer => new Writer(buffer, inputPtr, inputChannelSize))
  const getOutputChannel = createView(buffer => new Reader(buffer, outputPtr, outputChannelSize))

  const decoder = new TextDecoder()
  const hostLog = (): void => {
    const data = getLogData()
    const length = data.indexOf(0)
    const messageLength = length === -1 ? data.length : length
    const message = decoder.decode(data.subarray(0, messageLength))

    log(message)
  }

  const throwWasmError = (e?: Error): void => {
    const data = getErrorData()
    const length = data.indexOf(0)
    const messageLength = length === -1 ? data.length : length

    if (messageLength > 0) {
      const message = decoder.decode(data.subarray(0, messageLength))

      throw Error(message)
    } else if (e !== undefined) {
      throw e
    } else {
      throw Error('Unknown error')
    }
  }

  const handleError = (func: () => number): void => {
    let result

    try {
      result = func()
    } catch (e) {
      throwWasmError(e as Error)
    }

    if (result !== 0) {
      throwWasmError()
    }
  }

  const getInput = (): Writer => {
    const input = getInputChannel()

    input.reset()

    return input
  }

  const getOutput = (): Reader => {
    const input = getOutputChannel()

    input.reset()

    return input
  }

  const bind: BindingFactory = <T extends unknown[], R>(
    func: () => ZawReturn,
    write: (input: Writer, ...args: T) => void,
    read: (output: Reader, ...args: T) => R,
  ) => generateBinding(func, write, read, getInput, getOutput, handleError)

  return {
    exports,
    getMemory: () => memory.buffer,
    getSize: () => memory.buffer.byteLength,
    createView,
    getBytes,
    getInput,
    getOutput,
    handleError,
    bind,
  }
}
