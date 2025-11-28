interface StateInterval<T> {
    // Earliest possible time this state starts
    startMin: number;

    // Latest possible time this state is guaranteed to have started
    startMax: number;

    // The state during that interval
    state: T;
}

export class IntervalTimeline<T> {
    public intervals: StateInterval<T>[] = [];

    constructor(initialState: T) {
        this.intervals.push({
            startMin: Date.now(),
            startMax: Date.now(),
            state: initialState,
        });
    }

    /**
     * Append a new interval. Must be added in chronological order.
     * startMin MUST be >= previous.startMin.
     */
    addInterval(startMin: number, startMax: number, state: T): void {
        const last = this.intervals[this.intervals.length - 1];
        if (startMin < last.startMin) {
            throw new Error(
                'Intervals must be appended in chronological order',
            );
        }

        this.intervals.push({ startMin, startMax, state });
    }

    /**
     * Get the interval that is currently active at time `t`.
     * Returns the interval whose startMax >= t and that appears last
     * in the timeline up to time t.
     */
    getCurrentInterval(t: number = Date.now()): StateInterval<T> {
        // The active interval is the last one whose startMin <= t
        // BUT t may be earlier than startMax, so we use startMin as the discriminator.
        //
        // Example:
        //   Interval: {startMin: 0, startMax: 10}
        //   At t=5 → we are in this interval.
        //
        // We assume correctly that intervals do not overlap.
        let active = this.intervals[0];

        for (const itv of this.intervals) {
            if (itv.startMin <= t) active = itv;
            else break;
        }
        return active;
    }

    /**
     * Return the earliest time >= now where predicate(state) is GUARANTEED true.
     *
     * The guarantee time of an interval is startMax, because the state
     * *must* have begun by startMax.
     */
    nextGuaranteedTime(
        predicate: (s: T) => boolean,
        now: number = Date.now(),
    ): number | undefined {
        for (const itv of this.intervals) {
            // Entire interval starts by at most startMax.
            // If startMax < now, this interval cannot help.
            if (itv.startMax < now) continue;

            if (predicate(itv.state)) {
                // guaranteed time = startMax
                return Math.max(now, itv.startMax);
            }
        }
        return undefined;
    }

    /**
     * Returns the current guaranteed state.
     * If we are in the uncertain part of an interval (startMin <= now < startMax),
     * then returns undefined.
     */
    getGuaranteedState(now: number = Date.now()): T | undefined {
        const interval = this.getCurrentInterval(now);

        // If we are before the interval is guaranteed to have started
        // then we do NOT know the state for sure.
        if (now < interval.startMax) {
            return undefined;
        }

        // Otherwise, the state is guaranteed.
        return interval.state;
    }

    nextGuaranteedState(now: number = Date.now()): [number, T] {
        for (const entry of this.intervals) {
            // guaranteed moment is startMax
            if (entry.startMax >= now) {
                return [entry.startMax, entry.state];
            }
        }

        // If we reach the end, at worst we are guaranteed in the last state at "infinity"
        const last = this.intervals[this.intervals.length - 1];
        return [last.startMax, last.state];
    }

    /**
     * Return the next interval (after 'now') whose state MAY be true.
     * Uses startMin (earliest possible).
     */
    nextPossibleInterval(
        predicate: (s: T) => boolean,
        now: number = Date.now(),
    ): StateInterval<T> | undefined {
        for (const itv of this.intervals) {
            if (itv.startMin < now) continue;
            if (predicate(itv.state)) return itv;
        }
        return undefined;
    }

    /**
     * Prune intervals that are fully in the past:
     * intervals whose startMax ≤ now AND are not the last relevant one.
     *
     * Keeps at least 1 interval to preserve current state info.
     */
    pruneBefore(now: number = Date.now()): void {
        while (this.intervals.length > 1) {
            const first = this.intervals[0];
            const second = this.intervals[1];

            // If the NEXT interval is guaranteed to have started,
            // then the first is permanently irrelevant.
            if (second.startMax <= now) {
                this.intervals.shift();
            } else {
                break;
            }
        }
    }

    get getLast(): StateInterval<T> | undefined {
        return this.intervals[this.intervals.length - 1];
    }

    /** For debugging / visibility */
    getAllIntervals(): readonly StateInterval<T>[] {
        return this.intervals;
    }
}
