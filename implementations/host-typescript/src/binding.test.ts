import { describe, test, expect, vi, expectTypeOf } from 'vitest'
import { generateBinding } from './binding'
import { Reader, Writer } from './conduit'
import type { ZawReturn } from './types'

const createChannels = () => {
  const buffer = new ArrayBuffer(128)
  const input = new Writer(buffer, 0, 64)
  const output = new Reader(buffer, 64, 64)
  return { buffer, input, output }
}

const createBindingDeps = () => {
  const { buffer, input, output } = createChannels()
  const getInput = vi.fn(() => {
    input.reset()
    return input
  })
  const getOutput = vi.fn(() => {
    output.reset()
    return output
  })
  const handleError = vi.fn((func: () => ZawReturn) => {
    func()
  })
  return { buffer, getInput, getOutput, handleError }
}

describe('binding.generateBinding', () => {
  test('Given单入参单出参 When生成绑定并调用 Then完成读写与错误处理', () => {
    const givenDeps = createBindingDeps()
    const givenFunc = vi.fn(() => {
      const writer = new Writer(givenDeps.buffer, 64, 64)
      writer.writeUint32(7)
      return 0 as ZawReturn
    })
    const givenWrite = vi.fn((input: Writer, value: number) => {
      input.writeUint32(value)
    })
    const givenRead = vi.fn((output: Reader, value: number) => {
      return output.readUint32() + value
    })

    const whenBinding = generateBinding(givenFunc, givenWrite, givenRead, givenDeps.getInput, givenDeps.getOutput, givenDeps.handleError)
    const thenResult = whenBinding(5)

    expectTypeOf(whenBinding).toBeFunction()
    expect(thenResult).toBe(12)
    expect(givenDeps.getInput).toHaveBeenCalledTimes(1)
    expect(givenDeps.getOutput).toHaveBeenCalledTimes(1)
    expect(givenDeps.handleError).toHaveBeenCalledTimes(1)
    expect(givenWrite).toHaveBeenCalledTimes(1)
    expect(givenRead).toHaveBeenCalledTimes(1)
  })

  test('Given无入参与无出参 When生成绑定并调用 Then仅执行流程', () => {
    const givenDeps = createBindingDeps()
    const givenFunc = vi.fn(() => {
      const writer = new Writer(givenDeps.buffer, 64, 64)
      writer.writeUint32(3)
      return 0 as ZawReturn
    })
    const givenWrite = vi.fn((input: Writer) => {
      input.writeUint8(1)
    })
    const givenRead = vi.fn((output: Reader) => output.readUint32())

    const whenBinding = generateBinding(givenFunc, givenWrite, givenRead, givenDeps.getInput, givenDeps.getOutput, givenDeps.handleError)
    const thenResult = whenBinding()

    expect(thenResult).toBe(3)
    expect(givenWrite).toHaveBeenCalledTimes(1)
    expect(givenRead).toHaveBeenCalledTimes(1)
  })

  test('Given入参为零但读函数期望参数 When生成绑定并调用 Then未提供参数并返回默认结果', () => {
    const givenDeps = createBindingDeps()
    const givenFunc = vi.fn(() => {
      const writer = new Writer(givenDeps.buffer, 64, 64)
      writer.writeUint32(4)
      return 0 as ZawReturn
    })
    const givenWrite = vi.fn((input: Writer) => {
      input.writeUint8(2)
    })
    const givenRead = vi.fn((output: Reader, value?: number) => {
      const actual = value ?? 0
      return output.readUint32() + actual
    }) as unknown as (output: Reader) => number

    const whenBinding = generateBinding(givenFunc, givenWrite, givenRead, givenDeps.getInput, givenDeps.getOutput, givenDeps.handleError)
    const thenResult = whenBinding()

    expect(thenResult).toBe(4)
    expect(givenRead).toHaveBeenCalledTimes(1)
  })

  test('Given不同参数计数组合 When多次生成绑定 Then每个绑定可独立运行', () => {
    const givenDepsA = createBindingDeps()
    const givenDepsB = createBindingDeps()
    const givenFuncA = vi.fn(() => {
      const writer = new Writer(givenDepsA.buffer, 64, 64)
      writer.writeUint32(8)
      return 0 as ZawReturn
    })
    const givenFuncB = vi.fn(() => {
      const writer = new Writer(givenDepsB.buffer, 64, 64)
      writer.writeUint32(9)
      return 0 as ZawReturn
    })
    const givenWriteA = vi.fn((input: Writer, value: number) => {
      input.writeUint32(value)
    })
    const givenWriteB = vi.fn((input: Writer, value: number, extra: number) => {
      input.writeUint32(value + extra)
    })
    const givenReadA = vi.fn((output: Reader, value: number) => output.readUint32() + value)
    const givenReadB = vi.fn((output: Reader, value: number) => output.readUint32() + value)

    const whenBindingA = generateBinding(givenFuncA, givenWriteA, givenReadA, givenDepsA.getInput, givenDepsA.getOutput, givenDepsA.handleError)
    const whenBindingB = generateBinding(givenFuncB, givenWriteB, givenReadB, givenDepsB.getInput, givenDepsB.getOutput, givenDepsB.handleError)
    const thenResultA = whenBindingA(2)
    const thenResultB = whenBindingB(2, 3)

    expect(thenResultA).toBe(10)
    expect(thenResultB).toBe(11)
  })
})
