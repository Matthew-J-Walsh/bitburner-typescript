import { NS, Server, ScriptArg } from '@ns';
import { HackingUtilityModule } from '/hacking/hackingUtilityModule';
import {
    Time,
    Threads,
    HackScriptType,
    ScriptType,
    scriptMapping,
    coreEffectedScripts,
    ActiveScript,
} from '/hacking/constants';
import { ServerUtilityModule } from '/hacking/serverUtilityModule';
import { RamTaskManager, FillerRamTask } from 'hacking/ramTaskManager';
import { HackingRamTask } from '/hacking/hackingRamTask';
import { RamUsageSubmodule } from '/hacking/ramUsageSubmodule';
import { LoggingUtility } from '/lib/loggingUtils';

/**
 * ### HackingSchedulerModule Uniqueness
 * This module implements the hacking strategy
 */
export class HackingSchedulerModule extends RamUsageSubmodule {
    /** Subtasks that handle their own scheduling */
    taskList: Array<RamTaskManager> = [];
    /** Logger */
    logger!: LoggingUtility;

    constructor(
        protected ns: NS,
        protected serverUtilityModule: ServerUtilityModule,
        protected hackingUtilityModule: HackingUtilityModule,
    ) {
        super(ns, serverUtilityModule);

        this.logger = new LoggingUtility(
            ns,
            'hackingSchedluer',
            this.log.bind(this),
        );

        this.taskList = [
            new HackingRamTask(
                ns,
                (
                    target: string,
                    script: HackScriptType,
                    threads: Threads,
                    delay: Time,
                    endTime: Time,
                ) => this.fire(target, script, threads, delay, endTime),
                (target: string, threads: Threads) =>
                    this.fill('weakenLooped', threads, 0, target),
                this.kill.bind(this),
                (reason: string) =>
                    this.ns.tprint(
                        `Miss on Money Making for reason: ${reason}`,
                    ),
                hackingUtilityModule.moneyEvaluation,
            ),
            new HackingRamTask(
                ns,
                (
                    target: string,
                    script: HackScriptType,
                    threads: Threads,
                    delay: Time,
                    endTime: Time,
                ) => this.fire(target, script, threads, delay, endTime),
                (target: string, threads: Threads) =>
                    this.fill('weakenLooped', threads, 0, target),
                this.kill.bind(this),
                (reason: string) =>
                    this.ns.tprint(`Miss on Exp Gen for reason: ${reason}`),
                hackingUtilityModule.expEvaluation,
            ),
            new FillerRamTask(
                ns,
                scriptMapping.share,
                (threads: Threads) => this.fill('share', threads, 1),
                this.kill.bind(this),
                () => hackingUtilityModule.shareRam,
            ),
        ];
    }

    /**
     * Fires off a priority script with a particular amount of threads
     * @param target Target server of the script
     * @param script Script to run
     * @param threads Number of threads to spawn
     * @param delay Internal to impose on fired script
     * @param endTime Earliest end time for fired script
     * @param args any additional args
     * @returns pid
     */
    private fire(
        target: string,
        script: HackScriptType,
        threads: Threads,
        delay: Time,
        endTime: Time,
        ...args: ScriptArg[]
    ): number {
        const coreEffected = coreEffectedScripts.includes(script);
        const neededRam = this.ns.getScriptRam(scriptMapping[script]) * threads;
        const server = this.requestSingleRam(neededRam, coreEffected);
        if (server) {
            if (coreEffected)
                threads = Math.ceil(threads / (1 + (server.cpuCores - 1) / 16));
            const pid = this.ns.exec(
                scriptMapping[script],
                server.hostname,
                threads,
                target,
                delay,
                endTime,
                ...args,
            );
            if (pid === 0) {
                this.ns.tprint(
                    `Fire failed after aquiring server: ${scriptMapping[script]}, ${server.hostname}, ${threads}, ${target}`,
                );
                return 0;
            }
            this.pushActiveScipt({
                hostname: server.hostname,
                threads: threads,
                ramUsage: neededRam,
                endTime: endTime,
                pid: pid,
            });

            return pid;
        } else {
            //throw new Error('Fuckass');
            return 0;
        }
    }

    /**
     * Fills a specified amount of ram with
     * @param script script to run
     * @param neededThreads total number of threads needed
     * @param priority priority number of the fill
     * @param args any additional args
     */
    private fill(
        script: ScriptType,
        neededThreads: Threads,
        priority: number,
        ...args: ScriptArg[]
    ): ActiveScript[] {
        const filename = scriptMapping[script];
        const ramPerThread = this.ns.getScriptRam(filename);
        const newPids: Array<ActiveScript> = [];

        for (let hostname of this.serverUtilityModule.ourHostnames) {
            if (neededThreads === 0) {
                break;
            }
            const server = this.serverUtilityModule.ourServers.get(hostname)!;

            for (let i = priority + 1; i < this.taskList.length; i++) {
                this.taskList[i].freeServer(server);
            }

            if (
                server.maxRam - this.ns.getServerUsedRam(hostname) <=
                ramPerThread
            )
                continue;

            neededThreads += this.taskList[priority].freeServer(server);

            const threads = Math.min(
                Math.floor(
                    (server.maxRam - this.ns.getServerUsedRam(hostname)) /
                        ramPerThread,
                ),
                neededThreads,
            );

            if (threads === 0) continue;

            //this.ns.tprint(`${filename}, ${hostname}, ${threads}, ${args}`);
            const pid = this.ns.exec(filename, hostname, threads, ...args);
            if (pid === 0) {
                this.ns.tprint(
                    `Fill failed on an open server: ${filename}, ${hostname}, ${threads}, ${args}, ${server.maxRam} - ${this.ns.getServerUsedRam(hostname)}`,
                );
                continue;
            }

            const ascript = {
                hostname: hostname,
                threads: threads,
                ramUsage: threads * ramPerThread,
                endTime: Infinity,
                pid: pid,
            };
            newPids.push(ascript);

            // We need to push this as an active script as we cannot cancel it if this is a hacking script
            if (priority < 2) this.pushActiveScipt(ascript);

            neededThreads -= threads;
        }
        return newPids;
    }

    /**
     * Finds or creates a server with the nessisary block of ram
     * @param neededRam Amount of ram requested
     * @param priority Always high priority
     */
    protected requestSingleRam(
        neededRam: number,
        coreEffected: boolean,
    ): Server | null {
        const result = this.priorityRamSpaceUsed.findNext(neededRam);
        if (result) {
            const server = this.serverUtilityModule.ourServers.get(
                result.hostname,
            )!;
            for (let i = 2; i < this.taskList.length; i++) {
                this.taskList[i].freeServer(server);
            }
            return server;
        }
        //throw new Error('Fuckass');
        return null;
    }

    /** Primary loop, triggers everything */
    manageActiveScripts(): Time {
        super.manageActiveScripts();
        return Math.min(...this.taskList.map((task) => task.manage()));
    }

    //@BackgroundTask(30_000)
    /** Verifies assumptions about this are true */
    public integrityCheck(): void {
        this.taskList.forEach((task) => task.integrityCheck());
        super.integrityCheck();
    }

    public log(): Record<string, any> {
        return {
            ...super.log(),
            ...this.taskList.reduce((acc, task, idx) => {
                return { ...acc, ...{ [idx]: task.log() } };
            }, {}),
        };
    }
}
