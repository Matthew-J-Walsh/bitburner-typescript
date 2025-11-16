import { NS } from '@ns';
import { ProcessID } from 'hacking/constants';
import { ActiveScript } from 'hacking/hackingBatches';
import { ServerUtilityModule } from 'hacking/serverUtilityModule';
import { BaseModule } from '/lib/baseModule';
import { KeyedMinHeap } from '/lib/keyedHeap';
import { approximatelyEqual } from '/lib/misc';
import { BackgroundTask, PriorityTask } from '/lib/scheduler';
import { SortedArray } from '/lib/sortedArray';

/** Holds the information needed to determine how much ram a server has in use by priority tasks */
type RamSpace = {
    /** Server hostname */
    hostname: string;
    /** Amount of ram that isn't consumed by a priority task */
    availableRam: number;
    /** Total amount of ram on server */
    totalRam: number;
};

/** Only submodule of hacking module, handles ram management, provides wrappers to simplify ram management for everything else */
export class RamUsageSubmodule extends BaseModule {
    /** Datastructure storing how much of each sever's ram is used by priority tasks */
    protected priorityRamSpaceUsed: SortedArray<string, RamSpace> =
        new SortedArray<string, RamSpace>(
            (item: RamSpace) => item.hostname,
            (item: RamSpace) => item.availableRam,
        );
    /** Heap of all timed scripts by end time to remove them from the priority ram space */
    private trackedScriptHeap: KeyedMinHeap<ProcessID, ActiveScript> =
        new KeyedMinHeap<ProcessID, ActiveScript>(
            (item: ActiveScript) => item.pid,
            (item: ActiveScript) => item.endTime,
        );

    constructor(
        protected ns: NS,
        protected serverUtilityModule: ServerUtilityModule,
    ) {
        super(ns);
    }

    public registerBackgroundTasks(): BackgroundTask[] {
        return [];
    }

    public registerPriorityTasks(): PriorityTask[] {
        return [];
    }

    /**
     * Updates all the server changes
     */
    update(): void {
        const thisScript = this.ns.getRunningScript()!;
        this.serverUtilityModule.ourServers.forEach((server) => {
            if (!this.priorityRamSpaceUsed.getByKey(server.hostname)) {
                if (server.hostname === thisScript.server) {
                    this.priorityRamSpaceUsed.insert({
                        hostname: server.hostname,
                        availableRam: server.maxRam - thisScript.ramUsage,
                        totalRam: server.maxRam - thisScript.ramUsage,
                    });
                } else {
                    this.priorityRamSpaceUsed.insert({
                        hostname: server.hostname,
                        availableRam: server.maxRam,
                        totalRam: server.maxRam,
                    });
                }
            } else {
                const difference =
                    server.maxRam -
                    this.priorityRamSpaceUsed.getByKey(server.hostname)!
                        .totalRam;
                if (difference != 0) {
                    this.priorityRamSpaceUsed.getByKey(
                        server.hostname,
                    )!.totalRam += difference;
                    this.priorityRamSpaceUsed.getByKey(
                        server.hostname,
                    )!.availableRam += difference;
                    this.priorityRamSpaceUsed.update(server.hostname);
                }
            }
        });
    }

    /**
     * Helper function to start tracking a new script
     * @param ascript Script to track
     */
    protected pushActiveScipt(ascript: ActiveScript): void {
        this.trackedScriptHeap.insert(ascript);
        this.priorityRamSpaceUsed.getByKey(ascript.hostname)!.availableRam -=
            ascript.ramUsage;
    }

    /**
     * Helper function to stop tracking a new script
     * @param ascript Script to remove
     */
    protected clearActiveScript(ascript: ActiveScript): void {
        this.priorityRamSpaceUsed.getByKey(ascript.hostname)!.availableRam +=
            ascript.ramUsage;
    }

    /**
     * Wrapper for kill that clears the active scripts where relevant
     * @param pid script to kill
     */
    protected kill(pid: ProcessID): void {
        //this.ns.tprint(`Killing pid: ${pid}`);
        const ascript = this.trackedScriptHeap.removeByKey(pid);
        if (ascript) {
            this.clearActiveScript(ascript);
        }
        this.ns.kill(pid);
    }

    /** Clears out finished scripts from the ram tracking */
    protected manageActiveScripts() {
        const currentTime = Date.now();
        while (
            (this.trackedScriptHeap.peek()?.endTime ?? Infinity) <=
                currentTime &&
            !this.ns.isRunning(this.trackedScriptHeap.peek()!.pid)
        ) {
            this.clearActiveScript(this.trackedScriptHeap.pop()!);
        }
    }

    /** Verifies assumptions about this are true */
    public integrityCheck(): void {
        const currentTime = Date.now();
        const thisScript = this.ns.getRunningScript()!;
        const liveScripts = this.trackedScriptHeap.toArray();
        if (
            !liveScripts.every(
                (ascript) =>
                    ascript.endTime < currentTime ||
                    this.ns.getRunningScript(ascript.pid) != null,
            )
        ) {
            throw new Error(
                "Ram Usage Submodule Integrity Error - Script Shouldn't be Dead",
            );
        }

        liveScripts.forEach((ascript) => {
            const rscript = this.ns.getRunningScript(ascript.pid);
            if (
                !(
                    rscript === null ||
                    rscript.ramUsage * rscript.threads == ascript.ramUsage
                )
            ) {
                throw new Error(
                    `Ram Usage Submodule Integrity Error - Script Has Wrong Ram Usage ${JSON.stringify(ascript)}\n Correct ram: ${rscript.ramUsage * rscript.threads}`,
                );
            }
        });
        liveScripts.forEach((ascript) => {
            const rscript = this.ns.getRunningScript(ascript.pid);
            if (!(rscript === null || rscript.server == ascript.hostname)) {
                throw new Error(
                    `Ram Usage Submodule Integrity Error - Script Has Wrong Server ${JSON.stringify(ascript)}\n Correct server: ${rscript.server}`,
                );
            }
        });

        this.priorityRamSpaceUsed.toArray().forEach((ramSpace) => {
            const maxRam = this.ns.getServerMaxRam(ramSpace.hostname);
            const usedRam = this.ns.getServerUsedRam(ramSpace.hostname);
            if (maxRam < ramSpace.totalRam) {
                throw new Error(
                    'Ram Usage Submodule Integrity Error - Too Much Ram Allowed',
                );
            }
            const expectedRamUsage = liveScripts
                .filter((ascript) => ascript.hostname == ramSpace.hostname)
                .reduce((acc, ascript) => acc + ascript.ramUsage, 0);
            if (
                !approximatelyEqual(
                    expectedRamUsage,
                    ramSpace.totalRam - ramSpace.availableRam,
                )
            ) {
                throw new Error(
                    `Ram Usage Submodule Integrity Error - RAM Usage Differential: ${expectedRamUsage},  ${ramSpace.totalRam - ramSpace.availableRam}`,
                );
            }
        });

        liveScripts.forEach((ascript) => {
            if (
                ascript.endTime < currentTime - 100 &&
                this.ns.getRunningScript(ascript.pid) != null
            ) {
                this.ns.tprint(
                    `Ram Usage Submodule Integrity Warning - Script alive too long by ${currentTime - 100 - ascript.endTime}ms`,
                );
            }
        });
    }

    public log(): Record<string, any> {
        return {
            trackedOnGoingScripts: this.trackedScriptHeap.size,
            trackedServerNumber: this.priorityRamSpaceUsed.size,
        };
    }
}
