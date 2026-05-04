import { execSync } from 'node:child_process'
import * as tf from '@tensorflow/tfjs-node'
import type { ProfilePoolingMode } from '../profile/clientProfileAggregation.js'

export const ALL_POOLING_MODES: ProfilePoolingMode[] = ['mean', 'exp', 'attention_light', 'attention_learned']

function lcgNext(state: number): number {
  return (state * 1664525 + 1013904223) & 0xffffffff
}

function shuffleInPlace(arr: number[], seed: number): void {
  let state = seed
  for (let i = arr.length - 1; i > 0; i--) {
    state = lcgNext(state)
    const j = Math.abs(state) % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

export function stratifiedTrainValIndices(
  labels: number[],
  valFraction: number,
  seed: number
): { train: number[]; val: number[] } {
  const idx0: number[] = []
  const idx1: number[] = []
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === 0) idx0.push(i)
    else idx1.push(i)
  }

  function splitClass(classIdx: number[], s: number): { train: number[]; val: number[] } {
    if (classIdx.length === 0) return { train: [], val: [] }
    const sh = [...classIdx]
    shuffleInPlace(sh, s)
    if (sh.length === 1) return { train: [...sh], val: [] }
    const nVal = Math.max(1, Math.min(sh.length - 1, Math.round(sh.length * valFraction)))
    return { val: sh.slice(0, nVal), train: sh.slice(nVal) }
  }

  const a = splitClass(idx0, seed)
  const b = splitClass(idx1, seed + 1_000_003)
  return {
    train: [...a.train, ...b.train],
    val: [...a.val, ...b.val],
  }
}

export function tryGitHead(candidates: string[]): string | null {
  for (const cwd of candidates) {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8', cwd }).trim()
    } catch {
      /* try next */
    }
  }
  return null
}

export function readValLogs(logs: tf.Logs | undefined): { valLoss: number | undefined; valAcc: number | undefined } {
  if (!logs) return { valLoss: undefined, valAcc: undefined }
  const valLoss = typeof logs.val_loss === 'number' ? logs.val_loss : undefined
  const valAccRaw = logs.val_acc ?? logs.val_accuracy
  const valAcc = typeof valAccRaw === 'number' ? valAccRaw : undefined
  return { valLoss, valAcc }
}
