// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { WebTimer } from '../src/index.js';

afterEach(() => vi.useRealTimers());

it('starts, loops, restarts, changes interval and stops without duplicate schedules', () => {
  vi.useFakeTimers();
  const timer = new WebTimer({ time: 100 });
  const ticks: number[] = [];
  timer.onTimer = (sender) => {
    ticks.push(sender.tickCount);
  };
  vi.advanceTimersByTime(500);
  expect(ticks).toEqual([]);
  timer.Start();
  timer.Start();
  vi.advanceTimersByTime(250);
  expect(ticks).toEqual([1, 2]);
  timer.time = 200;
  vi.advanceTimersByTime(199);
  expect(ticks).toHaveLength(2);
  vi.advanceTimersByTime(1);
  expect(ticks).toEqual([1, 2, 3]);
  timer.Restart();
  vi.advanceTimersByTime(200);
  expect(ticks).toEqual([1, 2, 3, 1]);
  timer.enabled = false;
  vi.advanceTimersByTime(1000);
  expect(ticks).toHaveLength(4);
  timer.dispose();
  expect(vi.getTimerCount()).toBe(0);
});

it('fires once with typed detail, supports stopping inside a handler and silent disposal', () => {
  vi.useFakeTimers();
  const timer = new WebTimer({ time: 10, loop: false, enabled: true });
  const events: string[] = [];
  timer.onTimer = (sender, event) => {
    events.push(`tick:${String((event as CustomEvent<{ tick: number }>).detail.tick)}`);
    expect(sender.enabled).toBe(false);
  };
  timer.onStop = () => {
    events.push('stop');
  };
  vi.advanceTimersByTime(100);
  expect(events).toEqual(['tick:1', 'stop']);
  timer.loop = true;
  timer.onTimer = (sender) => sender.Stop();
  timer.Start();
  vi.advanceTimersByTime(100);
  expect(timer.enabled).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  timer.Start();
  timer.dispose();
  timer.Start();
  expect(vi.getTimerCount()).toBe(0);
});

it.each([0, -1, NaN, Infinity, 1.5, 2147483648])('rejects invalid time %s', (time) => {
  expect(() => new WebTimer({ time })).toThrow(RangeError);
});

it('delivers initial OnStart after scope binding and cancels it when stopped or disposed', async () => {
  vi.useFakeTimers();
  const start = vi.fn();
  const timer = new WebTimer({ enabled: true });
  timer.onStart = start;
  await Promise.resolve();
  expect(start).toHaveBeenCalledOnce();
  timer.dispose();
  const stopped = new WebTimer({ enabled: true });
  stopped.onStart = start;
  stopped.Stop();
  await Promise.resolve();
  expect(start).toHaveBeenCalledOnce();
  stopped.dispose();
});

it('does not emit a stale single-run stop when its handler starts and stops a new run', () => {
  vi.useFakeTimers();
  const timer = new WebTimer({ time: 1, loop: false });
  const stop = vi.fn();
  timer.onStop = stop;
  timer.onTimer = (sender) => {
    sender.Start();
    sender.Stop();
  };
  timer.Start();
  vi.advanceTimersByTime(1);
  expect(stop).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  timer.dispose();
});
